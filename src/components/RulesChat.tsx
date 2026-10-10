import { useState, useEffect, useRef, createContext, useContext } from 'react';
import type { ComponentProps, FormEvent, MouseEvent, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { Link } from 'react-router';
import Markdown, { type Components } from 'react-markdown';
import { AiRulesIcon } from './Icons';
import { citingClause } from '../utils/citeMatch';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** A failed request's notice; never sent back as history. */
  error?: boolean;
  /**
   * For an answer, the tab it was asked on: its links are read against
   * what was sent then, not the tab on screen now.
   */
  tab?: string;
}

// Give up when the reply hasn't started, or has stalled, for this long.
const STALL_MS = 30_000;

const FAILED = 'Sorry, something went wrong. Please try again.';
const RATE_LIMITED = 'Too many questions just now. Wait a minute, then try again.';
const DAILY_LIMITED = 'The rules assistant has reached its limit for today. The rulebook still works.';
const TIMED_OUT = 'That took too long to answer. Please try again.';

/** Whether a 429 is the site-wide daily cap rather than the per-minute limit. */
async function isDailyLimit(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { code?: unknown } | null;
    return body?.code === 'daily-limit';
  } catch {
    return false;
  }
}

interface RulesChatContext {
  isOpen: boolean;
  toggle: () => void;
}

const ChatContext = createContext<RulesChatContext>({ isOpen: false, toggle: () => {} });

export function RulesChatToggle() {
  const { isOpen, toggle } = useContext(ChatContext);
  return (
    <button className="rules-chat-toggle" onClick={toggle}>
      <AiRulesIcon size={16} />
      {isOpen ? 'Close AI Chat' : 'AI Rules Assistant'}
    </button>
  );
}

/**
 * A tab an answer points to: what it is called and where it opens. It opens
 * the way the tab strip does, in place in history, with the router `state`
 * the page was reached with (see BackLink).
 */
export interface RulebookLink {
  label: string;
  to: string;
  state?: unknown;
}

// The panel's link handlers, for its answers' links. A context rather than
// a components map built per render: a new component each render would
// mount every link afresh, losing focus on one mid-answer.
const CitationContext = createContext<{ isCitation: (href: string) => boolean; onCite?: (href: string, quote: string) => boolean }>({
  isCitation: () => false,
});
const NO_CITATIONS = () => false;

/** The answer's text before a link, in the paragraph or list item that holds it. */
function textBefore(link: HTMLElement): string {
  const range = document.createRange();
  range.setStart(link.closest('p, li') ?? link.parentElement!, 0);
  range.setEndBefore(link);
  return range.toString();
}

/**
 * An answer's link, which opens in a tab of its own, so the chat stays
 * where it was. Most are page citations, opening a rulebook PDF at the page,
 * unless the page takes one (onCite returns true), given the words of the
 * answer the citation closes, so it can mark them on the page. A link opened in a new
 * tab on purpose (a modifier key, a middle click) is left to the browser.
 * A citation's title, if it has one, is its accessible name: "p. 11, Base
 * game" says which rulebook where "p. 11" alone doesn't. Any other link the
 * answer holds keeps its title as a title, and is never taken.
 */
function AnswerLink({ href, title, children }: ComponentProps<'a'>) {
  const { isCitation, onCite } = useContext(CitationContext);
  const cite = href !== undefined && isCitation(href);
  function click(e: MouseEvent<HTMLAnchorElement>) {
    if (!cite || !onCite || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (onCite(href, citingClause(textBefore(e.currentTarget)))) e.preventDefault();
  }
  return (
    <a href={href} title={cite ? undefined : title} aria-label={cite ? title : undefined} target="_blank" rel="noopener noreferrer" onClick={click}>
      {children}
    </a>
  );
}

const ANSWER_COMPONENTS: Components = { a: AnswerLink };

/**
 * `parts` names the extra rulebooks the assistant reads along with the game's
 * own, and `scope` says in words what it is reading. `linksFor` finds the
 * other tabs an answer names, so "that's in the 5–6 Player Extension" comes
 * with a way there. `citeLinks` turns the answer's page citations ("p. 5")
 * into links to that page, which `isCitation` tells from any other link the
 * answer holds, and `onCite`, given one of those and the words of the
 * answer it closes, shows the page in place and returns true, or returns
 * false to let it open the PDF. `starters` are
 * offered as one-tap questions until the first one is asked. `tab` names
 * the tab on screen; each answer keeps the one it was asked on and hands it
 * to `linksFor` and `citeLinks`, since the panel stays as tabs change.
 */
export function RulesChatPanel({ slug, gameName, parts = [], scope, tab, linksFor, citeLinks, isCitation = NO_CITATIONS, onCite, starters = [] }: {
  slug: string;
  gameName: string;
  parts?: string[];
  scope?: string;
  tab?: string;
  linksFor?: (answer: string, tab?: string) => RulebookLink[];
  citeLinks?: (answer: string, tab?: string) => string;
  isCitation?: (href: string) => boolean;
  onCite?: (href: string, quote: string) => boolean;
  starters?: string[];
}) {
  const { isOpen } = useContext(ChatContext);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about the rules for ' + gameName + '.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The request in flight, aborted if the page goes away under it.
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    void ask(input.trim());
  }

  /** `fromBox` is false for a starter, which leaves whatever was typed alone. */
  async function ask(userMsg: string, fromBox = true) {
    if (!userMsg || isLoading) return;

    // A retry replaces the notice the last attempt left.
    const prior = messages.filter((m) => !m.error);
    setMessages([...prior, { role: 'user', content: userMsg }]);
    if (fromBox) setInput('');
    setIsLoading(true);

    const history = prior
      .slice(1)
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        content: msg.content,
      }))
      .slice(-6);

    // Aborts when nothing arrives for STALL_MS: no headers, or a stream gone quiet.
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const giveUp = () => { timedOut = true; controller.abort(); };
    let timer = setTimeout(giveUp, STALL_MS);
    const stillAlive = () => {
      clearTimeout(timer);
      timer = setTimeout(giveUp, STALL_MS);
    };

    // On any failure the question goes back in the box and the half answer,
    // if one started, comes out, so Retry or Send asks it again cleanly.
    let failed = false;
    const fail = (notice: string) => {
      setMessages([...prior, { role: 'assistant', content: notice, error: true }]);
      setInput((current) => current || userMsg);
      failed = true;
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, message: userMsg, history, ...(parts.length > 0 ? { parts } : {}) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // A 429 is the rate limiter doing its job, not a fault to report.
        if (response.status === 429) {
          fail((await isDailyLimit(response)) ? DAILY_LIMITED : RATE_LIMITED);
        } else {
          Sentry.captureMessage(`rules chat request failed: HTTP ${response.status}`, {
            level: 'error',
            tags: { slug },
          });
          fail(FAILED);
        }
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      setMessages((prev) => [...prev, { role: 'assistant', content: '', tab }]);

      const append = (text: string) =>
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + text };
          return updated;
        });

      // A chunk can end partway through a multi-byte character; `stream`
      // holds those bytes for the next chunk instead of garbling them, and
      // the final decode() flushes any the stream cut off.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stillAlive();
        append(decoder.decode(value, { stream: true }));
      }
      const tail = decoder.decode();
      if (tail) append(tail);
    } catch (err) {
      // Aborted by leaving the page: nobody is waiting for an answer.
      if (controller.signal.aborted && !timedOut) return;
      if (timedOut) {
        Sentry.captureMessage('rules chat request timed out', { level: 'warning', tags: { slug } });
        fail(TIMED_OUT);
      } else {
        Sentry.captureException(err, { tags: { slug } });
        fail(FAILED);
      }
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted || timedOut) {
        setIsLoading(false);
        // The input was disabled while waiting; put the person back in it
        // after a failure, or when the starter they tapped has gone with focus,
        // unless they have moved on meanwhile (a citation tapped mid-answer
        // put focus on its page). Without scrolling, which would take them
        // back up from wherever they are reading.
        if (failed || !fromBox) {
          requestAnimationFrame(() => {
            const at = document.activeElement;
            if (at === document.body || panelRef.current?.contains(at)) inputRef.current?.focus({ preventScroll: true });
          });
        }
      }
    }
  }

  if (!isOpen) return null;

  // Before the first question the panel shrinks to the greeting and starters.
  const fresh = messages.length === 1 && !isLoading;

  return (
    <div ref={panelRef} className={`rules-chat-panel${fresh ? ' rules-chat-panel-fresh' : ''}`}>
        {scope && <p className="rules-chat-scope" aria-live="polite">{scope}</p>}
        <div className="rules-chat-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          // A notice gets its own key so it mounts fresh and its alert is announced.
          <div key={msg.error ? 'error' : i} className={`rules-chat-msg rules-chat-msg-${msg.role}`}>
            {msg.error ? (
              <div className="rules-chat-bubble rules-chat-error">
                <p role="alert">{msg.content}</p>
                <button type="button" className="rules-chat-retry" onClick={() => void ask(input.trim())} disabled={!input.trim()}>
                  Retry
                </button>
              </div>
            ) : (
              <div className="rules-chat-bubble">
                {msg.role === 'assistant'
                  ? <CitationContext.Provider value={{ isCitation, onCite }}><Markdown components={ANSWER_COMPONENTS}>{citeLinks?.(msg.content, msg.tab ?? tab) ?? msg.content}</Markdown></CitationContext.Provider>
                  : msg.content}
                {/* Once the answer is whole, so links don't come and go mid-stream. */}
                {msg.role === 'assistant' && i > 0 && !(isLoading && i === messages.length - 1) && linksFor?.(msg.content, msg.tab ?? tab).map((l) => (
                  <Link key={l.to} className="rules-chat-tablink" to={l.to} replace state={l.state}>Open {l.label} <span aria-hidden="true">→</span></Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {fresh && starters.length > 0 && (
          <div className="rules-chat-starters" role="group" aria-label="Try asking">
            {starters.map((q) => (
              <button key={q} type="button" className="rules-chat-starter" onClick={() => void ask(q, false)}>{q}</button>
            ))}
          </div>
        )}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="rules-chat-msg rules-chat-msg-assistant">
            <div className="rules-chat-bubble rules-chat-thinking">Thinking...</div>
          </div>
        )}
      </div>
      <form className="rules-chat-input" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a rules question..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

export default function RulesChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ChatContext.Provider value={{ isOpen, toggle: () => setIsOpen((o) => !o) }}>
      {children}
    </ChatContext.Provider>
  );
}

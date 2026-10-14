import { useState, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, createContext, useContext } from 'react';
import type { ComponentProps, FormEvent, MouseEvent, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { Link } from 'react-router';
import Markdown, { type Components } from 'react-markdown';
import { AiRulesIcon } from './Icons';
import Notice from './Notice';
import { citingClause } from '../utils/citeMatch';
import { useOnline } from '../hooks/useOnline';

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

// The most earlier messages sent with a question (the last three
// exchanges), as context for a follow-up. api/chat.ts refuses more than
// its MAX_HISTORY, and a test keeps this within it.
export const HISTORY_SENT = 6;

const FAILED = 'Sorry, something went wrong. Please try again.';
const RATE_LIMITED = 'Too many questions just now. Wait a minute, then try again.';
const TIMED_OUT = 'That took too long to answer. Please try again.';

/**
 * Why the assistant can't answer at all just now, as against a question
 * that failed: no network (the browser says so, or a request found none),
 * or the site's daily cap (api/chat.ts). Said by the box, not in the
 * conversation, and nothing to report.
 */
type Unavailable = 'offline' | 'resting';

const UNAVAILABLE: Record<Unavailable, string> = {
  offline: "You're offline — the assistant needs a connection.",
  resting: 'The assistant is resting for today.',
};
// What still works: at the cap, the rulebook, unless it can't be shown
// either; offline, only a rulebook saved on this device, since one opened
// online but not saved can't draw the pages it hasn't fetched.
const STILL_WORKS = ' The rulebook below still works.';

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
 * `onAnswer` hears each answer once it has come in whole, with its tab.
 * `rulebookFailed` says the rulebook below can't be shown, so a notice that
 * the assistant can't answer doesn't point to it, and `rulebookSaved`
 * whether it is saved on this device, without which the offline notice
 * doesn't either: 'asking' while the page asks again, which holds back a
 * notice about to appear until it can be said whole.
 *
 * When the assistant can't answer at all (Unavailable), an info Notice on a
 * strip above the box says why, not a red error in the conversation. The
 * strip is the one live region for it, kept in the panel while empty, so
 * its Notice passes live={false}. Offline (useOnline), Send, the starters
 * and an error's Retry are off and described by it, and focus on one of
 * them moves to the box. A request that finds no network though the
 * browser says online (fetch or the stream's read rejecting with a
 * TypeError before any bytes) says the same, with Retry, unreported; any
 * other error, a TypeError of our own included, goes to Sentry. The daily
 * cap says the assistant is resting for today. Every other failure keeps
 * the red error and Retry (#198).
 */
export function RulesChatPanel({ slug, gameName, parts = [], scope, tab, linksFor, citeLinks, isCitation = NO_CITATIONS, onCite, onAnswer, starters = [], rulebookFailed = false, rulebookSaved = false }: {
  slug: string;
  gameName: string;
  parts?: string[];
  scope?: string;
  tab?: string;
  linksFor?: (answer: string, tab?: string) => RulebookLink[];
  citeLinks?: (answer: string, tab?: string) => string;
  isCitation?: (href: string) => boolean;
  onCite?: (href: string, quote: string) => boolean;
  onAnswer?: (answer: string, tab?: string) => void;
  starters?: string[];
  rulebookFailed?: boolean;
  rulebookSaved?: boolean | 'asking';
}) {
  const { isOpen } = useContext(ChatContext);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about the rules for ' + gameName + '.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Set by the last question asked, cleared by the next.
  const [unavailable, setUnavailable] = useState<Unavailable | null>(null);
  // While the browser says it is offline nothing is sent, and the box says why.
  const online = useOnline();
  const shown = online ? unavailable : 'offline';
  const statusId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Gone offline with Send, a starter or Retry in focus, which going offline
  // turns off, the person goes to the box, rather than left on a button
  // that does nothing (or, as the browser moves focus off it, nowhere).
  // Before paint, while focus is still on the button.
  useLayoutEffect(() => {
    const at = document.activeElement;
    if (!online && at instanceof HTMLButtonElement && at.disabled && panelRef.current?.contains(at)) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [online]);
  // The request in flight, aborted if the page goes away under it.
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  // Back online, a request that found no network may be sent again.
  useEffect(() => {
    const back = () => setUnavailable((u) => (u === 'offline' ? null : u));
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // The last answer, once it is whole: not the greeting, a notice, or one
  // still coming in.
  const last = messages[messages.length - 1];
  const answer = !isLoading && messages.length > 1 && last.role === 'assistant' && !last.error ? last : null;
  const answered = useEffectEvent((a: Message) => onAnswer?.(a.content, a.tab ?? tab));
  useEffect(() => {
    if (answer) answered(answer);
  }, [answer]);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    void ask(input.trim());
  }

  /** `fromBox` is false for a starter, which leaves whatever was typed alone. */
  async function ask(userMsg: string, fromBox = true) {
    if (!userMsg || isLoading || !online) return;

    // A retry replaces the notice the last attempt left.
    const prior = messages.filter((m) => !m.error);
    setMessages([...prior, { role: 'user', content: userMsg }]);
    if (fromBox) setInput('');
    setUnavailable(null);
    setIsLoading(true);

    const history = prior
      .slice(1)
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        content: msg.content,
      }))
      .slice(-HISTORY_SENT);

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
    // The same, with the reason said by the box instead.
    const refuse = (why: Unavailable) => {
      setMessages(prior);
      setInput((current) => current || userMsg);
      setUnavailable(why);
      failed = true;
    };
    // Whether any of the answer has come in: a network lost before it did
    // is no network at all, one lost after it is a broken answer.
    let received = false;
    // Whether the request itself failed (fetch, or reading the stream), the
    // only failure the network can be blamed for: any other is a fault of
    // ours, and goes to Sentry.
    let lost = false;
    const network = <T,>(request: Promise<T>) => request.catch((err: unknown) => {
      lost = true;
      throw err;
    });

    try {
      const response = await network(fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, message: userMsg, history, ...(parts.length > 0 ? { parts } : {}) }),
        signal: controller.signal,
      }));

      if (!response.ok) {
        // A 429 is the rate limiter doing its job, not a fault to report.
        if (response.status === 429) {
          if (await isDailyLimit(response)) refuse('resting');
          else fail(RATE_LIMITED);
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
        const { done, value } = await network(reader.read());
        if (done) break;
        stillAlive();
        received = true;
        append(decoder.decode(value, { stream: true }));
      }
      const tail = decoder.decode();
      if (tail) append(tail);
    } catch (err) {
      // Aborted by leaving the page: nobody is waiting for an answer.
      if (controller.signal.aborted && !timedOut) return;
      // fetch rejects with a TypeError when there is no network, as a
      // stream cut off does; offline, whatever the request met, that is why.
      if (lost && (!navigator.onLine || (!received && err instanceof TypeError))) {
        refuse('offline');
      } else if (timedOut) {
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
  // Gone offline while the page asks whether the rulebook is saved: said
  // once that is known, not said and then added to. A no-network notice
  // already up keeps what it said meanwhile.
  const holding = shown === 'offline' && rulebookSaved === 'asking' && unavailable !== 'offline';
  const stillWorks = !rulebookFailed && (shown === 'resting' || rulebookSaved === true);

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
                <button type="button" className="rules-chat-retry" onClick={() => void ask(input.trim())} disabled={!input.trim() || !online} aria-describedby={online ? undefined : statusId}>
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
              <button key={q} type="button" className="rules-chat-starter" onClick={() => void ask(q, false)} disabled={!online} aria-describedby={online ? undefined : statusId}>{q}</button>
            ))}
          </div>
        )}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="rules-chat-msg rules-chat-msg-assistant">
            <div className="rules-chat-bubble rules-chat-thinking">Thinking...</div>
          </div>
        )}
      </div>
      {/* In the panel while empty too, so what it comes to say is read out:
          the one live region for it, so its notice isn't one as well. */}
      <div id={statusId} className="rules-chat-status" aria-live="polite">
        {shown && !holding && (
          <Notice
            tone="info"
            live={false}
            // Retry for a request that found no network while the browser
            // said it had one (a captive or dead Wi-Fi), which may come back
            // without telling it.
            action={shown === 'offline' && online && input.trim() ? { label: 'Retry', onClick: () => void ask(input.trim()) } : undefined}
          >
            {UNAVAILABLE[shown]}{stillWorks && STILL_WORKS}
          </Notice>
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
        <button type="submit" disabled={!input.trim() || isLoading || !online} aria-describedby={online ? undefined : statusId}>
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

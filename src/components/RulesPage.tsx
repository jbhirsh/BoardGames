import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import { GAMES } from '../data/games';
import { rulebooks, rulebookPath, chatParts, chatScope, mentionedRulebooks, starterQuestions } from '../utils/rulebooks';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { CalculatorIcon } from './Icons';
import { shownKind } from '../utils/subgames';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';
import NotFoundPage from './NotFoundPage';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useScrollEdges } from '../hooks/useScrollEdges';
import { formatSize } from '../utils/fileSize';

// pdf.js is large, so it loads only where the reader is used.
const PdfReader = lazy(() => import('./PdfReader'));

// Phones and touch tablets don't show an embedded PDF well: Android Chrome
// shows nothing, iOS Safari only the first page. There the page draws the
// rulebook itself, searchable, and links to the device's own viewer too.
const READ_IN_PAGE = '(max-width: 720px), (pointer: coarse)';

/**
 * Falls back to a note if the reader fails to load or throws (its chunk is
 * gone after a deploy, or the browser can't run it), so the rest of the
 * rules page (the chat, the link to the PDF) keeps working.
 */
class ReaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? <p className="pdf-note">This rulebook couldn’t be shown here. Download the PDF above instead.</p>
      : this.props.children;
  }
}

/** The PDF's size from a HEAD request, or null until (or unless) it answers. */
function usePdfSize(pdf: string, wanted: boolean): number | null {
  const [size, setSize] = useState<{ pdf: string; bytes: number } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    fetch(pdf, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        const bytes = Number(res.headers.get('content-length'));
        if (res.ok && bytes > 0) setSize({ pdf, bytes });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [pdf, wanted]);
  return size?.pdf === pdf ? size.bytes : null;
}


// How far the tab strip's edges fade (App.css .rules-books); a tab within
// this of either side is partly hidden.
const STRIP_FADE = 48;

/** Scrolls the tab strip sideways to its chosen tab, clear of the faded edge. */
function scrollToChosenTab(strip: HTMLElement) {
  const tab = strip.querySelector<HTMLElement>('[aria-current="page"]');
  if (tab) strip.scrollLeft = Math.max(0, tab.offsetLeft - strip.offsetLeft - STRIP_FADE);
}

/**
 * Brings a tab reached by keyboard clear of the faded edges. The browser
 * leaves a partly visible tab where it is, which can put its focus ring
 * under the fade.
 */
function revealTab(strip: HTMLElement, tab: HTMLElement) {
  const left = tab.offsetLeft - strip.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < strip.scrollLeft + STRIP_FADE) {
    strip.scrollLeft = Math.max(0, left - STRIP_FADE);
  } else if (right > strip.scrollLeft + strip.clientWidth - STRIP_FADE) {
    strip.scrollLeft = right - strip.clientWidth + STRIP_FADE;
  }
}

export default function RulesPage() {
  const { slug, part } = useParams<{ slug: string; part?: string }>();
  const game = GAMES.find(g => g.slug === slug);
  const [wordCheckerOpen, setWordCheckerOpen] = useState(false);
  const inPage = useMediaQuery(READ_IN_PAGE);
  const books = game ? rulebooks(game) : [];
  const book = books.find(b => b.part === part);
  const size = usePdfSize(book?.pdf ?? '', inPage && book !== undefined);
  const [edges, stripRef, strip] = useScrollEdges();
  // A deck has a dozen tabs; on a phone the chosen one can sit past the
  // edge of the strip, so bring it into view, clear of the faded edge. Once
  // per tab, not per render: the strip re-renders as it scrolls (its fades
  // follow), and a ref callback would snap it back each time. scrollIntoView
  // would also scroll the page to bring the strip itself into view.
  useEffect(() => {
    if (strip) scrollToChosenTab(strip);
  }, [strip, book?.pdf]);

  if (!game) {
    return <NotFoundPage title="Game not found" message="We don't have a rulebook at this address. Pick a game from the collection to read its rules." />;
  }

  // An unknown tab goes to the game's own rulebook rather than a not-found
  // page: the game is real, only the tab is wrong.
  if (!book) return <Navigate replace to={rulebookPath(game.slug)} />;

  return (
    <RulesChatProvider>
      <div className="rules-page">
        <title>{`${book.name} rules · The Game Room`}</title>
        <header className="rules-header">
          <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
          <div className="rules-title-row">
            <img
              src={game.img}
              alt={`${game.name} box art`}
              className="rules-box-art"
            />
            <div className="rules-title-info">
              <h1 className="rules-game-name">{game.name}</h1>
              <p className="rules-game-desc">{book.short}</p>
            </div>
            <RulesChatToggle />
            {SCORE_CALCULATORS.has(game.slug) && (
              <Link className="rules-chat-toggle" to={`/score/${game.slug}`}>
                <CalculatorIcon /> Score calculator
              </Link>
            )}
            {game.slug === 'bananagrams' && (
              <button
                className="rules-chat-toggle"
                onClick={() => setWordCheckerOpen(o => !o)}
              >
                {wordCheckerOpen ? 'Close Word Checker' : 'Word Checker'}
              </button>
            )}
          </div>
        </header>
        {books.length > 1 && (
          <nav
            ref={stripRef}
            // Faded at an end with more tabs past it, so a cut-off strip
            // reads as one that scrolls.
            className={`rules-books${edges.start ? ' fade-start' : ''}${edges.end ? ' fade-end' : ''}`}
            aria-label="Rulebooks"
            onFocus={(e) => revealTab(e.currentTarget, e.target as HTMLElement)}
          >
            {books.map(b => (
              <Link
                key={b.pdf}
                to={rulebookPath(game.slug, b.part)}
                className="rules-book"
                aria-current={b === book ? 'page' : undefined}
              >
                {b.label}
                {b.kind && shownKind(b.label, b.kind) && (
                  <span className={`kind-chip kind-${b.kind}`}>{b.kind}</span>
                )}
              </Link>
            ))}
          </nav>
        )}
        {game.houseRules && (
          // Folded so the rulebook stays in view; the count says it's there.
          <details className="house-rules">
            <summary>House rules <span className="house-rules-count">{game.houseRules.length}<span className="sr-only"> rules</span></span></summary>
            <dl>
              {game.houseRules.map(r => (
                <div key={r.name} className="house-rule">
                  <dt>{r.name}</dt>
                  <dd>{r.text}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <RulesChatPanel
          slug={game.slug}
          gameName={game.name}
          parts={chatParts(game, book)}
          scope={chatScope(game, book)}
          linksFor={(answer) => mentionedRulebooks(answer, game, book).map((b) => ({ label: b.label, to: rulebookPath(game.slug, b.part) }))}
          starters={starterQuestions(game, book)}
        />
        {wordCheckerOpen && <WordChecker />}
        {inPage ? (
          <>
            {/* Above the reader on a phone, where a long rulebook would bury
                it, with the size so nobody starts a big download unawares. */}
            <a href={book.pdf} download className="rules-download" aria-label="Download PDF" aria-describedby="rules-download-size">
              Download PDF
              {size !== null && (
                <>
                  <span className="rules-download-size" aria-hidden="true">·</span>
                  <span className="rules-download-size" id="rules-download-size">{formatSize(size)}</span>
                </>
              )}
            </a>
            <ReaderBoundary key={book.pdf}>
              <Suspense fallback={<p className="pdf-note">Loading the rulebook…</p>}>
                <PdfReader src={book.pdf} title={`${book.name} rules`} />
              </Suspense>
            </ReaderBoundary>
          </>
        ) : (
          <>
            <div className="rules-viewer">
              <iframe src={book.pdf} title={`${book.name} rules`} />
            </div>
            <a href={book.pdf} download className="rules-download">
              Download PDF
            </a>
          </>
        )}
      </div>
    </RulesChatProvider>
  );
}

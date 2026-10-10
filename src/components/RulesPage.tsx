import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useLocation, useNavigate, Link, Navigate } from 'react-router';
import { GAMES } from '../data/games';
import { rulebooks, rulebookPath, chatParts, chatScope, citedPage, citedPageParam, linkCitations, mentionedRulebooks, starterQuestions } from '../utils/rulebooks';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { CalculatorIcon } from './Icons';
import { shownKind } from '../utils/subgames';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';
import NotFoundPage from './NotFoundPage';
import BackLink from './BackLink';
import { useScrollEdges } from '../hooks/useScrollEdges';
import { formatSize } from '../utils/fileSize';
import { cameFromList, FROM_LIST } from '../utils/fromList';

// The page draws the rulebook itself, searchable, on every screen: phones
// can't show an embedded PDF (Android Chrome shows nothing, iOS Safari only
// the first page), and a desktop's viewer can't be moved to a cited page
// reliably or have a passage marked. pdf.js is large, so it loads with the
// rules page rather than with the app.
const PdfReader = lazy(() => import('./PdfReader'));

/**
 * Falls back to a note if the reader fails to load or throws (its chunk is
 * gone after a deploy, or the browser can't run it), so the rest of the
 * rules page (the chat, the link to the PDF) keeps working.
 */
class ReaderBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
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
  // Passed on by the tabs and the chat's links to them, which replace rather
  // than push: a game's rules page is one step in history however many tabs
  // are read, so Back (ours, or the browser's) lands where the visitor came
  // from. A citation's state also carries the words it closes (showCited).
  const { state, search, key } = useLocation();
  const arrival = cameFromList(state) ? FROM_LIST : undefined;
  const quote = (state as { quote?: unknown } | null)?.quote;
  const navigate = useNavigate();
  // The page a citation asked the reader to show (see showCited). The
  // location's key tells one tap from the next, so a second tap on the same
  // citation, after scrolling away, still jumps.
  const citedAt = citedPageParam(search);
  const game = GAMES.find(g => g.slug === slug);
  const [wordCheckerOpen, setWordCheckerOpen] = useState(false);
  // Once a reader has failed, citations open the PDF again: a jump would
  // land on the note that the rulebook can't be shown.
  const [readerFailed, setReaderFailed] = useState(false);
  const readerFails = useCallback(() => setReaderFailed(true), []);
  const books = game ? rulebooks(game) : [];
  const book = books.find(b => b.part === part);
  const size = usePdfSize(book?.pdf ?? '', book !== undefined);
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

  /**
   * The rulebook an answer was asked on, by the tab the chat recorded with
   * it (its part, '' for the game's own), which its links are read against.
   */
  const askedOn = (tab: string | undefined) => books.find((b) => (b.part ?? '') === tab)!;

  /**
   * A citation of one of the game's rulebooks opens it in the reader rather
   * than as a raw PDF in a new tab (which a phone downloads, on Android, or
   * shows only the first page of, on iOS): its tab, in place in history as
   * the tab strip goes, at ?page=N, where the reader scrolls to the page and
   * marks the passage that the answer's words (`quote`) point to. They ride
   * in the router state, not the URL, so a shared ?page=N link opens at the
   * page with nothing marked. The chat isn't keyed by tab, so the answer
   * stays. The window stays put (preventScrollReset) until the reader moves
   * it: scrolled to the top first, it would only have to come back down.
   * The chat hands over citations only (isCitation), and leaves a click
   * meant for a new tab to the browser.
   */
  const showCited = (href: string, quote: string) => {
    const cited = citedPage(href, game)!;
    navigate(rulebookPath(game.slug, cited.book.part, cited.page), { replace: true, state: { ...arrival, quote }, preventScrollReset: true });
    return true;
  };

  return (
    <RulesChatProvider>
      <div className="rules-page">
        <title>{`${book.name} rules · The Game Room`}</title>
        <header className="rules-header">
          <BackLink />
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
                replace
                state={arrival}
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
          tab={book.part ?? ''}
          linksFor={(answer, tab) => mentionedRulebooks(answer, game, askedOn(tab)).map((b) => ({ label: b.label, to: rulebookPath(game.slug, b.part), state: arrival }))}
          citeLinks={(answer, tab) => linkCitations(answer, game, askedOn(tab))}
          isCitation={(href) => citedPage(href, game) !== null}
          onCite={readerFailed ? undefined : showCited}
          starters={starterQuestions(game, book)}
        />
        {wordCheckerOpen && <WordChecker />}
        {/* Above the reader, where a long rulebook would bury it: the file,
            with its size so nobody starts a big download unawares, and the
            browser's own viewer, for its zoom, thumbnails and printing. */}
        <div className="rules-pdf-links">
          <a href={book.pdf} download className="rules-download" aria-label="Download PDF" aria-describedby="rules-download-size">
            Download PDF
            {size !== null && (
              <>
                <span className="rules-download-size" aria-hidden="true">·</span>
                <span className="rules-download-size" id="rules-download-size">{formatSize(size)}</span>
              </>
            )}
          </a>
          <a href={book.pdf} target="_blank" rel="noopener noreferrer" className="rules-download">Open PDF</a>
        </div>
        {/* The reader's pages draw only near the screen, so a printout of
            this page would be empty boxes: it prints this instead. */}
        <p className="rules-print-note">To print this rulebook, use Open PDF and print it from the browser’s PDF viewer.</p>
        <ReaderBoundary key={book.pdf} onFail={readerFails}>
          <Suspense fallback={<p className="pdf-note">Loading the rulebook…</p>}>
            <PdfReader
              src={book.pdf}
              title={`${book.name} rules`}
              jump={citedAt === null ? undefined : {
                page: citedAt,
                key,
                place: books.length > 1 ? book.label : undefined,
                quote: typeof quote === 'string' && quote !== '' ? quote : undefined,
              }}
              onFail={readerFails}
            />
          </Suspense>
        </ReaderBoundary>
      </div>
    </RulesChatProvider>
  );
}

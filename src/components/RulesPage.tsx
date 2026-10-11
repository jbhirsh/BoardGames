import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useLocation, useNavigate, Link, Navigate } from 'react-router';
import { GAMES } from '../data/games';
import { rulebooks, rulebookPath, chatParts, chatScope, citationsIn, citedPage, citedPageParam, linkCitations, mentionedRulebooks, starterQuestions } from '../utils/rulebooks';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { CalculatorIcon } from './Icons';
import { shownKind } from '../utils/subgames';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';
import Notice from './Notice';
import NotFoundPage from './NotFoundPage';
import BackLink from './BackLink';
import { useScrollEdges } from '../hooks/useScrollEdges';
import { formatSize } from '../utils/fileSize';
import { cameFromList, FROM_LIST } from '../utils/fromList';
import { head, outOfReach, savedCopy } from '../pdfjs/saved';
import { useOnline } from '../hooks/useOnline';
import { CANT_SHOW } from './cantShow';

// The page draws the rulebook itself, searchable, on every screen: phones
// can't show an embedded PDF (Android Chrome shows nothing, iOS Safari only
// the first page), and a desktop's viewer can't be moved to a cited page
// reliably or have a passage marked. pdf.js is large, so it loads with the
// rules page rather than with the app.
const PdfReader = lazy(() => import('./PdfReader'));

// Said in place of a rulebook that can't be shown: one the browser can't
// show, whose file the links above still give (CANT_SHOW), or one that
// isn't saved on this device and has no network to come from, whose links
// are gone too.
const NOT_SAVED = (
  <div className="pdf-offline">
    <Notice tone="info">Not saved on this device yet. Open it once with signal.</Notice>
  </div>
);

/**
 * Falls back to a note if the reader fails to load or throws (its chunk is
 * gone after a deploy, or the browser can't run it), so the rest of the
 * rules page (the chat, the link to the PDF) keeps working.
 */
class ReaderBoundary extends Component<{ children: ReactNode; pdf: string; note: ReactNode; onFail: (pdf: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail(this.props.pdf);
  }
  render() {
    return this.state.failed ? this.props.note : this.props.children;
  }
}

/**
 * The PDF's HEAD, asked once for each reader (`attempt` counts them): its
 * size, null until (or unless) it answers, and `reached`, whether the
 * network answered it, which a reader that fails asks (see outOfReach)
 * rather than sending a second HEAD after the first.
 */
function usePdfHead(pdf: string, attempt: number, wanted: boolean) {
  const [size, setSize] = useState<{ pdf: string; bytes: number } | null>(null);
  const answer = useRef<{ pdf: string; attempt: number; reached: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    const asked = head(pdf, controller.signal);
    answer.current = { pdf, attempt, reached: asked.then((res) => res !== null) };
    asked
      .then((res) => {
        const bytes = Number(res?.headers.get('content-length'));
        if (res?.ok && bytes > 0) setSize({ pdf, bytes });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [pdf, attempt, wanted]);
  /** Whether the network answered this reader's HEAD, or a new one if it hasn't been sent. */
  const reached = useCallback((of: string, at: number) => {
    const a = answer.current;
    return a?.pdf === of && a.attempt === at ? a.reached : head(of).then((res) => res !== null);
  }, []);
  return { size: size?.pdf === pdf ? size.bytes : null, reached };
}

/**
 * Whether the rulebook is saved on this device, for the chat's offline
 * notice. Asked again as the browser goes offline, since one read online is
 * saved as it is read: 'asking' meanwhile, unless it was saved already
 * (which a copy stays). On another tab, the last answer stands until this
 * one's comes, so a notice up doesn't lose its sentence and get it back.
 */
function useSaved(pdf: string, online: boolean): boolean | 'asking' {
  const [known, setKnown] = useState<{ pdf: string; online: boolean; saved: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void savedCopy(pdf).then((saved) => {
      if (live) setKnown({ pdf, online, saved });
    });
    return () => { live = false; };
  }, [pdf, online]);
  if (known === null) return 'asking';
  if (known.pdf === pdf && known.online !== online && !known.saved) return 'asking';
  return known.saved;
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
  // The rulebook that couldn't be shown, and whether that was for want of a
  // network (outOfReach): undefined until that is known. Forgotten when the
  // reader opens another (a tab back to it gets a fresh reader, which may
  // well load), and when the network comes back, which gives it another go.
  const [failure, setFailure] = useState<{ pdf: string; unreachable?: boolean } | null>(null);
  // Readers given that other go: a new one each, keyed by it.
  const [attempt, setAttempt] = useState(0);
  // The page an answer cites in another tab's rulebook, which the reader
  // opens and draws out of sight while the answer is read (see warmCited).
  const [warm, setWarm] = useState<readonly { src: string; page: number }[]>([]);
  const books = game ? rulebooks(game) : [];
  const book = books.find(b => b.part === part);
  if (failure !== null && failure.pdf !== book?.pdf) setFailure(null);
  const { size, reached } = usePdfHead(book?.pdf ?? '', attempt, book !== undefined);
  const online = useOnline();
  const saved = useSaved(book?.pdf ?? '', online);
  const readerFails = useCallback((pdf: string) => {
    // This failure, and not one after it, is what the answer is for.
    const mine = { pdf };
    setFailure(mine);
    void outOfReach(pdf, () => reached(pdf, attempt)).then((unreachable) => setFailure((f) => (f === mine ? { pdf, unreachable } : f)));
  }, [reached, attempt]);
  // A rulebook that failed has another go when the network comes back:
  // one that failed for want of it then loads by itself. While the reader
  // on screen has failed, citations open the PDF again (a jump would land
  // on the note that it can't be shown); a fresh reader, on another tab or
  // that other go, takes them again.
  const failed = failure !== null;
  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);
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

  // This tab's rulebook, if it couldn't be shown (failure is only ever this
  // tab's): nothing said until it is known why, so one note doesn't give
  // way to another.
  const unreachable = failure?.unreachable === true;
  let failNote: ReactNode = CANT_SHOW;
  if (failure && failure.unreachable === undefined) failNote = null;
  else if (unreachable) failNote = NOT_SAVED;

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

  /**
   * Once an answer has come in, the first page it cites in another tab's
   * rulebook is got ready, so a tap on it jumps there sooner: on a phone the
   * worker takes seconds over a page full of pictures. One, so a rulebook
   * the reader already shows isn't let go for it (two are kept open). Not
   * once the reader has failed, when a citation opens the PDF itself.
   */
  const warmCited = (answer: string, tab?: string) => {
    if (failed) return;
    const other = citationsIn(answer, game, askedOn(tab)).find((c) => c.book.pdf !== book.pdf);
    setWarm(other ? [{ src: other.book.pdf, page: other.page }] : []);
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
          onCite={failed ? undefined : showCited}
          onAnswer={warmCited}
          starters={starterQuestions(game, book)}
          rulebookFailed={failed}
          rulebookSaved={saved}
        />
        {wordCheckerOpen && <WordChecker />}
        {/* Above the reader, where a long rulebook would bury it: the file,
            with its size so nobody starts a big download unawares, and the
            browser's own viewer, for its zoom, thumbnails and printing. Not
            for a rulebook out of reach, where both would be dead links. */}
        {!unreachable && (
          <>
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
          </>
        )}
        <ReaderBoundary key={`${book.pdf}#${attempt}`} pdf={book.pdf} note={failNote} onFail={readerFails}>
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
              warm={warm}
              onFail={readerFails}
              failNote={failNote}
            />
          </Suspense>
        </ReaderBoundary>
      </div>
    </RulesChatProvider>
  );
}

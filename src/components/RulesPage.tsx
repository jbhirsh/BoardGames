import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useParams, useLocation, useNavigate, Link, Navigate, type Location } from 'react-router';
import { ALL_GAMES } from '../data/games';
import { rulebooks, rulebookPath, chatParts, chatScope, citedPageParam, starterQuestions } from '../utils/rulebooks';
import { citationsIn, citedPage, linkCitations, mentionedRulebooks } from '../utils/citations';
import { scorePadLink } from '../data/scoreCalculators';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import { CalculatorIcon } from './Icons';
import { shownKind } from '../utils/subgames';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';
import Notice from './Notice';
import NotFoundPage from './NotFoundPage';
import PageHeader from './PageHeader';
import { revealInStrip } from '../client/revealInStrip';
import { useScrollEdges } from '../hooks/useScrollEdges';
import { formatSize } from '../utils/fileSize';
import { cameFromList, FROM_LIST } from '../utils/fromList';
import { head, outOfReach, rulebookBytes, savedCopy, waitsForSave } from '../pdfjs/saved';
import { useOnline } from '../hooks/useOnline';
import { useOfflineSave } from '../hooks/useOfflineSave';
import { CANT_SHOW } from './cantShow';
import SaveOffline from './SaveOffline';
import {
  headerButtonClass,
  headerButtonLiveClass,
  kindChipClass,
  kindClasses,
  pageClass,
  pdfNoteClass,
  rulesLinkClass,
  fewerWordsClass,
} from './sharedClasses';

// The page draws the rulebook itself, searchable, on every screen: phones
// can't show an embedded PDF (Android Chrome shows nothing, iOS Safari only
// the first page), and a desktop's viewer can't be moved to a cited page
// reliably or have a passage marked. pdf.js is large, so it loads with the
// rules page rather than with the app.
const PdfReader = lazy(() => import('./PdfReader'));

// Said in place of a rulebook that can't be shown: one the browser can't
// show, whose file the links above still give (CANT_SHOW), or one that
// isn't saved on this device and has no network to come from, whose links
// are gone too. Opening one with signal saves it, unless it is a large one
// (or the browser saves data), which waits for its Save for offline button.
const notSaved = (pdf: string) => (
  <div className={`pb-6 ${fewerWordsClass}`}>
    <Notice tone="info">
      {waitsForSave(pdf) ? (
        // Named as its button reads: "Save offline" on a phone.
        <>
          Not saved on this device yet. Tap Save <span className="rules-wide">for </span>offline next time you have
          signal.
        </>
      ) : (
        'Not saved on this device yet. Open it once with signal.'
      )}
    </Notice>
  </div>
);

/**
 * Falls back to a note if the reader fails to load or throws (its chunk is
 * gone after a deploy, or the browser can't run it), so the rest of the
 * rules page (the chat, the link to the PDF) keeps working.
 */
class ReaderBoundary extends Component<
  { children: ReactNode; pdf: string; note: ReactNode; onFail: (pdf: string) => void },
  { failed: boolean }
> {
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
 * The PDF's HEAD, asked once for each reader (`attempt` counts them), and
 * `reached`, whether the network answered it, which a reader that fails
 * asks (see outOfReach) rather than sending a second HEAD after the first,
 * so one that fails on a dead network is told so sooner.
 */
function usePdfHead(pdf: string, attempt: number, wanted: boolean) {
  const answer = useRef<{ pdf: string; attempt: number; reached: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    answer.current = { pdf, attempt, reached: head(pdf, controller.signal).then((res) => res !== null) };
    return () => controller.abort();
  }, [pdf, attempt, wanted]);
  /** Whether the network answered this reader's HEAD, or a new one if it hasn't been sent. */
  return useCallback((of: string, at: number) => {
    const a = answer.current;
    return a?.pdf === of && a.attempt === at ? a.reached : head(of).then((res) => res !== null);
  }, []);
}

/**
 * Whether the rulebook is saved on this device, for the chat's offline
 * notice and the Save for offline button. Asked again as the browser goes
 * offline, since one read online may have been saved meanwhile (a small
 * one as it is read, any by that button): 'asking' meanwhile, unless it
 * was saved already (which a copy stays). On another tab, the last answer
 * stands until this one's comes, so a notice up doesn't lose its sentence
 * and get it back.
 */
function useSaved(pdf: string, online: boolean): boolean | 'asking' {
  const [known, setKnown] = useState<{ pdf: string; online: boolean; saved: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void savedCopy(pdf).then((saved) => {
      if (live) setKnown({ pdf, online, saved });
    });
    return () => {
      live = false;
    };
  }, [pdf, online]);
  if (known === null) return 'asking';
  if (known.pdf === pdf && known.online !== online && !known.saved) return 'asking';
  return known.saved;
}

// How far the tab strip's edges fade; a tab within this of either side is
// partly hidden. The strip takes it as --strip-fade, for its fade and its
// scroll padding, so the fade and the scrolling here can't disagree.
const STRIP_FADE = 48;

// The strip fades at an end with more tabs past it: without it, a tab cut at
// the edge ("Monster Box 2 EXPA") gave no sign the strip scrolls. A mask's
// black is only opacity, not a colour, so it holds in both themes.
function stripFade({ start, end }: { start: boolean; end: boolean }): string {
  if (start && end)
    return '[mask-image:linear-gradient(to_right,transparent,var(--color-black)_var(--strip-fade),var(--color-black)_calc(100%-var(--strip-fade)),transparent)]';
  if (end) return '[mask-image:linear-gradient(to_right,var(--color-black)_calc(100%-var(--strip-fade)),transparent)]';
  if (start) return '[mask-image:linear-gradient(to_left,var(--color-black)_calc(100%-var(--strip-fade)),transparent)]';
  return '';
}

/** Scrolls the tab strip sideways to its chosen tab, clear of the faded edge. */
function scrollToChosenTab(strip: HTMLElement) {
  const tab = strip.querySelector<HTMLElement>('[aria-current="page"]');
  if (tab) strip.scrollLeft = Math.max(0, tab.offsetLeft - strip.offsetLeft - STRIP_FADE);
}

/**
 * /rules/:slug/:part?: a game's rulebooks and the AI rules assistant. A
 * game with more than one rulebook (rulebooks(): its own, its further
 * `moreRules`, then each game inside it with one, `rulesLabel` naming a
 * tab) gets a tab per rulebook, in a strip that fades at an end with more
 * past it and opens scrolled to the chosen one. Tabs, and the chat's links
 * to them, replace rather than push, passing on the router state the page
 * was reached with, so the page is one history entry however many tabs are
 * read. `?page=N` (citedPageParam) has the reader scroll to page N.
 *
 * Under the header (with the score calculator or word checker beside the
 * assistant's button, for a game that has one) and the tab strip, if any,
 * come the house rules, folded,
 * on every tab; the chat (RulesChat), which says what it reads for the tab
 * on screen (chatScope) and offers three starters shaped by it
 * (starterQuestions); then one row of links, Download PDF with its size
 * (from the build), Open PDF in the browser's own viewer, and the tab's
 * Save for offline item (SaveOffline, useOfflineSave); then the reader
 * (PdfReader). A printout gets a note in the reader's place.
 *
 * A rulebook that fails to load is checked (outOfReach): not saved, and no
 * network, it says so (notSaved) and the links row goes, being dead too;
 * otherwise it says to download the PDF instead (CANT_SHOW). The failure is
 * this tab's alone, and a failed reader is remounted when the browser comes
 * back online, so one that failed offline loads by itself.
 */
export default function RulesPage() {
  const { slug, part } = useParams<{ slug: string; part?: string }>();
  // Passed on by the tabs and the chat's links to them, which replace rather
  // than push: a game's rules page is one step in history however many tabs
  // are read, so Back (ours, or the browser's) lands where the visitor came
  // from. A citation's state also carries the words it closes (showCited).
  const { state, search, key }: Location<unknown> = useLocation();
  const arrival = cameFromList(state) ? FROM_LIST : undefined;
  const quote = (state as { quote?: unknown } | null)?.quote;
  const navigate = useNavigate();
  // The page a citation asked the reader to show (see showCited). The
  // location's key tells one tap from the next, so a second tap on the same
  // citation, after scrolling away, still jumps.
  const citedAt = citedPageParam(search);
  const game = ALL_GAMES.find((g) => g.slug === slug);
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
  const book = books.find((b) => b.part === part);
  if (failure !== null && failure.pdf !== book?.pdf) setFailure(null);
  const reached = usePdfHead(book?.pdf ?? '', attempt, book !== undefined);
  const size = rulebookBytes(book?.pdf ?? '');
  const online = useOnline();
  const saved = useSaved(book?.pdf ?? '', online);
  const offline = useOfflineSave(book?.pdf ?? '', saved, online);
  const readerFails = useCallback(
    (pdf: string) => {
      // This failure, and not one after it, is what the answer is for.
      const mine = { pdf };
      setFailure(mine);
      void outOfReach(pdf, () => reached(pdf, attempt)).then((unreachable) =>
        setFailure((f) => (f === mine ? { pdf, unreachable } : f)),
      );
    },
    [reached, attempt],
  );
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
    return (
      <NotFoundPage
        title="Game not found"
        message="We don't have a rulebook at this address. Pick a game from the collection to read its rules."
      />
    );
  }
  // A game on its way may have no rulebook yet; sending it to its own first
  // tab, as below, would only come back here.
  if (books.length === 0) {
    return (
      <NotFoundPage
        title="No rulebook yet"
        message={`We don't have the rulebook for ${game.name} yet. It will be here once we do.`}
      />
    );
  }

  // An unknown tab goes to the game's own rulebook rather than a not-found
  // page: the game is real, only the tab is wrong.
  if (!book) return <Navigate replace to={rulebookPath(game.slug)} />;

  /**
   * The rulebook an answer was asked on, by the tab the chat recorded with
   * it (its part, '' for the game's own), which its links are read against.
   */
  const askedOn = (tab: string | undefined) => books.find((b) => (b.part ?? '') === tab)!;

  // The pad for this tab's game, a deck's Hearts having its own; else the
  // game's, which every tab shares (Dominion's Intrigue scores on Dominion's),
  // set for the tab where it can be (Europe's map).
  const scorePath = scorePadLink(game.slug, book.part);

  // This tab's rulebook, if it couldn't be shown (failure is only ever this
  // tab's): nothing said until it is known why, so one note doesn't give
  // way to another.
  const unreachable = failure?.unreachable === true;
  let failNote: ReactNode = CANT_SHOW;
  if (failure && failure.unreachable === undefined) failNote = null;
  else if (unreachable) failNote = notSaved(book.pdf);

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
    navigate(rulebookPath(game.slug, cited.book.part, cited.page), {
      replace: true,
      state: { ...arrival, quote },
      preventScrollReset: true,
    });
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
      <div className={pageClass}>
        <title>{`${book.name} rules · The Game Room`}</title>
        <PageHeader title={game.name} desc={book.short} art={game}>
          <RulesChatToggle />
          {scorePath && (
            <Link className={`${headerButtonClass} ${headerButtonLiveClass}`} to={scorePath}>
              <CalculatorIcon /> Score calculator
            </Link>
          )}
          {game.slug === WORD_CHECKER_GAME && (
            <button
              className={`${headerButtonClass} ${headerButtonLiveClass}`}
              onClick={() => setWordCheckerOpen((o) => !o)}
            >
              {wordCheckerOpen ? 'Close Word Checker' : 'Word Checker'}
            </button>
          )}
        </PageHeader>
        {books.length > 1 && (
          <nav
            ref={stripRef}
            // Faded at an end with more tabs past it, so a cut-off strip
            // reads as one that scrolls.
            className={`rules-books mb-3.5 flex snap-x snap-proximity scroll-px-(--strip-fade) scrollbar-thin gap-1.5 overflow-x-auto pb-1 ${edges.start ? 'fade-start' : ''} ${edges.end ? 'fade-end' : ''} ${stripFade(edges)}`}
            style={{ '--strip-fade': `${STRIP_FADE}px` } as CSSProperties}
            aria-label="Rulebooks"
            // A tab reached by keyboard is brought clear of the faded edges:
            // the browser leaves a partly visible one where it is, which can
            // put its focus ring under the fade.
            onFocus={(e) => revealInStrip(e.currentTarget, e.target as HTMLElement, STRIP_FADE)}
          >
            {books.map((b) => (
              <Link
                key={b.pdf}
                to={rulebookPath(game.slug, b.part)}
                replace
                state={arrival}
                className={`rules-book inline-flex shrink-0 snap-start items-center gap-1.75 rounded-control border px-3.5 py-2 text-[13px] font-medium whitespace-nowrap [transition:background_0.15s,color_0.15s,border-color_0.15s] ${b === book ? 'border-dark bg-dark text-surface' : 'border-border bg-bg2 text-text2 hover:border-blue-tint/30 hover:bg-blue-bg hover:text-blue'}`}
                aria-current={b === book ? 'page' : undefined}
              >
                {b.label}
                {b.kind && shownKind(b.label, b.kind) && (
                  <span
                    className={`kind-chip kind-${b.kind} ${kindChipClass} ${b === book ? 'bg-surface/18 text-surface' : kindClasses[b.kind]}`}
                  >
                    {b.kind}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
        {game.houseRules && (
          // Folded so the rulebook stays in view; the count says it's there.
          <details className="group/rules mb-4 rounded-control border border-border bg-surface">
            {/* The browser's own triangle hidden (Safari draws it with its own
                pseudo-element), and one drawn that turns when open. */}
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-semibold text-text after:ml-auto after:size-1.75 after:flex-none after:transform-[rotate(45deg)] after:border-r-2 after:border-b-2 after:border-text3 after:content-[''] after:[transition:transform_0.15s] group-open/rules:after:transform-[rotate(-135deg)] hover:text-blue focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue [&::-webkit-details-marker]:hidden">
              House rules{' '}
              <span className="rounded-control bg-bg3 px-1.75 py-px text-[11px] font-bold text-text2">
                {game.houseRules.length}
                <span className="sr-only"> rules</span>
              </span>
            </summary>
            <dl className="flex flex-col gap-3 px-4 pt-1 pb-4">
              {game.houseRules.map((r) => (
                <div key={r.name}>
                  <dt className="mb-0.5 text-[13px] font-semibold text-text">{r.name}</dt>
                  <dd className="text-[13px] leading-[1.6] text-text2">{r.text}</dd>
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
          linksFor={(answer, tab) =>
            mentionedRulebooks(answer, game, askedOn(tab)).map((b) => ({
              label: b.label,
              to: rulebookPath(game.slug, b.part),
              state: arrival,
            }))
          }
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
            with its size (from the build, so it is there from the first
            paint) so nobody starts a big download unawares, the browser's
            own viewer, for its zoom, thumbnails and printing, and the
            rulebook's place on this device: Save for offline, or how that
            stands. Not for a rulebook out of reach, where all three would
            be dead. On a phone the three keep one line by dropping words
            from sight (rules-more), not from their names: Download, Open. */}
        {!unreachable && (
          <>
            <div
              className={`rules-pdf-links mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 max-xs:gap-x-3.5 ${fewerWordsClass}`}
            >
              <a
                href={book.pdf}
                download
                className={rulesLinkClass}
                aria-label="Download PDF"
                aria-describedby="rules-download-size"
              >
                <span>
                  Download <span className="rules-more">PDF</span>
                </span>
                {size !== null && (
                  <>
                    <span className="font-normal text-text2" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-normal text-text2" id="rules-download-size">
                      {formatSize(size)}
                    </span>
                  </>
                )}
              </a>
              <a href={book.pdf} target="_blank" rel="noopener noreferrer" className={rulesLinkClass}>
                <span>
                  Open <span className="rules-more">PDF</span>
                </span>
              </a>
              {offline.state !== null && (
                <SaveOffline
                  pdf={book.pdf}
                  state={offline.state}
                  hidden={offline.hidden}
                  sized={size !== null}
                  onSave={offline.save}
                />
              )}
            </div>
            {/* The reader's pages draw only near the screen, so a printout of
                this page would be empty boxes: it prints this instead. */}
            <p className="hidden text-[13px] text-text2 print:block">
              To print this rulebook, use Open PDF and print it from the browser’s PDF viewer.
            </p>
          </>
        )}
        <ReaderBoundary key={`${book.pdf}#${attempt}`} pdf={book.pdf} note={failNote} onFail={readerFails}>
          <Suspense fallback={<p className={pdfNoteClass}>Loading the rulebook…</p>}>
            <PdfReader
              src={book.pdf}
              title={`${book.name} rules`}
              jump={
                citedAt === null
                  ? undefined
                  : {
                      page: citedAt,
                      key,
                      place: books.length > 1 ? book.label : undefined,
                      quote: typeof quote === 'string' && quote !== '' ? quote : undefined,
                    }
              }
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

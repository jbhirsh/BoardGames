# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**The Game Room** — a single-page app for browsing a personal board game
collection. Filter and sort 30 games, get a random pick, read bundled rule
PDFs, ask an AI rules assistant, tally a 7 Wonders score, check whether a word
is playable in Bananagrams, and vote on a wishlist. Installable, and usable
offline once visited. React 19 + TypeScript SPA built with Vite, deployed on
Vercel with a small serverless API.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # npm run typecheck, then vite build -> dist/
npm run typecheck    # TypeScript 7 `tsc -b` across the project refs
npm run lint         # eslint . (flat config; includes jsx-a11y static checks)
npm run depcruise    # dependency-cruiser: layering rules (.dependency-cruiser.cjs)
npm run preview      # serve the production build locally
# `npm install` also runs `prepare`, pointing core.hooksPath at .githooks/

# Tests — there is no `npm test` script; call vitest directly:
npx vitest                              # watch mode
npx vitest run                          # single run (CI uses this)
npx vitest run --coverage               # with coverage (thresholds enforced)
npx vitest run src/__tests__/a11y.test.tsx   # accessibility suite only
npm run test:mutation                   # StrykerJS, full run (mutation.yml calls
                                        # `npx stryker run --incremental` itself)

# End-to-end (Playwright, Chromium): builds the app, serves it with
# `vite preview` on port 4174, and drives it with every /api call stubbed
npm run test:e2e
npx playwright test e2e/home.spec.ts    # one spec file
npx playwright show-report              # open the last HTML report
```

`npm run test:e2e` needs a Chromium matching the installed `@playwright/test`
(`npx playwright install chromium`). Where a different preinstalled build has
to stand in, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at it.

Node 24 is used in CI; run the unit tests under it before pushing when
your local Node differs (`npx -y node@24 node_modules/vitest/vitest.mjs
run`), since some web APIs behave differently between versions (a test
that passed on Node 22 failed on 24 over a jsdom `Blob`). Git hooks in `.githooks/` (activated by `npm install`
via `core.hooksPath`) run the same checks locally so failures surface before
a push: **pre-commit** runs eslint + dependency-cruiser + `tsc -b`;
**pre-push** runs the tests related to what the push changes (`vitest
related`; none for docs, workflows or the e2e suite; the whole suite for
anything else, such as dependencies, config, or files tests read like the
rules text and `App.css`) + the production build, leaving the coverage gate to CI. Both
no-op when `$CI` is set. CI re-runs everything on `ubuntu-latest`.

## Architecture

### Client (`src/`)
- **`main.tsx`** — entry point. Imports `./instrument` first (Sentry), then
  mounts a `createBrowserRouter` with these routes. Only the home page (and
  the not-found page, which the router's error page needs) is in the main
  bundle; the others are `React.lazy` (`lazyPages.ts`) and load on first
  open behind a `Suspense` fallback, `RouteFallback`: the page's header in
  grey with a working Back link, its bars the header's own text laid out
  unseen so the page drops in without moving (the rules, score and
  word-checker pages and the fallback all draw it with `PageHeader`, the
  fallback with `loading`; `RulesFallback` takes the
  game's name, rulebook line and buttons from the data; the sign-in page's
  words are in `data/signIn.ts` for both). Code that won't load (a deploy
  since the tab loaded) reaches `RouteError`, which reloads once
  (`utils/chunkReload.ts`, a sessionStorage flag cleared when a page's
  code loads) before saying something went wrong:
  - `/` — `HomePage` (hero, its subtitle speaking to a friend when
    `c=want`, over `CoverCarousel`: every collection game's cover, or each
    wishlist entry's bundled art in Want mode (`utils/heroCovers.ts`;
    friends' BoardGameGeek thumbnails stay out), gliding left in an endless
    row (a CSS transform on a doubled track, the copy `aria-hidden` and out
    of the Tab order, a lap of 2.4 s per cover, the ends faded). The row is
    one Tab stop after its pause button, the arrow keys, Home and End moving
    between covers. It holds still on hover, while a cover has focus, off
    screen or in a hidden tab, and from its pause button; under
    `prefers-reduced-motion` it is the list's first seven (the favourites,
    in Own mode; five on a phone) standing still with no button. A cover scrolls to its
    game's card or row (`id` `game-<slug>` / `wish-<id>`) and focuses its
    name or row toggle, clearing the filters first if they hide it; filter
    bar, then the collection or the wishlist,
    switched by the Own/Want toggle; both stay mounted so a toggle never
    refetches, and only the visible one carries the `#collection` anchor)
  - `/rules/:slug/:part?` — bundled rule PDF viewer + AI rules assistant;
    a game with rulebooks for games inside it gets a tab per rulebook.
    `?page=N` (`citedPageParam`) has the reader scroll to page N.
    On every screen `PdfReader` draws the rulebook with pdf.js (lazy-loaded),
    in place of the browser's own PDF viewer: phones can't embed one
    (Android draws nothing, iOS one page), and a desktop's can't be moved to
    a cited page reliably or have a passage marked. Each page is a canvas
    under its text layer, drawn at the column's width (912px at most) and
    the screen's pixel ratio (followed, so browser zoom redraws it sharp),
    only near the screen, with a search that marks matches in place. Above
    it, one row: "Download PDF" and the file's size (`rulebookBytes`, from
    each rulebook's size, which `vite.config.ts` writes in as
    `__RULEBOOK_SIZES__`, so it is there from the first paint), "Open PDF",
    the browser's own viewer in a new tab for its zoom, thumbnails and
    printing, and the rulebook's Save for offline item (below); a printed
    rules page shows a note saying so in place of the reader. A rulebook
    that fails to load is checked (`outOfReach`, `src/pdfjs/saved.ts`, the
    same saved check the warming uses, without loading pdf.js): not saved
    by the service worker, and offline or the PDF's HEAD (sent as each
    reader opens, given up after 5 s) finding no network, it says "Not
    saved on this device yet. Open it once with signal." in an info
    `Notice` (for a rulebook of 3 MB or more, or while the browser saves
    data, when opening one saves nothing: "Tap Save for offline next time
    you have signal.", "Save offline" on a phone as its button reads,
    `waitsForSave`, from the build's sizes) and the
    row, dead then, goes; otherwise it says to download the PDF instead.
    Either way the reader's search goes too. The failure is the open tab's
    alone: another tab, or the same one opened again, gets a fresh reader,
    and when the browser comes back online a failed one is remounted (on a
    new pdf.js worker if the shared one failed to start, its file not saved
    yet), so a rulebook that failed offline loads by itself. The Save for
    offline item (`SaveOffline`, state from `hooks/useOfflineSave`), the
    row's third, under the tab strip so it is plainly the tab's, is styled
    as the links: a "Save for offline" button described by the Download
    link's size, "Saving…" with a spinner, then plain status text, "Saved
    on this device" with a green tick (`--ok-fg`) in `--text2`, or "Not
    enough space on this device" (a quota error, nothing to retry), or a
    "Couldn't save. Try again" button. On a phone (600px and narrower) the
    three keep one line, from the first paint and in every state, by
    showing fewer words: "Download", "Open", "Save offline" ("Saving…",
    "Saved", "No space", "Try again"). The words dropped from sight
    (`rules-more` in `App.css`) are still read out, so the names stay
    "Download PDF", "Open PDF", "Couldn't save. Try again", and the
    statuses are read in full; only the Save button is named "Save
    offline" there, as a name must hold the words it shows (WCAG 2.5.3)
    and "for" would split them. Below 360px the row's gaps close up so
    Pandemic's 16.4 MB still fits at 320px. It shows from the first paint
    whenever a service worker is in charge and the browser is online (or
    the rulebook is saved), starting from what the build's size predicts
    (Save for offline for a large one, Saving… for a small one, which
    saves itself), held unseen until the page's saved check (`savedCopy`)
    answers so a saved one never says Save first, then put right by it or
    the service worker's answer (`askWorker`, a message with a
    `MessagePort` it answers on: the page asks it to save a small one,
    joining the save opening it began, and only asks after a large one). A
    worker that doesn't answer within 1.5 s
    (an older one) leaves no item. While saving, the page asks again every
    10 s and as it comes back into view, since a worker stopped mid-save
    (iOS suspends them) never says how it ended. It follows
    `controllerchange`, so a first visit's worker that takes charge with
    `clients.claim()` brings it in (its place held meanwhile in the
    production build). The first save by hand calls
    `navigator.storage.persist()` (ignoring the answer), so Safari is less
    likely to clear the saved rulebooks. The live region says how a save
    ended only as it ends, not for a tab whose rulebook was saved already.
    No item without a service worker, nor offline for a rulebook not saved
    (the notice speaks for it). pdf.js's
    modern build is used with the few newer JavaScript methods it calls
    polyfilled (`src/pdfjs/polyfills.ts`, also loaded first in its worker,
    `src/pdfjs/worker.ts`); a Vite plugin copies its WebAssembly image
    decoders, standard fonts and ICC profile to `/pdfjs/`. The worker
    fetches what it needs itself: openjpeg (JPEG 2000), jbig2 (JBIG2 and
    CCITT fax), qcms and the CMYK profile; the standard fonts only for a
    PDF that leaves out Symbol or ZapfDingbats (none of ours), since it
    uses the system's fonts. Documents open
    with `useWorkerFetch: true`: otherwise pdf.js fetches its decoders
    through the last document opened, and closing that one left JPEG 2000
    pages of another undrawn forever (it also turns on CMYK colour
    handling, hence the ICC profile). Pages draw through a queue
    (`src/pdfjs/renderQueue.ts`), one at a time, the most visible first and
    then the nearest, each page's text read before the next starts; the
    page a citation or search asks for has a place of its own.
    `src/pdfjs/documents.ts` holds the shared worker and up to two kept
    rulebooks (least recently used goes first, never one on screen). When
    an answer cites another tab's rulebook, its page is opened and drawn
    out of sight so the tap lands fast, but only if the service worker has
    saved that rulebook, or on a 4G connection that isn't cellular with
    Save-Data off; Safari and Firefox, which don't report their
    connection, warm only saved ones. Such a warm fetches just that page's
    ranges (`X-Warm`). The next tab's reader adopts the kept document; a
    kept rulebook is tidied once its last reader closes, and all of them
    close when the rules page does
  - `/score/:slug` — score calculator for a game in
    `data/scoreCalculators.ts` (currently 7 Wonders); any other slug shows
    the not-found page. Each score box carries its unit inside it, given to
    screen readers as the box's description: VP for the pad's points
    (Wonder is the stages' points, not how many were built), coins for
    Treasury. Score and unit read as one line of text ("7 coins"), the
    unit muted but as big as the digits and on their baseline, centred in
    the box as a group: the box is a wrapper holding an input sized to its
    text (`field-sizing: content`, else one `ch` a character) that reaches
    across the whole box, so a tap anywhere in it lands in the input. Every
    box is 5.5em, room for "99 coins" in the widest fallback font; on a
    phone the science boxes share their row in thirds. The science boxes show
    no unit (their icons say which symbol): the Science label line says
    "symbols" once, beside its "= N VP", and each box's description reads
    both. Treasury's "= N VP" sits beside its label too; both notes always
    show, "= 0 VP" included. The boxes open a phone's number pad
    (`inputMode="numeric"`), so military's minus comes from its ± button.
    While the page is open it holds a screen wake lock
    (`hooks/useWakeLock.ts`, asked for again whenever the page comes back
    into view or the system drops it in view; nothing where the browser
    lacks it or refuses), so a phone on the table doesn't lock between
    turns. Results is a score sheet like the printed pad (a row
    per category, a column per player, the category column pinned while it
    scrolls sideways on a phone)
  - `/word-checker` — word lookup for word games: the bundled lists
    (`public/words/`: ENABLE, plus `additions.txt`, the hand-picked words it
    predates) answer at once; a word they lack reads "Not in our word list"
    while the dictionary (Wiktionary) is asked, which can make it valid, or
    invalid only when it answers that it has no playable sense. A dictionary
    that can't be reached leaves a warning, never a red ✗, and anything but
    one word of two or more letters gets a note, not a verdict or a lookup
    (a phone's trailing full stop is dropped). The dictionary also gives
    meanings, credited as CC BY-SA 4.0 requires: Wiktionary, the word's
    page, the licence, and that they're shortened
  - `/sign-in` — the owner's magic-link sign-in (`SignInPage`); nothing on
    the home page links to it

  Each sub-page's "Back to The Game Room" is `BackLink`, a real link to
  `/`. The home page's links into a sub-page carry router state
  `FROM_LIST` (`utils/fromList.ts`); with it, a plain click goes back in
  history instead, so the URL's filters and `ScrollRestoration` return the
  list as it was left, in one jump (`InstantRouteScroll`, just before
  `ScrollRestoration` in `App`, turns smooth scrolling off while the router
  moves the page, so a new page doesn't glide to its top either). The picker closes before it navigates, so the saved offset is
  the list's, not the pinned page's 0. Rulebook tabs and the chat's Open
  links `replace` and pass that state on, so a rules page is one history
  entry however many tabs are read. A deep link, or
  the score page reached from a rules page, goes to `/`.
  The list's open row comes back with it: `ListView` keeps it in the list
  page's own history entry (`hooks/useOpenRow.ts`, `utils/openRow.ts`;
  each toggle `replace`s the entry with `openRow` in its router state,
  scroll left alone, and the filter URL sync's own replaces carry that
  state over), not in the URL or storage, so Back by the browser or the
  page's link finds the same row open, while a fresh visit to `/` opens
  none. The row is open from the first render, before `ScrollRestoration`
  measures, and a row inserted open skips its slide-open transition, so
  the offset lands on the row's actions again. The wishlist's rows link
  only to other sites, in new tabs, so they keep plain local state.
- **`App.tsx`** — layout shell: wraps the router `Outlet` in `FilterProvider`
  and mounts Vercel `Analytics`.
- **`data/`** — the static data layer. `games.ts` is the source of truth for
  the collection; `wishlist.ts`, `keywords.ts`, `initialFilterState.ts`,
  `scoreCalculators.ts` (the games with a score calculator, which the cards,
  rows and score page all read), `wordChecker.ts` (the game the word
  checker is for, which its card, row and rules page link to and whose
  box art the checker's page wears) and `types.ts` support it. No database on the read path — the collection is a
  compiled-in constant. `Game` and `WishlistItem` both extend `Filterable`
  (name, desc, min/max players, mins, duration bucket, keywords). The filter
  pipeline (`utils/filterGames.ts`) is generic over it: `filterItems` with
  `filterGames` and `filterWishlist` wrappers that decide their own grouping.
  The time filter is a budget (`FilterState.duration`: up to 15, 30 or 60
  minutes, `d=15|30|60` in the URL; an old `d=quick|medium|long` link opens
  at the budget that keeps its games): a game fits by its own `mins`, quick
  ones included. `cat` (Quick, Medium, Long) no longer filters; it names a
  time pill without a label and breaks ties in the time sorts. The players
  dropdown offers 1 to 10+. Both dropdowns are radio groups
  (`FilterBar/RadioOptions.tsx`): one Tab stop, arrows to move, Enter to pick.
  A game can hold `subgames` (`SubGame`, kind `expansion`, `extension`,
  `version` or `card-game`): Catan's, Dominion's and One Night's add-ons,
  Ticket to Ride - Europe as a version, the games the Card Deck plays. Each has its
  own players, time, video and usually a rulebook at
  `/rules/<parent>.<sub>.pdf`. The players and time filters keep a parent
  when it fits on its own or one of its games fits both (a deck only by its
  games, since it is never played on its own), and search matches their
  names. The card's "+N games" button ("k of N games fit" under a filter),
  named by kind ("+1 expansion", "+1 version"; "add-ons" when kinds mix),
  sits bottom left beside the award count (just "+N" on a narrow card) and
  opens a list of the ones that fit (`SubGameList`) above the footer; a card
  spans four subgrid rows of the grid, so heads and footers line up across
  a row. A list row's name stands alone; the same label as a tag, then the
  award count, close its description (in its column, or under the name
  where the description folds in there), and both list their names on
  hover or tap (`Popover`, shared with `AwardsBadge`); the expanded row
  lists the games in full. A collapsed row carries only its chevron, on a
  desktop and on the narrow list alike: its Rules, Score or Word Checker
  and video close the expanded row, under the write-up, add-ons and
  awards, on the right (`GameActions`, the bar a card's footer ends with
  too, and `AwardsSection` the awards above it, as on an open card and a
  wishlist row). Rules there and on a card is one `RulesLink`,
  named "Rules for <game>" (label in name) and marked as leaving the list
  so the rules page's Back returns to it. When the players and time filters admit a game
  only through an add-on with its own rulebook, its Rules link opens that
  tab (`rulesPathFor`: Catan at five opens the 5–6 Player Extension).
  An add-on with a fuller `desc` or
  `detail` opens in place with More. A game
  can also carry `moreRules`, further rulebooks for the same game (Hogwarts
  Battle's sheets for Games 2 to 7), each a rules-page tab; they build on
  each other, so the assistant reads the one on screen and those before it
  (and all of them on an add-on's tab, which is played on the finished game).
  `rulesLabel` names the tab for its own rulebook. A sub-game takes both too:
  the Monster Box has a tab per box. The rules page shows the tabs (a
  strip that fades at an end with more tabs past it and opens on the
  chosen one; `hooks/useScrollEdges`) above the chat, which says what it
  is reading for the tab on screen (`chatScope`) and, until the first
  question, offers three starters shaped by that tab
  (`starterQuestions`). A game with a score calculator links it beside the
  chat's button. When the assistant can't answer at all, an info `Notice`
  says why on a strip above the chat's box (the one live region for it,
  kept in the panel while empty; the `Notice` there passes `live={false}`
  so it isn't announced twice), not a red error in the conversation:
  offline (`hooks/useOnline`, the browser's online/offline events) Send,
  the starters and an error's Retry are off, described by it ("You're
  offline — the assistant needs a connection"), and focus on one of them
  moves to the box; a request that finds no network though the browser
  says online (a captive or dead Wi-Fi: `fetch` or the stream's `read`
  rejecting with a TypeError before any bytes) says the same, with Retry
  and unreported, while any other error, a TypeError of our own included,
  goes to Sentry; the daily cap says the assistant is resting for today.
  The cap adds "The rulebook below still works" unless the reader failed
  too; offline adds it only for a rulebook saved on this device
  (`rulebookSaved`, which the rules page asks again as the browser goes
  offline, since one read online is saved as it is read, holding back a
  notice about to appear until it can be said whole). Other failures keep
  the red error and Retry (#198).
  A game's `houseRules` (Hogwarts Battle's) are listed in a folded section
  above the rulebook on every one of its tabs; the assistant still answers
  from the printed rules only.
  Both views share the filter bar: `FilterState.collection` (`'own' | 'want'`,
  mirrored to the URL as `c=want`) picks which list the section renders and
  which one the keyword counts tally; `CLEAR_ALL` keeps the mode.
  A game's difficulty is BoardGameGeek's community weight (1 light to 5
  heavy), never typed in: each game, and each card game or version inside
  one, carries its BGG id (`bgg`), `npm run game-weights`
  (`scripts/fetch-game-weights.ts`) fetches the weights by id from BGG's
  public item endpoint (no token) into the generated
  `src/data/gameWeights.ts`, and `games.ts` sets `weight` from it. Something
  BGG doesn't rate (no id, or `null` in the map) shows no difficulty; a deck
  has none of its own, and an add-on, learned on top of its game, has no id.
  The data test holds all of this: it fails on an id the script hasn't
  fetched and on a weight with no id behind it, and `games.ts` replaces any
  other typed weight with BGG's.
  Cards, sub-game lists and the collection table's Difficulty column (it
  sorts, and hides under 1080px where the table has no room) read
  "Medium · 2.3", a deck as the span of its games (`utils/difficulty.ts`);
  the column shows an unrated game as an en dash, read out as "Not rated on
  BoardGameGeek".
- **`context/`** — filtering state. `FilterContext` holds a `useReducer` store
  (`filterReducer.ts`); `useFilter.ts` is the consumer hook; `useFilterUrlSync.ts`
  keeps filter state mirrored to the URL query string so views are shareable.
  `WishlistContext` is the one definition of the wishlist for the page (static
  entries plus approved friend suggestions, loaded once and reloadable after
  an owner edit) for the wishlist section, the keyword counts, the filter
  sheet's result count, the empty state's counts and the owner tools
  (`AdminPanel`, `AdminItemControls`);
  `AuthContext` holds the owner-session check that switches admin
  mode on (`SignInPage`, `AdminPanel`, `AdminItemControls`). Its provider
  wraps only the home page and the `/sign-in` route, each with its own
  instance, so the rules, score and word-checker pages never call
  `/api/auth`.
- **`components/`** — presentational + interactive UI (grid/list views, filter
  bar, random picker, rules page, rules chat, word checker, score calculator,
  wishlist + voting). `Icons.tsx` holds inline SVGs. `Notice` is the one
  info / warning / error message (icon, one line, optional action; a
  status, or an alert for an error, unless `live={false}` inside a live
  region that announces it already), coloured
  by the `--info-`, `--warn-` and `--danger-` tokens, which a test holds to
  4.5:1 in both themes; use it rather than a one-off coloured box. The filter bar's
  choices are drawn once (`FilterBar/FilterOptions.tsx`) for two homes: the
  dropdown pills on a wide screen, and at phone width (520px and under) a
  "Filters · N" button beside the search that opens a bottom sheet
  (`FilterSheet`), so the sticky bar is one row; there the active tags
  scroll away with the page instead of sitting in the sticky header. The
  sheet and the random picker share `hooks/useDialogFocus` (focus, Escape,
  Tab kept inside) and `hooks/useScrollLock`. The wishlist wears the
  collection's clothes: `WishlistCard` reuses the `game-card` layout (vote
  and buy/video links in the footer) and `WishlistListView` renders
  the collection's table (`GamesTableHead` is the shared sortable header)
  with a vote column and an expanded row for the full blurb, awards, owner
  controls and links; the collapsed row shows the blurb's first sentence
  (`utils/shortDesc.ts`) where a collection row shows its hand-written
  short line. Both sections share one theme. The wishlist alone has a
  "Most votes" sort (`SortMode` `votes`: the filter orders it A→Z and the
  wishlist then puts the most voted first; going back to the collection, or
  a `s=votes` link without `c=want`, falls back to the default sort; the
  order by votes, here and under Group, is taken when the counts load or
  the sort or the list changes, not on each vote, so a voted entry doesn't
  jump from under the pointer), a line under its heading saying what a
  vote does, and on the heading's line "Share wishlist" (copies `/?c=want`
  through `hooks/useCopyLink`, the active filters' Share link's copy) and
  "Suggest a game", which jumps to the form at the bottom (on a phone the
  two split a line of their own, like Own/Want under them). `VoteButton`
  always shows its verb ("♡ Vote", "♡ Vote · 2", filled "♥ Voted · 3")
  and its accessible name starts with the same word; it and Share
  wishlist keep their width as a vote lands or "Copied!" shows. Footer
  buttons share one size and radius (44px on a phone); Rules is the one
  filled button on a collection card or open row and Vote the strongest on a wishlist
  card, while Score, Word Checker, video, cart and price history are one
  quiet outline (the video's play glyph in `--yt-red`). An entry with
  `expands` (the base game's name) wears an "Expansion for Catan (owned)"
  tag (`ExpansionTag`), "owned" when the base is in the collection; the
  data test checks each names a game we have or want.
- **Theme** — light and dark. `App.css` keeps every colour in `:root`
  tokens; the dark palette redefines them under
  `prefers-color-scheme: dark` (unless `data-theme="light"`) and under
  `[data-theme="dark"]`, so use a token, never a literal, and
  `rgba(var(--blue-rgb), a)` for a blue tint. `--blue` is for text and
  rings on the page; a filled button uses `--blue-fill` with
  `--on-fill` text, which keeps white text readable in both themes. Box
  art and PDF pages stay on white. The hero's `ThemeToggle` (Match
  system / Light / Dark) goes through `hooks/useTheme.ts`, which sets
  `data-theme` on `<html>` and stores the pick under `gameroom:theme`;
  an inline script in `index.html` applies it before first paint.
  `e2e/theme.spec.ts` runs axe's colour-contrast rule over the main
  pages in both themes, so a new colour has to pass AA in each.
- **Fonts** — headings are Playfair Display, self-hosted (no third-party
  request, and saved for offline): `public/fonts/` holds Google Fonts'
  Latin subset, the variable roman (700 and 900) and the 700 italic, with
  the OFL licence. `App.css` declares them with `font-display: swap`
  behind a `'Playfair Fallback'` face per style, Times New Roman Bold (or
  Liberation Serif, its metric twin), then `'Playfair Fallback Noto'`,
  Noto Serif Bold (Droid Serif) for Android, each with `size-adjust` and
  ascent/descent overrides measured against Playfair on the collection's
  names, so the swap barely moves a line;
  `index.html` preloads the roman file. Body text is the system font.
- **`utils/`** — pure helpers (`filterGames.ts`, `pickRandom.ts`, `filterUrl.ts`, `heroCovers.ts`,
  `urls.ts`, `openRow.ts`, `shortDesc.ts`, `subgames.ts`, `rulebooks.ts`, `pdfSearch.ts`,
  `citeMatch.ts`, the passage of a page a citation points to; `fileSize.ts`,
  `sevenWonders.ts`, the score pad's arithmetic: science, standings with
  the coins tie-break; `difficulty.ts`, the Light/Medium/Heavy words for a
  weight; `offline.ts`, the service worker's routing and byte ranges;
  `precache.ts`, which build files the service worker saves when;
  `chunkReload.ts`, the one reload for a page's code that won't load;
  `fromList.ts`, the router state that marks a sub-page as opened from the
  list; `wordList.ts`, the word checker's normalising of a typed word and
  parsing of its list; `wiktionary.ts`, the reading of a Wiktionary answer
  and which words in it are playable). Keep these free of React and side
  effects.
- **`client/`** — the browser-side modules that have side effects but are
  not hooks: `adminApi.ts`, the owner's calls to the API; `dictionary.ts`,
  the Wiktionary lookup; `wordList.ts`, loading the word checker's lists;
  `displayName.ts`, the remembered name; `revealInStrip.ts`, which scrolls
  a sideways strip (the rulebook tabs, the score pad's players) just far
  enough to show an item; and `safeStorage.ts`, localStorage
  and sessionStorage that never throw (blocked, full or missing storage
  reads as nothing stored), for the score pad's game, the theme, the
  voter id, the display name and the reader's jumps.
  dependency-cruiser keeps them free of React and of the UI above them.
- **`sw/sw.ts`** — the service worker, for game nights with no signal.
  `main.tsx` registers it in production builds only; the `serviceWorker()`
  plugin in `vite.config.ts` bundles it to `/sw.js` (a classic worker: the
  build fails if it would import a chunk shared with the app) and writes in
  the precache list (`utils/precache.ts` sorts the build: every page's
  code, bar the Sentry replay chunk, which only an error loads; the
  collection's box art, the headings' font, both word lists, the favicons,
  apple-touch icon and manifest), the reader's list (pdf.js's worker and
  the four decoders in `PDFJS_DECODERS`, about 1.7 MB; the build fails if
  one is missing), the saved shell's name (a hash of `index.html` and all
  of those, so a build that changes none keeps it) and a hash of each
  rulebook. What each cache keeps, and when, is `sw/shell.ts`, written
  against `CacheStorage` so `swShell.test.ts` drives it with a fake: the
  reader goes into the shell with the first rulebook saved and at install
  once one is, so a saved rulebook's pages never opened online still draw
  offline. A rulebook first saved while an older build still ran (after
  the new one installed, without one saved) would leave the new build's
  reader incomplete, and its app asks for its own pdf.js worker, a hashed
  name no older shell holds, so taking over offline a saved rulebook
  couldn't draw. So the worker running the app tells a newer one,
  installing or waiting, of each rulebook it saves (`tellNewer`,
  `READER_MESSAGE`), and that one completes its reader then, while there
  is a network, still waiting, so activating stays quick. Should that
  miss (a browser that can't message between workers, the network gone
  that moment), activating fetches nothing (requests wait meanwhile),
  keeps the older shells that hold a reader until the new one is
  complete, and `healReader` completes it once active and whenever a
  saved rulebook opens online. The rest of `/pdfjs/` (no-WebAssembly
  fallbacks, standard fonts, licences) goes to the runtime
  `gameroom-assets` cache if it is ever fetched, and each update clears it
  with the old code. The wishlist's box art (`WISHLIST_ART_DIR`, about as
  much as the collection's own art, for a list behind the Want toggle
  many never open) goes
  there too, each file as a card draws it (lazily, so a card never
  scrolled to online has no art offline), marked with the build's hash of
  it (`__ART__`, `stamped`); an update keeps it unless its file changed
  (`npm run wishlist-art -- --refresh`) or went. A friend's suggestion's
  BoardGameGeek thumbnail is another site's, so never saved. Sentry stamps
  `sw.js` on every build, so every deploy installs a new worker; without
  `skipWaiting` it waits until no tab runs the old app, so a long-open tab
  keeps its own code offline. Pages
  come from the network (4s at most), falling back to the app saved at
  install, which nothing else replaces; `/api/*` and other sites are never
  touched. A saved file the network can't give is looked for in every
  cache, so a page reloaded online after a deploy (the new build's code
  under the old worker) still opens its pages offline from the new build's
  waiting shell. A rulebook is saved whole (the reader asks for byte
  ranges, which the Cache API can't store, so ranges are cut from the
  saved copy, held in memory while it's read), with the reader's files
  (`saveRulebook` and the `saver` in `sw/shell.ts`, one save per rulebook
  however many ask): on its first open only when its response's
  Content-Length, or a range's Content-Range total, puts it under 3 MB
  (`SAVE_ON_OPEN_BELOW`, decimal megabytes as the page shows sizes; 31 of
  the 58 rulebooks are under 2 MB, 38 under 3 MB) and the browser isn't
  saving data (`navigator.connection.saveData`, which only Chromium gives
  a worker; elsewhere counted off), never by a warm (a request carrying
  `X-Warm`); `savesOnOpen()` in `utils/offline.ts` decides. Any is saved
  when the rules page asks: its `message` handler answers a `{ type:
  'gameroom-rulebook', path, save }` message, for one of the build's
  rulebooks only, on the port sent with it ('saved' or 'unsaved', or
  'saving' then 'saved', 'full' for a quota error, or 'failed'), and keeps
  the worker alive until the save ends. Rulebooks saved at once share one
  saving of the reader's files. Bulk saving and precaching the rules text
  are left out. A saved rulebook is dropped by the first worker whose hash
  for it differs. `public/manifest.webmanifest` and its 192/512 icons make
  the site installable. It has its own
  `tsconfig.sw.json` (WebWorker library, not the DOM).
- **`instrument.ts`** — Sentry browser SDK init (`@sentry/react`): browser
  tracing at a 0.1 sample rate (the API functions trace at 0.1 too). Session
  replay is not in the main bundle: on the first event at error level or
  above (never a warning), `beforeSend` imports `sentryReplay.ts` (its own
  chunk), adds the integration, flushes it and tags that error with the
  replay's id, so only visits that hit an error are recorded, from that
  error on; a reload resumes a recording already under way.

### Serverless API (`api/`) — Vercel Functions (`@vercel/node`)
- **`chat.ts`** — the AI rules assistant. Reads `rules-text/<slug>.txt` plus the
  `parts` the rules page names (`rules-text/<slug>.<sub>.txt`: every game in a
  deck, or just the add-on on screen, since an expansion's rules on top of the
  base game's crowd out the answer), then the names alone of the game's
  other rulebooks (`otherRulebooksNote`, from the files beside it; the eval's
  `askRulesAssistant` adds it too) so an answer can point to the tab that
  covers a question, which the chat then links (`mentionedRulebooks`); sends
  it plus the recent chat history to Google Gemini (`@google/genai`,
  `gemini-2.5-flash`) and streams the reply back as plain text. Validates slug
  format and each of `parts` (must match the same slug regex as `votes.ts`,
  since they pick a file), message length (<=500), history length (<=10) and total
  history content size, and caps Gemini output tokens and time (45 s of
  the function's 60 s, shared with the one overload retry, so a hung stream
  ends in the handler's own error path). Per-IP rate limited via
  `_lib/rateLimit.ts`, and capped at 500 questions a day across every caller
  (a fixed-key limiter checked last, so per-IP refusals and bad requests
  don't spend it; its 429 carries `code: 'daily-limit'`, which `RulesChat`
  words as resting for today). It is the only paid API, so the daily limiter
  fails closed (503) when Redis errors or times out, with a 2 s Upstash
  timeout so an outage refuses quickly; the per-IP limiter, like every other
  endpoint's, fails open. Production reports a missing KV config, which
  turns the cap off, to Sentry. Errors reported to Sentry (`@sentry/node`).
- **`votes.ts`** — anonymous wishlist voting backed by Upstash Redis
  (`@upstash/redis`). `handleVotes()` is written against small interfaces
  (`VotesRedis`, `VotesRequest`, `VotesResponse`) so it can be unit-tested with
  a fake Redis; the default export wires in the real client. Votes are stored as
  Redis sets keyed `wishlist:votes:<id>`, deduped by an anonymous browser id.
  A vote set has no TTL, so a vote must name a real entry: a compiled-in
  wishlist id (mirrored by hand in `api/_lib/wishlistIds.ts`, since api
  can't import src; a test keeps it equal to `src/data/wishlist.ts`) or an
  approved suggestion (its `suggestions:<id>` hash has status `approved`);
  anything else is a 404 that writes nothing. Reading counts (`GET ?ids=`)
  isn't filtered, as `scard` never creates a key.
  Per-IP rate limited via `_lib/rateLimit.ts`. Errors reported to Sentry
  (`@sentry/node`).
- **`suggestions.ts`** — friend suggestions with owner approval by email and
  no admin page. `POST` validates, emails the owner (Resend) approve/deny
  links carrying a per-suggestion token, then stores the suggestion as
  `pending`; `GET ?action=approve|deny&id&token` verifies the token and
  renders a confirmation page whose form `POST`s `{ decision, id, token }`
  to flip the status (a bare GET never mutates, because mail link-scanners
  follow every URL); a malformed, unknown or mismatched link, on either
  step, gets a standalone page with its 400, 404 or 403, not JSON; plain `GET` lists approved suggestions, which the
  wishlist renders under "Suggested by friends". Redis keeps one hash per
  suggestion plus two id lists, `suggestions:active` (pending + approved,
  for duplicate checks) and `suggestions:approved` (the public list),
  read through `getRawRedis()` (`_lib/redis.ts`), a client with Upstash's
  automatic JSON parsing off, so a value comes back as the text stored (a
  game called `null` or `1.50` stays that). A new suggestion is stored before the email is sent so the emailed links
  always resolve; if the send call fails (or passes its 5 s timeout, so a
  hung Resend can't outlast the function) the record is dropped from the
  active list and marked `unsent` (tracked on `suggestions:unsent`) so the
  suggester can retry, but its links keep working (a timeout can follow a
  real delivery), it still shows in the owner's on-site queue, and
  approving an unsent record returns it to the active list. A decision
  first claims the record (HSETNX on its `decidedAt`, which only a decision
  sets), so a double-submitted form, or the email link and the site at
  once, decides it once and the loser answers "Already ..." (a claim
  still undecided a minute on is abandoned and taken over); the writes
  that follow go through one MULTI/EXEC, and a push removes the id first,
  so no list holds it twice. On approval the handler
  looks the game up on BoardGameGeek (`_lib/bgg.ts`, XML API 2, bearer token
  from `BGG_API_TOKEN`) and stores players, playing time, a two-sentence
  description, year, mapped keywords and the box-art thumbnail URL as a
  `details` JSON field, so the card renders and filters like any other
  wishlist entry; a miss, an outage or a missing token still approves with
  details empty. `handleSuggestions()`
  takes `{ redis, mailer, baseUrl, lookup, admin }` so the mailer, the BGG
  lookup and the session check are spies in tests. With no
  Resend configuration the endpoint returns 503 rather than storing a
  suggestion the owner would never see. A signed-in owner (see `auth.ts`)
  can also work the list from the site: `GET ?action=pending` lists the
  queue, `POST { decision, id }` without a token decides one, `POST
  { action: 'add', game, name, note?, type? }` puts a game straight on the
  wishlist (stored approved with `source: 'owner'`, enriched the same way),
  `PATCH { id, game?, note?, details? }` edits how it reads (players, time,
  description, keywords, section) and `DELETE { id }` takes it off (status
  `removed`, hash kept, lists forget it). CSRF protection is mainly the
  session cookie's SameSite=Lax, which keeps it off cross-site POSTs. As a
  second layer every owner mutation must be a JSON request, judged by the
  media type alone (`text/plain; x=application/json` fails): a cross-site
  form can post urlencoded bodies but cannot send JSON without a
  preflight.
- **`auth.ts`** — owner sign-in by magic link, so there is an admin mode but
  no password. `POST { email }` answers the same for every address and, only
  when it matches `SUGGESTIONS_TO`, emails a single-use link (a random token
  in Redis with a 15-minute TTL). The link opens a confirmation page whose
  form `POST`s `{ action: 'verify', token }` (mail scanners follow links, so
  a bare GET never signs anyone in; a malformed token on either step gets a
  standalone page with its 400, not JSON); that consumes the token with `getdel`,
  stores a session id for 30 days and sets it as an HttpOnly, Secure,
  SameSite=Lax cookie (the main CSRF defence). `GET` reports `{ admin }`
  for the cookie it carries; `POST { action: 'logout' }`, JSON only like
  every owner mutation, deletes the session. Helpers in
  `_lib/session.ts` (cookie parsing, `isAdmin`, the JSON check) and
  `_lib/mail.ts` (Resend, the public origin, the standalone pages) are
  shared with `suggestions.ts`. Link requests are rate limited per IP.

### Rules text pipeline (`scripts/`)
Rule PDFs live in `public/rules/*.pdf`. `scripts/extract-rules-text.mjs`
extracts text with `unpdf`, falling back to OCR (`tesseract.js`, via
`scripts/ocr-pdfs.mjs`) for image-only PDFs, and writes `rules-text/*.txt`,
each page opening with a `[Page N]` marker (its page in the PDF; a test
checks they run 1, 2, 3 from the top of every file). The assistant cites a
rule as `(p. N)` from the nearest marker. When it reads more than one
rulebook, each is headed with its name (the game's own too) and every
citation names one (`(Europe p. 4)`). The chat (`linkCitations` in
`utils/rulebooks.ts`) turns each into a link to that PDF at `#page=N`, which
the rules page takes instead: it shows that rulebook's tab in place at
`?page=N`, the reader scrolls to the page, and the answer's words the
citation closes (passed in router state, not the URL) mark the passage they
point to (`utils/citeMatch.ts`: the stretch of the page's text sharing the
most of their meaningful words, marked only with at least three of them,
two beyond words every rulebook uses, and half; widened to whole sentences,
never across a heading's change of type; otherwise the page is only
ringed). A click meant for a new tab, or a
reader on screen that failed, opens the PDF itself (a fresh reader, on
another tab or remounted when the network comes back, takes them again). A bare page with several
rulebooks read, or a name it wasn't sent, stays plain text. The eval grades
facts with citations stripped, and its `citation` entries check the
citations alone.
`vercel.json` bundles `rules-text/**` into the `api/chat.ts` function so it can
read them at runtime.
`npm run rules-text-layer` (`scripts/add-text-layer.mjs`) gives a scanned
rulebook (one with no text at all) an invisible OCR text layer over its page
images, so it can be searched in the reader and in a device's own PDF
viewer; it leaves any PDF that already has text alone. Run it on a newly added
scan before extracting its text.
A scan whose OCR is too noisy to answer from (the Monster Box sheets,
Cranium) carries a hand transcription as text pages after its scanned ones,
so extraction reads the transcription and never OCRs over it (Cranium's
scanned pages also had their garbled text layer removed). The Dominion books
end with typed pages of what they print only as pictures: card costs and
coin amounts. The extractor drops the print-file slugs and art credits on
Rio Grande's card pictures. `rulesTextQuality.test.ts` fails a rules-text
file below a words-per-page or dictionary-word floor, above a stray-letter
ceiling, or sharing most of its text with another; its fixtures are the
pre-#188 texts it must keep catching. Keep its allowlist short, with a
reason for each file.

### External services
- **Google Gemini** — AI rules answers (server-side, `GEMINI_API_KEY`). The
  daily cap bounds requests, not cost; a budget alert on the Gemini project
  (an owner action in Google Cloud billing, outside the code) is the backstop.
- **Upstash Redis / Vercel KV** — wishlist vote storage.
- **Sentry** — error monitoring (browser + serverless) and source-map upload at
  build time via `@sentry/vite-plugin` (org `solo-23`, project `game_room`).
  Maps are built `hidden` and the plugin deletes them after the upload (even
  with no token), so none are served.
- **Wiktionary** — the REST definition API
  (`en.wiktionary.org/api/rest_v1/page/definition/<word>`, keyless, open to
  any origin), called from the browser by `client/dictionary.ts` for a word's
  meanings and for words missing from the bundled lists. It lists far more
  than a word-game list, so `utils/wiktionary.ts` counts a word only for an
  English sense that isn't a proper noun, abbreviation, initialism, acronym,
  symbol, letter, contraction, affix or phrase, a misspelling, an
  "Abbreviation of" and the like, or a case variant of a capitalised word
  (asap, tv); inflections and alternative, archaic and obsolete forms count.
  It also files lone letters ("a", "x") as nouns or articles, so the checker
  never asks about a word under two letters. The API's own 404 for a
  missing page (`{ status: 404 }`) or no such sense is "not a word"; a
  timeout (5 s), network error, any other 404 (a retired route answers
  `{ httpCode: 404 }`) or any status but ok and 429 is "couldn't be
  reached", and Sentry gets a warning for it (not a 429 or an offline
  device) once per page load, as it does for a body it can't read. It replaced
  dictionaryapi.dev, whose origin has been down since September 2026
  (#186).
- **BoardGameGeek** — the XML API 2 does the server-side lookup of an
  approved suggestion's details and box art by name (needs a registered
  token, `BGG_API_TOKEN`; answers 202 while queuing, retried once). Every
  compiled-in wishlist entry carries its BoardGameGeek id (`bgg`), and
  `npm run wishlist-art` fetches each one's 200x200 box art by that id from
  the site's own item endpoint, which needs no token, into
  `public/images/wishlist/` and the generated `src/data/wishlistArt.ts`.
  The collection's box art is one style, each game's flat front cover as
  a 400x400 square with its whole title in view: `npm run collection-art
  [-- <slug>...]` (`scripts/fetch-collection-art.ts`, needs ImageMagick)
  fetches the BGG image pinned for each game in its `COVERS` map (picked
  by eye from the item's gallery, with a crop box and where the square
  sits, or `fit` for a box too wide or tall to crop, which centres the
  whole cover on bands of its edge colour or a set `pad`) by image id
  from the same no-token endpoints and writes `public/images/<slug>.webp`.
  A game missing from the map falls back to its main image; the ones
  marked `keep` (games not on BGG, or editions it lacks) are left as
  checked in.
  The collection's games carry their ids too, and `npm run game-weights`
  reads each one's community weight from the site's no-token stats endpoint
  (`api.geekdo.com/api/dynamicinfo`) into the generated
  `src/data/gameWeights.ts` (the cards' difficulty).

## Environment variables

Copy `.env.example` to `.env.local` (gitignored) and fill in real values. No
secrets belong in tracked source.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | client (`src/instrument.ts`) | Sentry browser DSN (must be `VITE_`-prefixed to reach the browser) |
| `SENTRY_DSN` | serverless (`api/chat.ts`) | Sentry Node DSN |
| `GEMINI_API_KEY` | serverless (`api/chat.ts`) | Google Gemini key (server-only) |
| `KV_REST_API_URL` | serverless (`api/votes.ts`) | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | serverless (`api/votes.ts`) | Upstash Redis REST token |
| `SENTRY_AUTH_TOKEN` | build (optional) | enables Sentry source-map upload during `vite build` |
| `RESEND_API_KEY` | serverless (`api/suggestions.ts`) | Resend key for the suggestion approval email; suggestions are refused until set |
| `SUGGESTIONS_TO` | serverless (`api/suggestions.ts`, `api/auth.ts`) | address that receives approve/deny emails; the only address that can sign in as the owner |
| `SUGGESTIONS_FROM` | serverless (optional) | sender; defaults to `The Game Room <onboarding@resend.dev>` |
| `APP_URL` | serverless (optional) | origin for the emailed links; defaults to the Vercel production URL |
| `BGG_API_TOKEN` | serverless (`api/suggestions.ts`) | BoardGameGeek XML API token; without it approvals go through with no details or art |

## Conventions

- **TypeScript strict everywhere.** Project configs under one solution:
  `tsconfig.app.json` (`src`, DOM libs), `tsconfig.api.json` (`api`, Node libs),
  `tsconfig.node.json` (`vite.config.ts`), `tsconfig.eval.json` (`eval`),
  `tsconfig.sw.json` (`src/sw`, WebWorker libs) and
  `tsconfig.e2e.json` (`e2e`, `playwright.config.ts`). Each extends
  `tsconfig.base.json`, which holds the strict options they share, and
  adds only its own module setup, libraries, types and files. `npm run
  build` runs `tsc -b` across all of them.
- **TypeScript 7 runs side by side with the TypeScript 6 API.** TS 7 (the
  native compiler) ships no JavaScript API, and typescript-eslint loads that
  API through `require('typescript')` (its peer range stops below 6.1). So
  `@typescript/native` is an alias of `typescript@7`, the compiler, and
  `typescript` is an alias of `@typescript/typescript6`, the 6.0 API. Two
  packages then provide a `tsc` command and which one wins can change on any
  `npm install`, so type-check with `npm run typecheck`, which calls the TS 7
  compiler by path, never bare `npx tsc`. Drop the aliases once
  typescript-eslint supports TS 7.
- **`patches/` holds `patch-package` fixes** applied on `postinstall`. One
  patch makes Stryker's vitest runner name tests the way Vitest 5 matches them
  (stryker-js#6210); without it every mutant survives. Once a Stryker
  release carries the fix, delete the patch.
  The other marks a pdf.js range request's rejection as handled: a reader
  closed before its first read (leaving a rules page quickly) otherwise
  throws an unhandled AbortError in the browser. Drop it once pdf.js
  handles that itself.
  Neither package is pinned for its patch: a release that changes the
  patched code makes the patch fail to apply, which fails CI's install.
- **No exact version pins.** Every dependency in `package.json` takes a
  range (`^`, `~`); the lockfile fixes what gets installed.
  `dependencyRanges.test.ts` fails on an exact version.
- **Tests live in `src/__tests__/`** (Vitest + React Testing Library, jsdom).
  Coverage thresholds are enforced **per file at 80% lines** (`vite.config.ts`),
  so new reducer actions, filter utilities, and API handlers need their own
  tests. Tests must be pure logic or RTL — no real network, no real browser.
  The one exception to the location is a CI helper's test, which sits beside
  it (`.github/scripts/*.test.mjs`) and runs in the same suite and coverage
  gate. Shared fakes live in `src/__tests__/helpers/`: `fakeRedis` (an
  in-memory Redis for the API handlers, answering as the default or, with
  `raw`, the raw client) and `stubMatchMedia`.
- **End-to-end tests live in `e2e/`** (Playwright, Chromium only), run
  against the production build. They are the one place with a real browser,
  and still no real network: `e2e/fixtures.ts` stubs every `/api/*` call
  with fixed data, fails a test that makes an unstubbed one, and aborts any
  request off the preview origin; a spec that needs the dictionary API stubs
  it itself. Import `test` and `expect` from `./fixtures`. Find elements by
  role, label, placeholder or text, never CSS (lint enforces it with
  `playwright/no-raw-locators`), and wait on UI state with web-first
  assertions, never on a timer. A spec may import `src/data` for expected
  values but nothing else from the app (dependency-cruiser). Vitest
  excludes `e2e/`, and it is outside coverage and the Stryker mutate scope.
  Add a test here for a new user-facing flow. The service worker is blocked
  (`serviceWorkers: 'block'` in `playwright.config.ts`), since requests it
  answers never reach `page.route`; only `e2e/offline.spec.ts` lets it run.
  There `setOffline` alone leaves the service worker's own fetches online,
  so its `goOffline` also aborts every request that reaches the network.
- **Pure utilities stay pure.** Filtering/sorting/URL logic in `src/utils/` and
  `src/context/filterReducer.ts` should have no side effects and be directly
  unit-testable. The import side of this (utils/data may not reach React or
  app layers, api and src stay separate, e2e reaches only `src/data`) is
  enforced by dependency-cruiser (`.dependency-cruiser.cjs`, run in CI).
- **Validate only at boundaries.** The serverless handlers validate untrusted
  input (slug format, lengths, vote values); don't add defensive checks for
  states that can't occur inside the app.
- **Commit hygiene.** Imperative subject <=72 chars; body explains *why*; end
  with the `Co-Authored-By:` trailer. One logical change per commit; squash
  "fix typo"/"oops" churn before opening or updating a PR. Linear history
  (rebase, not merge). Amend or squash your own feature branch freely before it
  merges, but never amend, rebase, or force-push `main`. CI's commit-message
  step (`.github/scripts/check-commits.sh`) fails a PR on a subject over 72
  chars, a missing body, a fixup/"oops" commit or a merge commit.
- **Never** `git add -A`/`git add .` (stage files explicitly), modify a test to
  make it pass (fix the implementation instead), install packages outside the
  project root, or use `--no-verify`.
- **Issues are the source of truth.** Check `gh issue list` (and
  `gh issue view <n>`) before designing or implementing a feature — issues
  carry rationale the code doesn't.
- **Show UI changes in the PR.** A PR that changes a component or stylesheet
  puts before/after visuals in its description (`.github/pull_request_template.md`):
  screenshots for how things look, GIFs for how things move or respond (a
  dropdown or dialog opening, an animation, scrolling, a multi-step flow).
  Host the images on the `pr-screenshots` branch (its `vercel.json` turns
  deploys off, so they cost none) and link them as
  `https://raw.githubusercontent.com/jbhirsh/BoardGames/pr-screenshots/<dir>/<file>.png`.
  The `PR visuals` check (`.github/scripts/pr-visuals.mjs`) fails a change
  to a `.tsx` or `.css` file under `src/` (tests, `context/` and `main.tsx`
  aside) with no picture unless "No visible UI change" is ticked; it skips
  Dependabot's PRs. It can't see a visible change made through `src/data`,
  `public/` or `index.html`, so show those too. Claude Review asks for a GIF
  when motion changes.
- **Review before raising a PR.** Review the full diff (e.g. a review subagent
  reading it) before opening the PR — review gates PR creation, rather than
  opening first and reviewing after.

## Deployment

Vercel (`vercel.json`): `framework: vite`, output `dist/`, SPA rewrites send
non-API, non-file routes to `index.html`, and `api/*` maps to the serverless
functions, each with its own `maxDuration` (chat 60 s for streaming, the
others 10 to 15 s, none over 60 s). The content-hashed build output under `/assets/` is served
`public, max-age=31536000, immutable`; `index.html` and `sw.js` revalidate. CI (`.github/workflows/ci.yml`) runs lint, type-check,
unit tests with coverage (the axe a11y suite among them), a build and a production dependency audit
(`npm audit --omit=dev`, high and above) on `ubuntu-latest` for every PR to
`main`.
The automated Claude review runs alongside it in its own workflow,
`claude-review.yml` (not waiting for CI, so a red PR is reviewed too):
claude-code-action skips any PR that edits the workflow file it runs from,
so a separate file keeps PRs that change CI reviewed. `claude-autofix.yml`
addresses unresolved review comments on bots' PRs (Dependabot's) once CI and
the review have both passed, and attempts mechanical fixes when their npm
bumps fail a check (a person's PR is left to its author). `mutation.yml`
runs StrykerJS over the source files a PR touched (the changed files that
`stryker.config.json`'s `mutate` globs select, picked by
`.github/scripts/stryker-mutate-scope.mjs`) and fails below the
`break` score in `stryker.config.json` (a weekly full sweep applies the
same bar). Both run incremental (`--incremental`, results kept with
actions/cache): a PR run starts from its own last results, else main's
latest results, narrowed to its own files
(`.github/scripts/stryker-incremental-scope.mjs`), and re-tests only the
mutants whose code or covering tests changed, reused results still
counting toward the score; the sweep starts from nothing, re-tests
everything and becomes main's baseline, and each merge to main re-tests
just what it changed to keep that baseline current (it gates nothing,
and waits for a first sweep to have finished).
Runs queue rather than cancel, because Stryker saves its results only when
a run ends: a push waits for its PR's running check, then starts from it. `e2e.yml` (workflow `E2E`, job `E2E Tests (Playwright)`) runs
the Playwright suite on every PR, installing its own Chromium, and uploads
the HTML report and the failing attempt's trace when it fails or times
out; in CI a failed test is retried once, and a test that passes only on
that retry still fails the run (`failOnFlakyTests`). All CI runs
on GitHub-hosted `ubuntu-latest` runners. `pr-visuals.yml` (`PR visuals`)
runs on every push and description edit; autofix skips it, since what it
wants is pictures in the description, not a code change.

Every PR check but PR visuals is a required status check on `main` (`ci`,
Claude Review, Secret scan, StrykerJS, Answer-Quality Eval, E2E Tests
(Playwright), `semgrep-cloud-platform/scan`, Vercel, API smoke test), so
nothing merges until all of them report; PR visuals is not required. A
required check that never reports blocks the PR forever, so
PR workflows must not use a workflow-level `paths:` filter; decide inside
the job instead and skip the expensive step (a skipped step still reports
success). Because those checks
are required, arming auto-merge early is safe: GitHub waits for all of them.

Dependabot's npm PRs merge themselves: `dependabot-merge.yml` turns on
auto-merge as each one opens, and branch protection does the gating — every
required check green and every review thread resolved (conversation
resolution is required on `main`). A Claude Review finding therefore holds
the PR until claude-autofix (or a person) fixes and resolves it. A failed
check works the same way: autofix fixes mechanical breakage from the bump
(one attempt per head, two per PR), and when every fix would change behavior
(privacy or data-collection settings, auth, features, a test's expected
values) it comments and leaves the decision to the owner. A new PR workflow
must be added to the required checks, or bot PRs merge without it; list a
gating `pull_request` workflow in `workflows:` in `claude-autofix.yml` too, or
autofix won't fix its failures.

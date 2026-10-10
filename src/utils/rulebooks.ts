import type { FilterState, Game, SubGameKind } from '../data/types';
import { fitsTable, isDeck, tableFiltered } from './filterGames';

export interface Rulebook {
  /** The rulebook's slug, or undefined for the game's own rulebook. */
  part?: string;
  /** What its tab says. */
  label: string;
  name: string;
  short: string;
  pdf: string;
  /** Set on the rulebooks of a game inside this one. */
  kind?: SubGameKind;
}

/**
 * Every rulebook a game's rules page can show: its own first, then its
 * further rulebooks (moreRules), then each game inside it that has a bundled
 * rulebook, followed by that game's own further rulebooks. A deck's own sheet
 * is an overview of its games; anything else's is the base game, unless the
 * game names its tab.
 */
export function rulebooks(game: Game): Rulebook[] {
  const subs = game.subgames ?? [];
  return [
    { label: game.rulesLabel ?? (isDeck(subs) ? 'Overview' : 'Base game'), name: game.name, short: game.short, pdf: game.rules },
    ...(game.moreRules ?? []).map((r) => ({
      part: r.slug, label: r.label, name: `${game.name}: ${r.label}`, short: game.short, pdf: r.pdf,
    })),
    ...subs.filter((s) => s.rules).flatMap((s) => [
      { part: s.slug, label: s.rulesLabel ?? s.name, name: s.name, short: s.short, pdf: s.rules!, kind: s.kind },
      ...(s.moreRules ?? []).map((r) => ({
        part: r.slug, label: r.label, name: `${s.name}: ${r.label}`, short: s.short, pdf: r.pdf, kind: s.kind,
      })),
    ]),
  ];
}

/**
 * Which extra rulebooks the rules assistant reads with the game's own; every
 * one adds thousands of tokens to each question, so only what the tab on
 * screen needs. Further rulebooks (moreRules) build on each other a box at a
 * time, so a tab sends its own and the ones before it: Game 5 needs the house
 * dice from Game 4, Box 3 of an expansion needs Boxes 1 and 2. Of the games
 * inside it: every one for a deck, whose games are short and separate, so any
 * of them can be asked about from any tab; otherwise only the one on screen,
 * since an expansion changes the base game's rules and all of them at once
 * crowd out the answer. An add-on's tab also takes all of the game's further
 * rulebooks: it is played on top of the finished game (the Monster Box
 * assumes Hogwarts Battle through Game 7).
 */
export function chatParts(game: Game, shown: Rulebook): string[] {
  const own = (game.moreRules ?? []).map((r) => r.slug);
  if (isDeck(game.subgames)) return rulebooks(game).filter((b) => b.kind !== undefined).map((b) => b.part!);
  const upTo = own.indexOf(shown.part ?? '');
  if (upTo >= 0) return own.slice(0, upTo + 1);
  if (shown.kind === undefined) return [];
  const sub = game.subgames!.find((s) => s.slug === shown.part || s.moreRules?.some((r) => r.slug === shown.part))!;
  const chain = [sub.slug, ...(sub.moreRules ?? []).map((r) => r.slug)];
  return [...own, ...chain.slice(0, chain.indexOf(shown.part!) + 1)];
}

/**
 * Says what the rules assistant is reading for the tab on screen, so a
 * question asked on Game 4 is plainly about Game 4: the tab's rulebook, then
 * the others sent with it by tab label, numbered tabs run together ("Game
 * 1–3"). A deck sends every game, so it says so.
 */
export function chatScope(game: Game, shown: Rulebook): string {
  const books = rulebooks(game);
  const sent = [books[0], ...chatParts(game, shown).map((p) => books.find((b) => b.part === p)!)];
  if (isDeck(game.subgames)) return `Reading: all ${sent.length - 1} games in the deck.`;
  const others = numberRuns(sent.filter((b) => b.part !== shown.part).map((b) => b.label));
  if (others.length === 0) return `Reading: ${shown.label}.`;
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} and ${others.at(-1)}`;
  return `Reading: ${shown.label}, plus ${list}.`;
}

/** Runs consecutive numbered labels together: Game 1, Game 2, Game 3 become "Game 1–3". */
function numberRuns(labels: string[]): string[] {
  const out: string[] = [];
  let run: { prefix: string; first: number; last: number } | null = null;
  const flush = () => {
    if (run) out.push(run.first === run.last ? `${run.prefix}${run.first}` : `${run.prefix}${run.first}–${run.last}`);
    run = null;
  };
  for (const label of labels) {
    const m = /^(.*?)(\d+)$/.exec(label);
    if (m && run && run.prefix === m[1] && Number(m[2]) === run.last + 1) { run.last += 1; continue; }
    flush();
    if (m) run = { prefix: m[1], first: Number(m[2]), last: Number(m[2]) };
    else out.push(label);
  }
  flush();
  return out;
}

/** Where a game's rules page shows the given rulebook. */
export function rulebookPath(slug: string, part?: string): string {
  return part ? `/rules/${slug}/${part}` : `/rules/${slug}`;
}

/**
 * Where a game's Rules link goes under the players and time filters: its own
 * rulebook, unless the filters admit the game only through a game inside it
 * that has a rulebook of its own. Then that one, since it is the one to play:
 * Catan at five players opens the 5–6 Player Extension. With more than one
 * that fits, the first in the data's order. A deck keeps its overview, which
 * lists every game in it.
 */
export function rulesPathFor(game: Game, state: FilterState): string {
  const subs = game.subgames ?? [];
  if (!tableFiltered(state) || isDeck(subs) || fitsTable(game, state)) return rulebookPath(game.slug);
  return rulebookPath(game.slug, subs.find((s) => s.rules && fitsTable(s, state))?.slug);
}

/** Lowercase words only: "Cities & Knights" and "cities and knights" match, as do "5–6" and "5-6". */
function words(text: string): string {
  return ` ${text.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/**
 * The tabs an assistant answer points to by name, in tab order: the
 * rulebooks it was told about but not sent (the game's own and those
 * chatParts sends are on its desk already). A tab counts as named by its
 * label or by the name the server gives it, built from its part
 * ("Monster Box Of Monsters" for the tab labelled "Monster Box 1").
 */
export function mentionedRulebooks(answer: string, game: Game, shown: Rulebook): Rulebook[] {
  const text = words(answer);
  const read = new Set(chatParts(game, shown));
  return rulebooks(game).filter((b) =>
    b.part !== undefined && b.part !== shown.part && !read.has(b.part) &&
    (text.includes(words(b.label)) || text.includes(words(b.part))),
  );
}

// The assistant's page citations (api/_lib/rulesAssistant.ts asks for
// them), each page being the [Page N] marker in the rules text, which is the
// PDF's own page. The parentheses hold one or more citations, each an
// optional rulebook name, "p." or "pp." and one or more pages or runs of
// pages: "(p. 5)", "(see p. 3)", "(Cities And Knights p. 5)", "(p. 2, 4)",
// "(p. 2 and 4)", "(pp. 6–9)", "(Catan p. 5, Catan p. 11)", "(Catan p. 5;
// Cities And Knights p. 2)". Anything else in the parentheses leaves them
// as they are.
const GROUP = /\(([^()\n]{1,200})\)/g;
// A page or a run of them ("6–9", "6-9", "6 to 9"), which must end at a
// separator or the closing parenthesis: in "(Catan p. 5, 5–6 Player
// Extension p. 2)" the 5–6 is the next rulebook's name, not a run.
const PAGES = String.raw`\d{1,4}(?:\s*(?:[-–—]|to)\s*\d{1,4})?(?=\s*(?:$|[,;&]|\band\b))`;
// Between pages: "2, 4", "2 and 4", "2, and 4", "2 & 4".
const AND = String.raw`\s*(?:,\s*(?:and\b)?|&|\band\b)\s*`;
// One citation, after the separator from the one before it. The name is
// everything before "p." that isn't itself a page reference.
const CITE = new RegExp(
  String.raw`((?:\s*(?:[,;&]|\band\b))?\s*)(((?:(?!\bpp?\.\s?\d)[^])*?)\bpp?\.\s?(${PAGES}(?:${AND}${PAGES})*))`,
  'y',
);
const PAGE_OR_RUN = /(\d{1,4})(?:\s*(?:[-–—]|to)\s*(\d{1,4}))?/g;
// A run longer than this links its first and last pages only: "pp. 6–40" as
// 35 links would bury the answer, and its ends say where the rule is.
const LONGEST_RUN = 5;

/** A page to link, or the two ends of a long run. */
type Cited = { page: number } | { from: number; to: number };

/**
 * The citations inside one pair of parentheses, each with the separator
 * written before it, or null if the parentheses hold anything else.
 */
function citesIn(inner: string): { sep: string; raw: string; name: string; pages: string }[] | null {
  const cites = [];
  let at = 0;
  for (;;) {
    CITE.lastIndex = at;
    const m = CITE.exec(inner);
    if (!m) break;
    cites.push({ sep: m[1], raw: m[2], name: m[3], pages: m[4] });
    at = CITE.lastIndex;
  }
  return cites.length > 0 && inner.slice(at).trim() === '' ? cites : null;
}

/**
 * A citation's pages, each run of up to LONGEST_RUN pages spread into its
 * pages. Null when a page is 0 or a run goes backwards: the citation is
 * garbled, so it stays as it was written.
 */
function citedPages(list: string): Cited[] | null {
  const out: Cited[] = [];
  for (const [, a, b] of list.matchAll(PAGE_OR_RUN)) {
    const from = Number(a);
    const to = b === undefined ? from : Number(b);
    if (from < 1 || to < from) return null;
    if (to - from + 1 > LONGEST_RUN) out.push({ from, to });
    else for (let page = from; page <= to; page++) out.push({ page });
  }
  return out;
}

/**
 * A citation's rulebook name as said, without "see", "also" or "see also"
 * before it or "rulebook" after: "(p. 3, see also p. 5)" is one rulebook.
 */
function citedName(text: string): string {
  return words(text).replace(/^ (see )?(also )?/, ' ').replace(/ (rulebook|rules) $/, ' ');
}

/** Text safe inside a Markdown link's [text]. */
const linkText = (text: string) => text.replace(/[\\[\]*_`]/g, '\\$&');

/**
 * An answer's page citations as links, one per page, to that page of the
 * rulebook they cite. The assistant names the rulebook whenever it was sent
 * more than one (a deck's games are all on their page 1, so "p. 1" alone
 * says nothing); a bare "(p. 5)" is the game's own rulebook only when it was
 * the one sent, and a bare page after a named one is in that same rulebook.
 * A name is a sent rulebook's tab label, game name or the server's name for
 * it (its part, or the game's slug for the game's own), and may carry the
 * game's name before it: "Ticket to Ride Europe" is Europe. A named
 * citation shows the tab label, which is what the tab strip calls it,
 * rather than the model's spelling.
 *
 * A link whose text doesn't say its rulebook ("p. 11") carries a title
 * that does, which the chat makes its accessible name: the text first, so
 * the name holds what is on screen (WCAG 2.5.3), then the tab label, or
 * for a game with one rulebook its name: "p. 11, Base game", "p. 4, Azul
 * rulebook". "Base game p. 5" says it already and has no title.
 *
 * A citation that names a rulebook it wasn't sent, or a page 0, stays as
 * written, with the separators written beside it, as does anything else in
 * parentheses. A page past the end of its rulebook is linked all the same:
 * the page count isn't known here, and the reader says so when it is asked
 * for one.
 */
export function linkCitations(answer: string, game: Game, shown: Rulebook): string {
  const books = rulebooks(game);
  const read = new Set(chatParts(game, shown));
  const sent = books.filter((b) => b.part === undefined || read.has(b.part));
  const names = (b: Rulebook) => [b.label, b.name, b.part ?? game.slug].map(words);
  return answer.replace(GROUP, (whole, inner: string) => {
    const cites = citesIn(inner);
    if (!cites) return whole;
    // Each citation's rulebook and pages, a run of the same rulebook as one,
    // or its words as written; each after the separator written before it.
    type Linked = { book: Rulebook; named: boolean; pages: Cited[] };
    const parts: { sep: string; cite: Linked | string }[] = [];
    let last: Rulebook | undefined;
    for (const [i, cite] of cites.entries()) {
      const name = citedName(cite.name).trim();
      let book: Rulebook | undefined;
      if (name !== '') book = sent.find((b) => names(b).some((n) => ` ${name} `.endsWith(n)));
      else book = i > 0 ? last : sent.length === 1 ? sent[0] : undefined;
      const pages = book && citedPages(cite.pages);
      last = pages ? book : undefined;
      const prev = parts.at(-1)?.cite;
      if (!book || !pages) parts.push({ sep: cite.sep, cite: cite.raw.trim() });
      else if (typeof prev === 'object' && prev.book === book) prev.pages.push(...pages);
      else parts.push({ sep: cite.sep, cite: { book, named: name !== '', pages } });
    }
    if (parts.every((p) => typeof p.cite === 'string')) return whole;
    const linked = ({ book, named, pages }: Linked) => {
      const where = books.length > 1 ? book.label : `${book.name} rulebook`;
      const link = (page: number, text: string, says: boolean) => {
        const title = says ? '' : ` "${`${text}, ${where}`.replace(/["\\]/g, '\\$&')}"`;
        return `[${linkText(text)}](${book.pdf}#page=${page}${title})`;
      };
      // The tab label only where there are tabs to tell apart.
      const label = named && books.length > 1 ? `${book.label} ` : '';
      const seen = new Set<string>();
      return pages.filter((p) => {
        const key = 'page' in p ? `${p.page}` : `${p.from}–${p.to}`;
        return !seen.has(key) && seen.add(key);
      }).map((p, i) => {
        const first = i === 0 ? label : '';
        return 'page' in p
          ? link(p.page, `${first}p. ${p.page}`, first !== '')
          : `${link(p.from, `${first}p. ${p.from}`, first !== '')}–${link(p.to, `p. ${p.to}`, false)}`;
      }).join(', ');
    };
    // Two linked rulebooks are split by "; "; words left as written keep
    // the separator they were written with.
    return `(${parts.map((p, i) => {
      const sep = i === 0 ? '' : typeof p.cite === 'string' || typeof parts[i - 1].cite === 'string' ? p.sep : '; ';
      return sep + (typeof p.cite === 'string' ? p.cite : linked(p.cite));
    }).join('')})`;
  });
}

/**
 * The rulebook and page a citation link (from linkCitations) opens, among
 * the game's own rulebooks; null for any other link, and for a page no
 * citation gives (0, or past 9999).
 */
export function citedPage(href: string, game: Game): { book: Rulebook; page: number } | null {
  const m = /^(.+)#page=([1-9]\d{0,3})$/.exec(href);
  if (!m) return null;
  const book = rulebooks(game).find((b) => b.pdf === m[1]);
  return book ? { book, page: Number(m[2]) } : null;
}

/** A table size to ask about: four where the game seats four, else the nearest it does. */
function seats(t: { min: number; max: number }): string {
  const n = Math.min(Math.max(4, t.min), t.max);
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}

/**
 * Three questions to start the rules assistant with on a tab, shaped by what
 * the tab is: a deck's overview asks across its games and a deck game's tab
 * names that game, an add-on (or one of its further rulebooks) asks what it
 * changes, a game's further rulebook what is new, and anything else the
 * setup, turn and win questions every table asks first.
 */
export function starterQuestions(game: Game, book: Rulebook): string[] {
  const subs = game.subgames ?? [];
  if (book.part === undefined) {
    if (isDeck(subs)) return [`Which of these games work for ${seats(game)}?`, `How do you play ${subs[0].name}?`, `How do you win at ${(subs[1] ?? subs[0]).name}?`];
    return [`How do we set up for ${seats(game)}?`, 'How does a turn go?', 'How do you win?'];
  }
  const sub = subs.find((s) => s.slug === book.part || s.moreRules?.some((r) => r.slug === book.part));
  if (!sub) return [`What's new in ${book.label}?`, 'How does a turn go?', 'How do you win?'];
  // A deck's games are all read on every tab, so a question names its game.
  if (isDeck(subs)) {
    const deal = sub.max === 1 ? `How do we deal ${sub.name}?` : `How do we deal ${sub.name} for ${seats(sub)}?`;
    return [deal, `How does a turn go in ${sub.name}?`, `How do you win at ${sub.name}?`];
  }
  return [`What does ${book.label} change?`, `How do we set up for ${seats(sub)}?`, 'How do you win?'];
}

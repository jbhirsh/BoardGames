// Reading a rules assistant's answer: the rulebooks it names (to link
// their tabs) and the pages it cites (to link those pages). The rulebook
// list itself, and which of them the assistant reads, are in rulebooks.ts.

import type { Game } from '../data/types';
import { chatParts, rulebooks, type Rulebook } from './rulebooks';

/** Lowercase words only: "Cities & Knights" and "cities and knights" match, as do "5–6" and "5-6". */
function bareWords(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * The tabs an assistant answer points to by name, in tab order: the
 * rulebooks it was told about but not sent (the game's own and those
 * chatParts sends are on its desk already). A tab counts as named by its
 * label or by the name the server gives it, built from its part
 * ("Monster Box Of Monsters" for the tab labelled "Monster Box 1").
 */
export function mentionedRulebooks(answer: string, game: Game, shown: Rulebook): Rulebook[] {
  const text = bareWords(answer);
  const read = new Set(chatParts(game, shown));
  return rulebooks(game).filter(
    (b) =>
      b.part !== undefined &&
      b.part !== shown.part &&
      !read.has(b.part) &&
      (text.includes(bareWords(b.label)) || text.includes(bareWords(b.part))),
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
  return bareWords(text)
    .replace(/^ (see )?(also )?/, ' ')
    .replace(/ (rulebook|rules) $/, ' ');
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
  const names = (b: Rulebook) => [b.label, b.name, b.part ?? game.slug].map(bareWords);
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
      return pages
        .filter((p) => {
          const key = 'page' in p ? `${p.page}` : `${p.from}–${p.to}`;
          return !seen.has(key) && seen.add(key);
        })
        .map((p, i) => {
          const first = i === 0 ? label : '';
          return 'page' in p
            ? link(p.page, `${first}p. ${p.page}`, first !== '')
            : `${link(p.from, `${first}p. ${p.from}`, first !== '')}–${link(p.to, `p. ${p.to}`, false)}`;
        })
        .join(', ');
    };
    // Two linked rulebooks are split by "; "; words left as written keep
    // the separator they were written with.
    return `(${parts
      .map((p, i) => {
        const sep = i === 0 ? '' : typeof p.cite === 'string' || typeof parts[i - 1].cite === 'string' ? p.sep : '; ';
        return sep + (typeof p.cite === 'string' ? p.cite : linked(p.cite));
      })
      .join('')})`;
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

/**
 * The rulebooks and pages an answer's citations open, each once, in the
 * order the answer cites them: the links linkCitations makes of them.
 */
export function citationsIn(answer: string, game: Game, shown: Rulebook): { book: Rulebook; page: number }[] {
  const found = new Map<string, { book: Rulebook; page: number }>();
  for (const [, href] of linkCitations(answer, game, shown).matchAll(/\]\(([^\s)]+)/g)) {
    const cited = citedPage(href, game);
    if (cited) found.set(href, cited);
  }
  return [...found.values()];
}

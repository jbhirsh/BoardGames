// Finding the passage a rules assistant's citation points to. A tapped
// citation brings the words of the answer it closes ("a 7 still moves the
// robber"); the cited page's text is searched for the stretch that shares
// the most of their meaningful words, and that stretch, widened to its
// sentences, is highlighted. The answer paraphrases the rulebook, so this
// is a fuzzy match, and it only counts when enough of the answer's words
// are there: a loose paraphrase is better left unhighlighted than pinned to
// the wrong rule.

import type { Match, TextRun } from './pdfSearch';

/** A word of a text: its stem, and where it is, as [start, end) offsets. */
export interface Word {
  stem: string;
  start: number;
  end: number;
}

const list = (text: string) => text.split(/\s+/).filter(Boolean);

// Words that say nothing about which rule is meant. Matched on the word as
// written (lowercased, apostrophes gone), before stemming.
const STOPWORDS = new Set(list(`
  a an the and or but nor if then than so as at by for from in into of off on onto to with within without
  is are was were be been being am do does did done doing have has had having
  it its this that these those there here which who whom whose what when where why how
  you your yours we our us they their them he she him her his i me my
  can cannot could may might must shall should will would not no only also just
  each every any all some both either neither other another such same more most very too
  out up down over under again once about after before until while during between through
  still even yes own instead however because since
  dont cant wont isnt arent doesnt didnt youre theyre thats theres
  page pages rule rules rulebook rulebooks
`));

// The fewest distinct answer words the passage must share, how many of
// those must be more than generic, and the share of the answer's words that
// must be found together on the page.
const MIN_MATCHED = 3;
const MIN_DISTINCT = 2;
const MIN_SHARE = 0.5;
// How many of the page's words a passage may run to, as a multiple of the
// answer's length (the rulebook is often wordier), with a floor for short ones.
const SPAN_FACTOR = 1.5;
const MIN_SPAN = 12;
// How far a passage is widened to the sentences it is in: back to the
// sentence's start, forward to its end, each only if that is this near.
const BACK_WORDS = 8;
const AHEAD_WORDS = 14;

// A run of letters or digits, with an apostrophe inside ("can’t") or a
// hyphen at a line break ("de-\nvelopment") kept as part of the word.
const WORD = /[\p{L}\p{N}]+(?:['’‘ʼ][\p{L}\p{N}]+)*(?:-\n[\p{L}\p{N}]+)*/gu;
const JOINS = /['’‘ʼ]|-\n/g;
const SUFFIXES = ['ies', 'ing', 'ed', 'es', 's'];
// Endings after which a doubled consonant is undoubled ("winning", "robbed").
const DOUBLING = new Set(['ing', 'ed', 'er']);

// Words every rulebook uses everywhere: they count toward a passage's
// share of the answer's words, but a passage needs more than these.
const GENERIC = new Set([...list('player card turn game take draw play hand deck put get use make give').map((w) => stem(w)), '1']);

// Number words as the digits rulebooks often print instead ("steal one" for "steal 1").
const NUMBERS = new Map(list('one two three four five six seven eight nine ten eleven twelve').map((w, i) => [w, String(i + 1)]));

/**
 * A light stem, so "moves", "moved", "moving" and "move" meet, and
 * "winner" and "win": a plural or tense ending comes off when at least
 * three letters are left ("-ies" turns to "y"), then an "-er", a doubled
 * consonant left by either ("winn"), and a final "e". Not a real stemmer:
 * it only needs to treat the answer and the page alike.
 */
export function stem(word: string): string {
  let base = word;
  let cut = '';
  if (!base.endsWith('ss')) {
    for (const suffix of SUFFIXES) {
      if (base.endsWith(suffix) && base.length - suffix.length >= 3) {
        base = base.slice(0, -suffix.length) + (suffix === 'ies' ? 'y' : '');
        cut = suffix;
        break;
      }
    }
  }
  if (base.endsWith('er') && base.length >= 5) {
    base = base.slice(0, -2);
    cut = 'er';
  }
  if (DOUBLING.has(cut) && /([^aeioulsfz])\1$/.test(base)) base = base.slice(0, -1);
  return base.length > 3 && base.endsWith('e') ? base.slice(0, -1) : base;
}

/** The words of a text, lowercased and stemmed, with where each one is. */
export function words(text: string): (Word & { plain: string })[] {
  return [...text.matchAll(WORD)].map((m) => {
    const plain = m[0].toLowerCase().replace(JOINS, '');
    return { plain, stem: NUMBERS.get(plain) ?? stem(plain), start: m.index, end: m.index + m[0].length };
  });
}

/** Whether a word can tell one rule from another: no stopword, and no stray letter. */
function meaningful(word: { plain: string }): boolean {
  return !STOPWORDS.has(word.plain) && (word.plain.length > 1 || /\d/.test(word.plain));
}

// A citation group's parentheses, "(p. 5)" or "(Catan p. 5, 11)".
const CITATION = /\([^()]*\bpp?\.\s*\d[^()]*\)/g;
// The end of a sentence: a full stop, question or exclamation mark (and any
// closing quote) before a space, or a line break.
const SENTENCE_END = /[.!?]['"’”]*\s|\n/g;

/**
 * The words of an answer a citation closes, given the answer's text before
 * the citation's link: back to the end of the sentence before it, or of
 * the citation before it, whichever is nearer ("and a 7 still moves the
 * robber" in "Knights stop the barbarians (p. 4), and a 7 still moves the
 * robber (p. 5)"). The citation's own open parenthesis, and any page it
 * names before this one ("(Catan p. 5, "), are left out.
 */
export function citingClause(before: string): string {
  const open = before.lastIndexOf('(');
  const text = open >= 0 && !before.includes(')', open) ? before.slice(0, open) : before;
  let from = 0;
  for (const m of text.matchAll(CITATION)) from = Math.max(from, m.index + m[0].length);
  for (const m of text.matchAll(SENTENCE_END)) from = Math.max(from, m.index + m[0].length);
  return text.slice(from).replace(/^[\s,;:–—-]+/, '').trim();
}

// A sentence's end in the text between two words, with any closing quote or
// bracket after it.
const ENDS = /^[^\p{L}\p{N}]*?[.!?]['"’”)\]]*/u;
// A line that starts with a capital, a digit or an opening bracket or quote:
// a heading's end, or a new paragraph's start, even with no full stop.
const NEW_LINE = /\n[^\S\n]*[\p{Lu}\p{N}(“"‘]/u;
const OPENERS = '(["“‘';

/** The length of the longest run of `a` found, in order, in `b`. */
function inOrder(a: readonly string[], b: readonly string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const next = [0];
    for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
    row = next;
  }
  return row[b.length];
}

/**
 * The passage of a page's text that a citing clause most likely points to,
 * as [start, end) offsets into the page's text, or null when no stretch of
 * the page shares enough of its words.
 *
 * A passage starts at a word of the clause and runs at most about the
 * clause's length. It counts only with at least three of the clause's
 * meaningful words, two of them more than the words every rulebook uses
 * (player, card, turn…), and at least half of them; and if it runs over a
 * sentence end, with more than three, since three words spread over two
 * sentences are as likely a coincidence. Of those, the best shares the
 * most of the clause's words, a word every rulebook uses counting half and
 * each sentence end crossed costing half a word; then the one crossing
 * fewer; then the one whose words are rarer on the page (so "robber" says
 * more than "player"); then the shortest; then the one with more of them
 * in the clause's order.
 *
 * It is then widened to the sentences it is in, where their ends are near:
 * back to a full stop, or to a line that starts with a capital (a heading's
 * or paragraph's start), and forward to a full stop, so its marks begin
 * and end where the page's text items do. `breaks` are offsets where the
 * page's lettering changes at a line break (lineBreaks: a heading's other
 * type), which count as sentence ends: a widening never crosses one.
 */
export function findCited(page: string, clause: string, breaks: readonly number[] = []): Match | null {
  const said = words(clause);
  const order = [...new Set(said.filter(meaningful).map((w) => w.stem))];
  const wanted = new Set(order);
  if (wanted.size < MIN_MATCHED) return null;
  const all = words(page);
  const freq = new Map<string, number>();
  for (const w of all) if (wanted.has(w.stem)) freq.set(w.stem, (freq.get(w.stem) ?? 0) + 1);
  const span = Math.max(MIN_SPAN, Math.round(said.length * SPAN_FACTOR));
  const gap = (k: number) => page.slice(all[k].end, all[k + 1]?.start ?? page.length);
  const crosses = (a: number, b: number) => breaks.some((at) => at > a && at <= b);
  // A sentence ends after word k, or a heading does.
  const endsAfter = all.map((w, k) => ENDS.test(gap(k)) || crosses(w.end, all[k + 1]?.start ?? page.length));

  type Window = { found: string[]; crossed: number; ordered: number; rarity: number; from: number; to: number };
  let best: Window | null = null;
  for (let i = 0; i < all.length; i++) {
    if (!wanted.has(all[i].stem)) continue;
    const found: string[] = [];
    let rarity = 0;
    let to = i;
    let crossing = 0;
    let crossed = 0;
    for (let j = i; j < Math.min(all.length, i + span); j++) {
      if (j > i && endsAfter[j - 1]) crossing++;
      const s = all[j].stem;
      if (!wanted.has(s) || found.includes(s)) continue;
      found.push(s);
      if (!GENERIC.has(s)) rarity += 1 / freq.get(s)!;
      to = j;
      crossed = crossing;
    }
    const distinct = found.filter((s) => !GENERIC.has(s)).length;
    if (found.length < MIN_MATCHED || distinct < MIN_DISTINCT || found.length < wanted.size * MIN_SHARE) continue;
    // Three words spread over two sentences are as likely a coincidence.
    if (crossed > 0 && found.length <= MIN_MATCHED) continue;
    const window = { found, crossed, ordered: inOrder(order, found), rarity, from: i, to };
    if (best === null || better(window, best)) best = window;
  }
  if (!best) return null;
  return widen(page, all, endsAfter, best.from, best.to);
}

/** Whether one candidate passage beats another (see findCited). */
function better(a: { found: string[]; crossed: number; ordered: number; rarity: number; from: number; to: number }, b: typeof a): boolean {
  const net = (w: typeof a) => w.found.reduce((sum, s) => sum + (GENERIC.has(s) ? 0.5 : 1), 0) - w.crossed / 2;
  if (net(a) !== net(b)) return net(a) > net(b);
  if (a.crossed !== b.crossed) return a.crossed < b.crossed;
  if (Math.abs(a.rarity - b.rarity) > 1e-9) return a.rarity > b.rarity;
  if (a.to - a.from !== b.to - b.from) return a.to - a.from < b.to - b.from;
  return a.ordered > b.ordered;
}

/**
 * A passage from word `from` to word `to`, widened to the start and end of
 * its sentences where they are near (see findCited); left as it is at a
 * side where they aren't.
 */
function widen(page: string, all: readonly Word[], endsAfter: readonly boolean[], from: number, to: number): Match {
  let start = all[from].start;
  for (let k = from, n = 0; n <= BACK_WORDS; k--, n++) {
    // A sentence, heading or paragraph starts at word k.
    if (k === 0 || endsAfter[k - 1] || NEW_LINE.test(page.slice(all[k - 1].end, all[k].start + 1))) {
      start = all[k].start;
      // With the bracket or quote it opens with: "(2) Then…", "“Distance…".
      while (start > 0 && OPENERS.includes(page[start - 1])) start--;
      break;
    }
  }
  let end = all[to].end;
  for (let k = to, n = 0; n <= AHEAD_WORDS && k < all.length; k++, n++) {
    if (endsAfter[k]) {
      // Through its full stop, or to the end of a heading, which has none.
      end = all[k].end + (ENDS.exec(page.slice(all[k].end))?.[0].length ?? 0);
      break;
    }
  }
  return [start, end];
}

/** A text item with its lettering, as pdf.js gives it: a font and a transform whose fourth number is its height. */
export interface StyledRun extends TextRun {
  fontName?: string;
  transform?: readonly number[];
}

/**
 * Where a page's lettering changes at a line break, as offsets into its
 * text (`starts` from pageText): a line set in another font or size than
 * the line before it, such as a heading's first or last line. A passage is
 * never widened across one (findCited).
 */
export function lineBreaks(runs: readonly StyledRun[], starts: readonly number[]): number[] {
  const out: number[] = [];
  let last: StyledRun | null = null;
  let newLine = false;
  runs.forEach((run, i) => {
    if (run.str.trim() !== '') {
      if (last && newLine && (run.fontName !== last.fontName || run.transform?.[3] !== last.transform?.[3])) out.push(starts[i]);
      last = run;
      newLine = false;
    }
    if (run.hasEOL) newLine = true;
  });
  return out;
}

/** The first few words of a passage, for a screen reader: "If you roll a 7…". */
export function passageStart(text: string, count = 6): string {
  const first = text.trim().split(/\s+/);
  return first.length > count ? `${first.slice(0, count).join(' ')}…` : first.join(' ');
}

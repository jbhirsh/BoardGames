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

import type { Game, SubGameKind } from '../data/types';
import { isDeck } from './filterGames';

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

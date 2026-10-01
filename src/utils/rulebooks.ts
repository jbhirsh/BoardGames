import type { Game, SubGameKind } from '../data/types';
import { isDeck } from './filterGames';

export interface Rulebook {
  /** The sub-game's slug, or undefined for the game's own rulebook. */
  part?: string;
  /** What its tab says. */
  label: string;
  name: string;
  short: string;
  pdf: string;
  kind?: SubGameKind;
}

/**
 * Every rulebook a game's rules page can show: its own first, then its
 * further rulebooks (moreRules), then one for each game inside it that has a
 * bundled rulebook. A deck's own sheet is an overview of its games; anything
 * else's is the base game, unless the game names its tab.
 */
export function rulebooks(game: Game): Rulebook[] {
  const subs = game.subgames ?? [];
  return [
    { label: game.rulesLabel ?? (isDeck(subs) ? 'Overview' : 'Base game'), name: game.name, short: game.short, pdf: game.rules },
    ...(game.moreRules ?? []).map((r) => ({
      part: r.slug, label: r.label, name: `${game.name}: ${r.label}`, short: game.short, pdf: r.pdf,
    })),
    ...subs.filter((s) => s.rules).map((s) => ({
      part: s.slug, label: s.name, name: s.name, short: s.short, pdf: s.rules!, kind: s.kind,
    })),
  ];
}

/**
 * Which extra rulebooks the rules assistant reads with the game's own; every
 * one adds thousands of tokens to each question, so only what the tab on
 * screen needs. The game's further rulebooks (moreRules) build on each other,
 * a box at a time, so its tab and the ones before it: Game 5 needs the house
 * dice from Game 4. Of the games inside it: every one for a deck, whose games
 * are short and separate, so any of them can be asked about from any tab;
 * otherwise only the one on screen, since an expansion changes the base
 * game's rules and all of them at once crowd out the answer. An add-on's tab
 * also takes all of the game's further rulebooks: it is played on top of the
 * finished game (the Monster Box assumes Hogwarts Battle through Game 7).
 */
export function chatParts(game: Game, shown: Rulebook): string[] {
  const own = (game.moreRules ?? []).map((r) => r.slug);
  if (isDeck(game.subgames)) return rulebooks(game).filter((b) => b.kind !== undefined).map((b) => b.part!);
  const upTo = own.indexOf(shown.part ?? '');
  if (upTo >= 0) return own.slice(0, upTo + 1);
  return shown.kind !== undefined ? [...own, shown.part!] : [];
}

/** Where a game's rules page shows the given rulebook. */
export function rulebookPath(slug: string, part?: string): string {
  return part ? `/rules/${slug}/${part}` : `/rules/${slug}`;
}

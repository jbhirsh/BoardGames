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
 * Every rulebook a game's rules page can show: its own first, then one for
 * each game inside it that has a bundled rulebook. A deck's own sheet is an
 * overview of its games; anything else's is the base game.
 */
export function rulebooks(game: Game): Rulebook[] {
  const subs = game.subgames ?? [];
  return [
    { label: isDeck(subs) ? 'Overview' : 'Base game', name: game.name, short: game.short, pdf: game.rules },
    ...subs.filter((s) => s.rules).map((s) => ({
      part: s.slug, label: s.name, name: s.name, short: s.short, pdf: s.rules!, kind: s.kind,
    })),
  ];
}

/**
 * Which rulebooks of games inside this one the rules assistant reads with the
 * game's own: every one for a deck, whose games are short and separate, so
 * any of them can be asked about from any tab; otherwise only the one on
 * screen, since an expansion changes the base game's rules and both at once
 * crowd out the answer.
 */
export function chatParts(game: Game, shown: Rulebook): string[] {
  const books = rulebooks(game).filter((b) => b.part !== undefined);
  if (isDeck(game.subgames)) return books.map((b) => b.part!);
  return shown.part !== undefined ? [shown.part] : [];
}

/** Where a game's rules page shows the given rulebook. */
export function rulebookPath(slug: string, part?: string): string {
  return part ? `/rules/${slug}/${part}` : `/rules/${slug}`;
}

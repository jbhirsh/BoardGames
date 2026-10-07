// 7 Wonders scoring, as the printed score pad adds it up.

export const SCIENCE_SYMBOLS = ['tablets', 'compasses', 'gears'] as const;
export type ScienceSymbol = typeof SCIENCE_SYMBOLS[number];
export type Symbols = Record<ScienceSymbol, number>;

/** Each symbol scores its count squared; each full set of three scores 7 more. */
export function scienceScore({ tablets, compasses, gears }: Symbols): number {
  return tablets * tablets + compasses * compasses + gears * gears + 7 * Math.min(tablets, compasses, gears);
}

/** One point for every three coins. */
export function treasuryScore(coins: number): number {
  return Math.floor(coins / 3);
}

export interface Tally {
  military: number;
  coins: number;
  wonder: number;
  civilian: number;
  commercial: number;
  guilds: number;
  symbols: Symbols;
}

export interface Breakdown {
  military: number;
  treasury: number;
  wonder: number;
  civilian: number;
  science: number;
  commercial: number;
  guilds: number;
  total: number;
}

/** A player's points in each of the pad's rows, and the total. */
export function breakdown(t: Tally): Breakdown {
  const rows = {
    military: t.military,
    treasury: treasuryScore(t.coins),
    wonder: t.wonder,
    civilian: t.civilian,
    science: scienceScore(t.symbols),
    commercial: t.commercial,
    guilds: t.guilds,
  };
  return { ...rows, total: Object.values(rows).reduce((sum, vp) => sum + vp, 0) };
}

export interface Standing {
  /** Index into the players as given. */
  player: number;
  /** 1 for the winner; players tied on points and coins share a place. */
  place: number;
}

/**
 * Places by total, ties broken by coins left in the treasury (the rulebook's
 * rule); players level on both share the place.
 */
export function standings(scores: readonly { total: number; coins: number }[]): Standing[] {
  const order = scores.map((s, player) => ({ ...s, player }))
    .sort((a, b) => b.total - a.total || b.coins - a.coins);
  return order.map((s) => ({
    player: s.player,
    place: order.findIndex((o) => o.total === s.total && o.coins === s.coins) + 1,
  }));
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

function names(list: readonly string[]): string {
  return list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * One sentence for each total two or more players share, saying how the
 * coins settled it, or that they didn't. Players come in standings order.
 */
export function tieBreaks(ranked: readonly { name: string; total: number; coins: number; place: number }[]): string[] {
  const notes: string[] = [];
  for (const total of new Set(ranked.map((p) => p.total))) {
    const tied = ranked.filter((p) => p.total === total);
    if (tied.length < 2) continue;
    const who = names(tied.map((p) => p.name));
    if (tied.every((p) => p.coins === tied[0].coins)) {
      notes.push(`${who} tie on ${total} VP and ${tied[0].coins} coins, so they share ${ordinal(tied[0].place)} place.`);
      continue;
    }
    // Coins settle it, except between players level on coins too.
    const still = [...new Set(tied.map((p) => p.place))]
      .map((place) => tied.filter((p) => p.place === place))
      .filter((group) => group.length > 1)
      .map((group) => ` ${names(group.map((p) => p.name))} still share ${ordinal(group[0].place)}.`);
    notes.push(`${who} tie on ${total} VP; coins break the tie: ${tied.map((p) => `${p.name} ${p.coins}`).join(', ')}.${still.join('')}`);
  }
  return notes;
}

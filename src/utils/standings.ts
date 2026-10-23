// Places at the end of a game, for the score pads past 7 Wonders (which
// keeps its own, utils/sevenWonders.ts): by total, then by the game's
// tie-breaks in turn, players level on all of them sharing the place.

/** A tie-break: what it's called in a note, and each player's value, more being better. */
export interface TieBreak {
  /** As the note reads it, "broken on tickets completed". */
  label: string;
  values: readonly number[];
  /** A value as the note shows it; the number itself when absent. */
  show?: (value: number) => string;
}

/**
 * Each player's place, 1 for the winner, by `totals` (more being better;
 * pass them negated where the lowest wins), then each tie-break in turn.
 * Players level on everything share the place, and the next place skips
 * as many ("1st, 1st, 3rd").
 */
export function places(totals: readonly number[], breaks: readonly TieBreak[] = []): number[] {
  const keys = totals.map((total, i) => [total, ...breaks.map((b) => b.values[i])]);
  const beats = (a: number[], b: number[]) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
  };
  return keys.map((mine) => 1 + keys.filter((theirs) => beats(theirs, mine)).length);
}

function names(list: readonly string[]): string {
  return list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const last = n % 10;
  return `${n}${!teen && last === 1 ? 'st' : !teen && last === 2 ? 'nd' : !teen && last === 3 ? 'rd' : 'th'}`;
}

/**
 * One sentence for each total two or more players share, saying which
 * tie-break settled it, or that none did. `shown` is each total as the
 * sheet shows it ("98 points").
 */
export function tieNotes(
  players: readonly string[],
  shown: readonly string[],
  totals: readonly number[],
  breaks: readonly TieBreak[],
): string[] {
  const placed = places(totals, breaks);
  const notes: string[] = [];
  for (const total of [...new Set(totals)].sort((a, b) => b - a)) {
    const tied = totals.flatMap((t, i) => (t === total ? [i] : []));
    if (tied.length < 2) continue;
    const who = names(tied.map((i) => players[i]));
    const settles = breaks.find((b) => tied.some((i) => b.values[i] !== b.values[tied[0]]));
    if (!settles) {
      notes.push(`${who} tie on ${shown[tied[0]]}${breaks.length ? ' and every tie-break' : ''}, so they share ${ordinal(placed[tied[0]])} place.`);
      continue;
    }
    const still = [...new Set(tied.map((i) => placed[i]))]
      .map((place) => tied.filter((i) => placed[i] === place))
      .filter((group) => group.length > 1)
      .map((group) => ` ${names(group.map((i) => players[i]))} still share ${ordinal(placed[group[0]])}.`);
    const value = (i: number) => (settles.show ?? String)(settles.values[i]);
    const counts = tied.map((i) => `${players[i]} ${value(i)}`).join(', ');
    notes.push(`${who} tie on ${shown[tied[0]]}, broken on ${settles.label}: ${counts}.${still.join('')}`);
  }
  return notes;
}

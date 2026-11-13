import type { Award } from '../data/types';

/** Whether an honour is a win: BoardGameGeek's `Winner`, as the owner's own awards are too. */
const isWin = (a: Award): boolean => a.result === 'Winner';

/** A game's honours as the awards pill and section show them: the wins, newest first, then the rest, newest first. */
export function splitHonours(awards: readonly Award[]): { wins: Award[]; others: Award[] } {
  const newest = [...awards].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
  return { wins: newest.filter(isWin), others: newest.filter((a) => !isWin(a)) };
}

/** One honour in one format everywhere: "Golden Geek Best Cooperative Game, 2017", then " · Nominee" for anything that isn't a win. */
export function awardLine(a: Award): string {
  const named = a.year === undefined ? a.name : `${a.name}, ${a.year}`;
  return isWin(a) ? named : `${named} · ${a.result}`;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** What a result's count reads as: "Nominated 14 times", "Recommended once", "2nd Place twice". */
function resultCount(result: string, n: number): string {
  if (result === 'Nominee') return `Nominated ${times(n)}`;
  if (result === 'Finalist') return `A finalist ${times(n)}`;
  return `${result} ${times(n)}`;
}

/**
 * The honours that aren't wins, counted by result, most first: "Nominated
 * 14 times · Recommended once". Empty for none.
 */
export function honoursSummary(others: readonly Award[]): string {
  const counts = new Map<string, number>();
  for (const a of others) counts.set(a.result, (counts.get(a.result) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([result, n]) => resultCount(result, n))
    .join(' · ');
}

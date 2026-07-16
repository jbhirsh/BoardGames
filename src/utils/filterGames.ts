import type { Game, FilterState } from '../data/types';
import { GROUP_ORDER, KW } from '../data/keywords';

export function filterGames(games: Game[], state: FilterState): Game[] {
  let list = games;

  // Filter on the curated `cat` field, not a re-derivation from `mins`. The
  // clickable DurationPill and SET_DURATION both use `game.cat`, so filtering
  // by anything else lets the two disagree — e.g. a 90-minute game tagged
  // "medium" would vanish when you click its own "medium" pill.
  if (state.duration !== 'all') list = list.filter(g => g.cat === state.duration);

  if (state.players > 0) list = list.filter(g => g.min <= state.players && g.max >= state.players);

  if (state.keywords.size > 0) {
    const match = state.keywordMode === 'and' ? 'every' : 'some';
    list = list.filter(g => [...state.keywords][match](k => g.kw.includes(k)));
  }

  if (state.search) {
    const q = state.search.toLowerCase().trim();
    list = list.filter(g => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q));
  }

  return sortGames(list, state.sort);
}

const CAT_ORDER = { quick: 0, medium: 1, long: 2 } as const;

export function sortGames(list: Game[], sort: string): Game[] {
  if (sort === 'az' || sort === 'name-asc')  return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
  if (sort === 'quick' || sort === 'dur-asc') return [...list].sort((a, b) => a.mins - b.mins || CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
  if (sort === 'long'  || sort === 'dur-desc') return [...list].sort((a, b) => b.mins - a.mins || CAT_ORDER[b.cat] - CAT_ORDER[a.cat]);
  if (sort === 'players-asc')  return [...list].sort((a, b) => a.min - b.min || a.max - b.max);
  if (sort === 'players-desc') return [...list].sort((a, b) => b.min - a.min || b.max - a.max);
  // group
  return [...list].sort((a, b) => {
    const gi = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return gi !== 0 ? gi : a.name.localeCompare(b.name);
  });
}

export function sortedKw(kw: string[]): string[] {
  return [...kw].sort((a, b) => (KW[a as keyof typeof KW] || a).localeCompare(KW[b as keyof typeof KW] || b));
}

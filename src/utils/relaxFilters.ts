import type { FilterState, KeywordId, KeywordMode } from '../data/types';
import { DUR_LABELS, KW, playersLabel } from '../data/keywords';

/** One filter that's narrowing the list, and the state without it. */
export interface ActiveFilter {
  id: 'duration' | 'players' | 'search' | `kw:${KeywordId}`;
  label: string;
  without: FilterState;
}

/** The filters in play, in the order the filter bar shows them. */
export function activeFilters(state: FilterState): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (state.duration !== 'all') {
    // Lower case: it reads inside a sentence ("Filtering for up to 30 min").
    out.push({ id: 'duration', label: DUR_LABELS[state.duration].toLowerCase(), without: { ...state, duration: 'all' } });
  }
  if (state.players > 0) {
    out.push({ id: 'players', label: playersLabel(state.players), without: { ...state, players: 0 } });
  }
  for (const k of state.keywords) {
    const keywords = new Set(state.keywords);
    keywords.delete(k);
    out.push({ id: `kw:${k}`, label: KW[k], without: { ...state, keywords } });
  }
  if (state.search.trim()) {
    out.push({ id: 'search', label: `“${state.search.trim()}”`, without: { ...state, search: '' } });
  }
  return out;
}

/** A filter worth dropping: how many results the list would have without it. */
export interface Relaxation extends ActiveFilter {
  count: number;
}

/** The filters that, dropped alone, would bring results back, most first. */
export function relaxations(state: FilterState, countWith: (s: FilterState) => number): Relaxation[] {
  return activeFilters(state)
    .map((f) => ({ ...f, count: countWith(f.without) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * "4 players, up to 15 min and Strategy". In "any keyword" mode the keywords are
 * one alternative, not several requirements: "4 players and Strategy or Party".
 */
export function listFilters(filters: ActiveFilter[], keywordMode: KeywordMode = 'and'): string {
  let labels = filters.map((f) => f.label);
  if (keywordMode === 'or') {
    const kws = filters.filter((f) => f.id.startsWith('kw:')).map((f) => f.label);
    const rest = filters.filter((f) => !f.id.startsWith('kw:')).map((f) => f.label);
    labels = kws.length ? [...rest, kws.join(' or ')] : rest;
  }
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

import type { FilterState, KeywordId, KeywordMode } from '../data/types';
import { DUR_LABELS, KW, playersLabel } from '../data/keywords';
import { initialFilterState } from '../data/initialFilterState';
import { filterOn, withFilters, type FilterPatch } from './filterState';

/**
 * One filter that's narrowing the list, and the change that drops it: only
 * the field it sits in, so SET_FILTERS leaves the sort, view and list alone.
 */
export interface ActiveFilter {
  id: 'duration' | 'players' | 'search' | `kw:${KeywordId}`;
  label: string;
  without: FilterPatch;
}

/** The filters in play, in the order the filter bar shows them. */
export function activeFilters(state: FilterState): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (filterOn(state, 'duration')) {
    // Lower case: it reads inside a sentence ("Filtering for up to 30 min").
    out.push({ id: 'duration', label: DUR_LABELS[state.duration].toLowerCase(), without: { duration: initialFilterState.duration } });
  }
  if (filterOn(state, 'players')) {
    out.push({ id: 'players', label: playersLabel(state.players), without: { players: initialFilterState.players } });
  }
  for (const k of state.keywords) {
    const keywords = new Set(state.keywords);
    keywords.delete(k);
    out.push({ id: `kw:${k}`, label: KW[k], without: { keywords } });
  }
  // Blank space searches for nothing, so it isn't a filter to name or drop.
  if (state.search.trim()) {
    out.push({ id: 'search', label: `“${state.search.trim()}”`, without: { search: initialFilterState.search } });
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
    .map((f) => ({ ...f, count: countWith(withFilters(state, f.without)) }))
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

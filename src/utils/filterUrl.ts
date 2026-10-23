import type {
  BaseSort,
  CollectionMode,
  DurationFilter,
  FilterState,
  KeywordId,
  KeywordMode,
  TimeBudget,
  ViewMode,
} from '../data/types';
import { KW, TIME_BUDGETS } from '../data/keywords';
import { initialFilterState } from '../data/initialFilterState';
import { filterOn, sortAllowed } from './filterState';

// Links from before the duration filter became a time budget name a bucket
// (d=quick|medium|long). Each opens the budget that still shows its games;
// "long" (60+ min) had no upper end, so it opens with no time filter.
const LEGACY_DURATIONS: Record<string, DurationFilter> = { quick: 15, medium: 60, long: 'all' };
const KEYWORD_MODES: Exclude<KeywordMode, 'or'>[] = ['and'];
const VIEWS: Exclude<ViewMode, 'list'>[] = ['grid'];
const COLLECTIONS: Exclude<CollectionMode, 'own'>[] = ['want'];
// Column sorts are a passing look at the list and never go in a link.
const SORTS: BaseSort[] = ['az', 'group', 'quick', 'long', 'votes'];

// Compile-time completeness checks: if a new non-default value is added to
// the underlying type and forgotten in one of the whitelists above, the
// matching assertion fails to typecheck.
type _KeywordModesExhaustive =
  Exclude<Exclude<KeywordMode, 'or'>, (typeof KEYWORD_MODES)[number]> extends never
    ? true
    : 'KEYWORD_MODES is missing a KeywordMode value';
const _keywordModesExhaustive: _KeywordModesExhaustive = true;
void _keywordModesExhaustive;

type _ViewsExhaustive =
  Exclude<Exclude<ViewMode, 'list'>, (typeof VIEWS)[number]> extends never ? true : 'VIEWS is missing a ViewMode value';
const _viewsExhaustive: _ViewsExhaustive = true;
void _viewsExhaustive;

type _CollectionsExhaustive =
  Exclude<Exclude<CollectionMode, 'own'>, (typeof COLLECTIONS)[number]> extends never
    ? true
    : 'COLLECTIONS is missing a CollectionMode value';
const _collectionsExhaustive: _CollectionsExhaustive = true;
void _collectionsExhaustive;

type _SortsExhaustive =
  Exclude<BaseSort, (typeof SORTS)[number]> extends never ? true : 'SORTS is missing a BaseSort value';
const _sortsExhaustive: _SortsExhaustive = true;
void _sortsExhaustive;

const VALID_KEYWORDS = new Set(Object.keys(KW) as KeywordId[]);
const MAX_PLAYERS = 99;

export function filterToSearchParams(state: FilterState): URLSearchParams {
  // Each value is written only when it differs from the one a bare URL
  // reads as (initialFilterState), so the shortest link opens the same view.
  const params = new URLSearchParams();
  const initial = initialFilterState;
  if (filterOn(state, 'duration')) params.set('d', String(state.duration));
  if (filterOn(state, 'players')) params.set('p', String(state.players));
  if (filterOn(state, 'keywords')) {
    params.set('k', [...state.keywords].sort().join(','));
  }
  if (state.keywordMode !== initial.keywordMode) params.set('m', state.keywordMode);
  if (filterOn(state, 'search')) params.set('q', state.search);
  if (state.baseSort !== initial.baseSort) params.set('s', state.baseSort);
  if (state.view !== initial.view) params.set('v', state.view);
  if (state.collection !== initial.collection) params.set('c', state.collection);
  return params;
}

function parseDuration(d: string | null): DurationFilter {
  if (!d) return initialFilterState.duration;
  if (Object.hasOwn(LEGACY_DURATIONS, d)) return LEGACY_DURATIONS[d];
  const mins = Number(d);
  return TIME_BUDGETS.includes(mins as TimeBudget) ? (mins as TimeBudget) : initialFilterState.duration;
}

export function searchParamsToFilter(params: URLSearchParams): FilterState {
  const duration = parseDuration(params.get('d'));

  const p = params.get('p');
  const players = (() => {
    if (!p) return initialFilterState.players;
    const n = Number(p);
    return Number.isInteger(n) && n > 0 && n <= MAX_PLAYERS ? n : initialFilterState.players;
  })();

  const keywords = new Set<KeywordId>();
  const k = params.get('k');
  if (k) {
    for (const raw of k.split(',')) {
      const kw = raw.trim() as KeywordId;
      if (VALID_KEYWORDS.has(kw)) keywords.add(kw);
    }
  }

  const m = params.get('m');
  const keywordMode: KeywordMode =
    m && (KEYWORD_MODES as readonly string[]).includes(m) ? (m as KeywordMode) : initialFilterState.keywordMode;

  const search = params.get('q') ?? initialFilterState.search;

  const s = params.get('s');
  const parsedSort: BaseSort =
    s && (SORTS as readonly string[]).includes(s) ? (s as BaseSort) : initialFilterState.baseSort;

  const v = params.get('v');
  const view: ViewMode = v && (VIEWS as readonly string[]).includes(v) ? (v as ViewMode) : initialFilterState.view;

  const c = params.get('c');
  const collection: CollectionMode =
    c && (COLLECTIONS as readonly string[]).includes(c) ? (c as CollectionMode) : initialFilterState.collection;
  const sort = sortAllowed(parsedSort, collection) ? parsedSort : initialFilterState.baseSort;

  return {
    duration,
    players,
    keywords,
    keywordMode,
    search,
    sort,
    baseSort: sort,
    view,
    collection,
  };
}

// `origin` is the page's (window.location.origin), passed in by the caller
// so this stays free of the browser globals.
export function buildShareUrl(state: FilterState, origin: string): string {
  const query = filterToSearchParams(state).toString();
  return query ? `${origin}/?${query}` : `${origin}/`;
}

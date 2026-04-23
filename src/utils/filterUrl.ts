import type {
  DurationFilter,
  FilterState,
  KeywordId,
  KeywordMode,
  SortMode,
  ViewMode,
} from '../data/types';
import { KW } from '../data/keywords';
import { initialFilterState } from '../context/filterReducer';

const DURATIONS: DurationFilter[] = ['quick', 'medium', 'long'];
const KEYWORD_MODES: KeywordMode[] = ['and', 'or'];
const VIEWS: ViewMode[] = ['grid', 'list'];
const SORTS: SortMode[] = [
  'az', 'group', 'quick', 'long',
  'name-asc', 'name-desc',
  'dur-asc', 'dur-desc',
  'players-asc', 'players-desc',
];

const VALID_KEYWORDS = new Set(Object.keys(KW) as KeywordId[]);
const MAX_PLAYERS = 99;

export function filterToSearchParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.duration !== 'all') params.set('d', state.duration);
  if (state.players > 0) params.set('p', String(state.players));
  if (state.keywords.size > 0) {
    params.set('k', [...state.keywords].sort().join(','));
  }
  if (state.keywordMode !== 'or') params.set('m', state.keywordMode);
  if (state.search) params.set('q', state.search);
  if (state.baseSort !== 'az') params.set('s', state.baseSort);
  if (state.view !== 'list') params.set('v', state.view);
  return params;
}

export function searchParamsToFilter(params: URLSearchParams): FilterState {
  const state: FilterState = {
    ...initialFilterState,
    keywords: new Set<KeywordId>(),
  };

  const d = params.get('d');
  if (d && DURATIONS.includes(d as DurationFilter)) {
    state.duration = d as DurationFilter;
  }

  const p = params.get('p');
  if (p) {
    const n = Number.parseInt(p, 10);
    if (Number.isFinite(n) && n > 0 && n <= MAX_PLAYERS) state.players = n;
  }

  const k = params.get('k');
  if (k) {
    for (const raw of k.split(',')) {
      const kw = raw.trim() as KeywordId;
      if (VALID_KEYWORDS.has(kw)) state.keywords.add(kw);
    }
  }

  const m = params.get('m');
  if (m && KEYWORD_MODES.includes(m as KeywordMode)) {
    state.keywordMode = m as KeywordMode;
  }

  const q = params.get('q');
  if (q) state.search = q;

  const s = params.get('s');
  if (s && SORTS.includes(s as SortMode)) {
    state.sort = s as SortMode;
    state.baseSort = s as SortMode;
  }

  const v = params.get('v');
  if (v && VIEWS.includes(v as ViewMode)) state.view = v as ViewMode;

  return state;
}

export function buildShareUrl(state: FilterState): string {
  const origin = window.location.origin;
  const query = filterToSearchParams(state).toString();
  return query ? `${origin}/?${query}` : `${origin}/`;
}

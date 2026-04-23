import type {
  DurationFilter,
  FilterState,
  KeywordId,
  KeywordMode,
  SortMode,
  ViewMode,
} from '../data/types';
import { KW } from '../data/keywords';
import { initialFilterState } from '../data/initialFilterState';

const DURATIONS: DurationFilter[] = ['quick', 'medium', 'long'];
const KEYWORD_MODES: Exclude<KeywordMode, 'or'>[] = ['and'];
const VIEWS: ViewMode[] = ['grid', 'list'];
const SORTS: Exclude<SortMode, `${string}-${'asc' | 'desc'}`>[] = [
  'az', 'group', 'quick', 'long',
];

// Compile-time completeness check: if a new non-column SortMode is added to
// the type and forgotten here, this becomes an error-descriptor type and the
// assignment on the next line fails to typecheck.
type _SortsExhaustive = Exclude<
  Exclude<SortMode, `${string}-${'asc' | 'desc'}`>,
  (typeof SORTS)[number]
> extends never
  ? true
  : 'SORTS is missing a non-column SortMode value';
const _sortsExhaustive: _SortsExhaustive = true;
void _sortsExhaustive;

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
  if (
    state.baseSort !== 'az' &&
    (SORTS as readonly string[]).includes(state.baseSort)
  ) {
    params.set('s', state.baseSort);
  }
  if (state.view !== 'list') params.set('v', state.view);
  return params;
}

export function searchParamsToFilter(params: URLSearchParams): FilterState {
  const d = params.get('d');
  const duration: DurationFilter =
    d && DURATIONS.includes(d as DurationFilter) ? (d as DurationFilter) : initialFilterState.duration;

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
    m && (KEYWORD_MODES as readonly string[]).includes(m)
      ? (m as KeywordMode)
      : initialFilterState.keywordMode;

  const search = params.get('q') ?? initialFilterState.search;

  const s = params.get('s');
  const sort: SortMode =
    s && (SORTS as readonly string[]).includes(s) ? (s as SortMode) : initialFilterState.sort;

  const v = params.get('v');
  const view: ViewMode =
    v && VIEWS.includes(v as ViewMode) ? (v as ViewMode) : initialFilterState.view;

  return {
    duration,
    players,
    keywords,
    keywordMode,
    search,
    sort,
    baseSort: sort,
    view,
  };
}

export function buildShareUrl(
  state: FilterState,
  origin: string = window.location.origin,
): string {
  const query = filterToSearchParams(state).toString();
  return query ? `${origin}/?${query}` : `${origin}/`;
}

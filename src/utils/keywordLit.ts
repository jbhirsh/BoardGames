import type { FilterState, KeywordId } from '../data/types';
import { KW } from '../data/keywords';

/** A keyword pill lights when it is selected, or when the search text names it. */
export function isKeywordLit(state: FilterState, kw: KeywordId): boolean {
  return state.keywords.has(kw) || (!!state.search && KW[kw].toLowerCase().includes(state.search.toLowerCase().trim()));
}

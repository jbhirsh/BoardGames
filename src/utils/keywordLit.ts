import type { FilterState, KeywordId } from '../data/types';
import { KW } from '../data/keywords';

/** A keyword pill lights when it is selected, or when the search text names it. */
function isKeywordLit(state: FilterState, kw: KeywordId): boolean {
  return state.keywords.has(kw) || (!!state.search && KW[kw].toLowerCase().includes(state.search.toLowerCase().trim()));
}

const KEYWORD_IDS = Object.keys(KW) as KeywordId[];

/**
 * Every keyword that lights for this state, so a card or row checks its own
 * against one set rather than reading the whole state.
 */
export function litKeywords(state: FilterState): Set<KeywordId> {
  return new Set(KEYWORD_IDS.filter((kw) => isKeywordLit(state, kw)));
}

import { useFilter } from '../context/useFilter';
import { DUR_LABELS, KW } from '../data/keywords';
import type { KeywordId } from '../data/types';

export default function ActiveTags() {
  const { state, dispatch } = useFilter();

  const hasDuration = state.duration !== 'all';
  const hasPlayers = state.players > 0;
  const hasKeywords = state.keywords.size > 0;
  const hasSearch = state.search.length > 0;
  const hasAny = hasDuration || hasPlayers || hasKeywords || hasSearch;

  return (
    <div className={`atags${hasAny ? ' show' : ''}`}>
      {hasDuration && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_DURATION', payload: 'all' })}
        >
          {DUR_LABELS[state.duration]} {'\u2715'}
        </button>
      )}
      {hasPlayers && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 0 })}
        >
          {state.players} players {'\u2715'}
        </button>
      )}
      {[...state.keywords].map((kw: KeywordId) => (
        <button
          key={kw}
          className="atag"
          onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
        >
          {KW[kw]} {'\u2715'}
        </button>
      ))}
      {hasSearch && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}
        >
          &quot;{state.search}&quot; {'\u2715'}
        </button>
      )}
      {hasAny && (
        <button className="clear-all" onClick={() => dispatch({ type: 'CLEAR_ALL' })}>
          Clear all
        </button>
      )}
    </div>
  );
}

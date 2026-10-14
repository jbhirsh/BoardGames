import { useFilter } from '../context/useFilter';
import { DUR_LABELS, KW, playersLabel } from '../data/keywords';
import type { KeywordId } from '../data/types';
import { buildShareUrl } from '../utils/filterUrl';
import { useCopyLink } from '../hooks/useCopyLink';
import { anyFilterOn, FILTER_FIELDS, filterOn } from '../utils/filterState';

export default function ActiveTags() {
  const { state, dispatch } = useFilter();
  const { copied, copy } = useCopyLink();

  const hasDuration = filterOn(state, 'duration');
  const hasPlayers = filterOn(state, 'players');
  const hasSearch = filterOn(state, 'search');
  const hasAny = anyFilterOn(state, FILTER_FIELDS);

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
          {playersLabel(state.players)} {'\u2715'}
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
        <button
          type="button"
          className="share-link"
          onClick={() => copy(buildShareUrl(state, window.location.origin))}
        >
          {copied ? 'Copied!' : 'Share link'}
        </button>
      )}
      {hasAny && (
        <button type="button" className="clear-all" onClick={() => dispatch({ type: 'CLEAR_ALL' })}>
          Clear all
        </button>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </div>
  );
}

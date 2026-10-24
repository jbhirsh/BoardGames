import { useFilter } from '../context/useFilter';
import { DUR_LABELS, KW, playersLabel } from '../data/keywords';
import type { KeywordId } from '../data/types';
import { buildShareUrl } from '../utils/filterUrl';
import { useCopyLink } from '../hooks/useCopyLink';
import { anyFilterOn, FILTER_FIELDS, filterOn } from '../utils/filterState';

/** An active filter, which a click turns off; the `atag` hook is the tests'. */
const tagClass =
  'atag inline-flex cursor-pointer items-center gap-1.25 rounded-[20px] border border-blue-tint/20 bg-blue-bg px-3 py-1 text-[12px] leading-3.5 font-medium text-blue select-none [transition:background_0.15s,border-color_0.15s] hover:border-blue-tint/40 hover:underline hover:underline-offset-2';

export default function ActiveTags() {
  const { state, dispatch } = useFilter();
  const { copied, copy } = useCopyLink();

  const hasDuration = filterOn(state, 'duration');
  const hasPlayers = filterOn(state, 'players');
  const hasSearch = filterOn(state, 'search');
  const hasAny = anyFilterOn(state, FILTER_FIELDS);

  return (
    <div
      className={`atags flex-wrap items-center gap-1.75 border-b border-border bg-bg2 px-gutter py-2 ${hasAny ? 'show flex' : 'hidden'}`}
    >
      {hasDuration && (
        <button className={tagClass} onClick={() => dispatch({ type: 'SET_DURATION', payload: 'all' })}>
          {DUR_LABELS[state.duration]} {'\u2715'}
        </button>
      )}
      {hasPlayers && (
        <button className={tagClass} onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 0 })}>
          {playersLabel(state.players)} {'\u2715'}
        </button>
      )}
      {[...state.keywords].map((kw: KeywordId) => (
        <button key={kw} className={tagClass} onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}>
          {KW[kw]} {'\u2715'}
        </button>
      ))}
      {hasSearch && (
        <button className={tagClass} onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}>
          &quot;{state.search}&quot; {'\u2715'}
        </button>
      )}
      {hasAny && (
        <button
          type="button"
          className="ml-auto cursor-pointer px-2 py-1 text-[12px] font-medium text-blue [transition:color_0.15s] hover:text-dark"
          onClick={() => copy(buildShareUrl(state, window.location.origin))}
        >
          {copied ? 'Copied!' : 'Share link'}
        </button>
      )}
      {hasAny && (
        <button
          type="button"
          className="cursor-pointer text-[12px] text-text3 [transition:color_0.15s] hover:text-text"
          onClick={() => dispatch({ type: 'CLEAR_ALL' })}
        >
          Clear all
        </button>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </div>
  );
}

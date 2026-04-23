import { useState } from 'react';
import { useFilter } from '../context/useFilter';
import { DUR_LABELS, KW } from '../data/keywords';
import type { KeywordId } from '../data/types';
import { buildShareUrl } from '../utils/filterUrl';

export default function ActiveTags() {
  const { state, dispatch } = useFilter();
  const [copied, setCopied] = useState(false);

  const hasDuration = state.duration !== 'all';
  const hasPlayers = state.players > 0;
  const hasKeywords = state.keywords.size > 0;
  const hasSearch = state.search.length > 0;
  const hasAny = hasDuration || hasPlayers || hasKeywords || hasSearch;

  async function handleShare() {
    const url = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  return (
    <div className={`atags${hasAny ? ' show' : ''}`}>
      {hasDuration && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_DURATION', payload: 'all' })}
        >
          {DUR_LABELS[state.duration]} {'✕'}
        </button>
      )}
      {hasPlayers && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 0 })}
        >
          {state.players} players {'✕'}
        </button>
      )}
      {[...state.keywords].map((kw: KeywordId) => (
        <button
          key={kw}
          className="atag"
          onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
        >
          {KW[kw]} {'✕'}
        </button>
      ))}
      {hasSearch && (
        <button
          className="atag"
          onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}
        >
          &quot;{state.search}&quot; {'✕'}
        </button>
      )}
      {hasAny && (
        <button
          className="share-link"
          onClick={handleShare}
          aria-label="Copy shareable link"
        >
          {copied ? 'Copied!' : 'Share link'}
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

import { useEffect, useState } from 'react';
import type { WishlistItem } from '../data/types';

export interface ApprovedSuggestion {
  id: string;
  game: string;
  name: string;
  note: string;
}

/** Shape an approved suggestion like a wishlist entry so the same cards render it. */
export function suggestionToItem(s: ApprovedSuggestion): WishlistItem {
  return {
    id: s.id,
    name: s.game,
    desc: s.note ? `“${s.note}”` : `${s.name} thinks we should try this one.`,
    yt: `how to play ${s.game} board game`,
    players: '',
    type: 'suggested',
    awards: [],
    suggestedBy: s.name,
  };
}

export interface SuggestionsState {
  items: WishlistItem[];
  loaded: boolean;
}

/** Loads approved friend suggestions once. A failed fetch yields an empty, loaded list. */
export function useSuggestions(): SuggestionsState {
  const [state, setState] = useState<SuggestionsState>({ items: [], loaded: false });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/suggestions', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
      .then((data: { items?: ApprovedSuggestion[] }) => {
        const items = Array.isArray(data.items) ? data.items.map(suggestionToItem) : [];
        setState({ items, loaded: true });
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ items: [], loaded: true });
      });
    return () => controller.abort();
  }, []);

  return state;
}

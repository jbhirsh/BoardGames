import { useEffect, useState } from 'react';
import type { DurationCategory, KeywordId, WishlistItem } from '../data/types';
import { KW } from '../data/keywords';

export interface SuggestionDetails {
  year?: number;
  min: number;
  max: number;
  mins: number;
  desc: string;
  kw: string[];
}

export interface ApprovedSuggestion {
  id: string;
  game: string;
  name: string;
  note: string;
  details?: SuggestionDetails;
}

/** Same buckets as the compiled collection: quick <= 15 min, medium <= 60, long beyond. */
export function durationCategory(mins: number): DurationCategory {
  return mins <= 15 ? 'quick' : mins <= 60 ? 'medium' : 'long';
}

function playersLabel(min: number, max: number): string {
  if (max >= 99) return `${min}+`;
  return min === max ? String(min) : `${min}–${max}`;
}

/** Shape an approved suggestion like a wishlist entry so the same cards render it. */
export function suggestionToItem(s: ApprovedSuggestion): WishlistItem {
  const d = s.details;
  const credit = s.note ? `“${s.note}”` : `${s.name} thinks we should try this one.`;
  const known = !!d && d.mins > 0;
  return {
    id: s.id,
    name: s.game,
    desc: d?.desc ? `${d.desc} ${credit}` : credit,
    yt: `how to play ${s.game} board game`,
    players: d ? playersLabel(d.min, d.max) : '',
    // Unknown details match every filter rather than none: min 1, max 99,
    // mins 0 (which the duration filter treats as "any"), no keywords.
    min: d?.min ?? 1,
    max: d?.max ?? 99,
    mins: d?.mins ?? 0,
    dur: known ? `${d.mins} min` : '',
    cat: known ? durationCategory(d.mins) : 'medium',
    kw: (d?.kw ?? []).filter((k): k is KeywordId => k in KW),
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

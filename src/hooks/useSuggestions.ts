import { useCallback, useEffect, useState } from 'react';
import type { DurationCategory, KeywordId, WishlistItem, WishlistType } from '../data/types';
import { KW, WISHLIST_TYPES } from '../data/keywords';

export interface SuggestionDetails {
  year?: number;
  min: number;
  max: number;
  mins: number;
  desc: string;
  kw: string[];
  /** Wishlist section the owner filed it under; absent means "Suggested by friends". */
  type?: string;
  /** Box-art thumbnail URL from BoardGameGeek. */
  img?: string;
}

export interface ApprovedSuggestion {
  id: string;
  game: string;
  name: string;
  note: string;
  details?: SuggestionDetails;
  /** Absent on records written before the owner could add games directly. */
  source?: 'friend' | 'owner';
}

const isSection = (v: unknown): v is Exclude<WishlistType, 'suggested'> =>
  typeof v === 'string' && v !== 'suggested' && v in WISHLIST_TYPES;

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
  const owner = s.source === 'owner';
  // A friend's pick is credited; the owner's own addition just reads as an
  // entry, unless there is nothing else to say about it yet.
  const credit = s.note ? `“${s.note}”` : owner ? '' : `${s.name} thinks we should try this one.`;
  const blurb = d?.desc ?? '';
  const known = !!d && d.mins > 0;
  return {
    id: s.id,
    name: s.game,
    desc: [blurb, credit].filter(Boolean).join(' ') || `${s.name} added this one.`,
    blurb,
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
    type: isSection(d?.type) ? d.type : 'suggested',
    awards: [],
    suggestedBy: owner ? undefined : s.name,
    source: owner ? 'owner' : 'friend',
    img: d?.img,
  };
}

export interface SuggestionsState {
  items: WishlistItem[];
  loaded: boolean;
}

/**
 * Loads approved suggestions once, and again on `reload()` after the owner
 * changes the list. A failed fetch yields an empty, loaded list.
 */
export function useSuggestions(): SuggestionsState & { reload: () => void } {
  const [state, setState] = useState<SuggestionsState>({ items: [], loaded: false });
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

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
  }, [generation]);

  return { ...state, reload };
}

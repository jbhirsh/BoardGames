import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSuggestions, suggestionToItem } from '../hooks/useSuggestions';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('suggestionToItem', () => {
  it('quotes the note as the description and credits the suggester', () => {
    const item = suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: 'Asymmetric and mean' });
    expect(item).toMatchObject({ id: 'sug-1', name: 'Root', type: 'suggested', suggestedBy: 'Alex', players: '', awards: [] });
    expect(item.desc).toBe('“Asymmetric and mean”');
    expect(item.yt).toContain('Root');
  });

  it('falls back to a credit line when there is no note', () => {
    expect(suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }).desc).toBe('Alex thinks we should try this one.');
  });
});

describe('useSuggestions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads approved suggestions as wishlist items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [{ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }] }));
    const { result } = renderHook(() => useSuggestions());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.map((i) => i.name)).toEqual(['Root']);
  });

  it('yields an empty loaded list when the fetch fails or has no items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useSuggestions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
  });
});

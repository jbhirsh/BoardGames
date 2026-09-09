import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSuggestions, suggestionToItem, durationCategory } from '../hooks/useSuggestions';

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

  it('maps BoardGameGeek details into the filterable fields and leads with the description', () => {
    const item = suggestionToItem({
      id: 'sug-1', game: 'Root', name: 'Alex', note: 'Mean fun',
      details: { year: 2018, min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy', 'thematic', 'not-a-keyword'] },
    });
    expect(item).toMatchObject({ players: '2–4', min: 2, max: 4, mins: 90, dur: '90 min', cat: 'long', kw: ['strategy', 'thematic'] });
    expect(item.desc).toBe('Woodland war. “Mean fun”');
  });

  it('renders open-ended player counts with a plus and matches every filter when details are missing', () => {
    expect(suggestionToItem({ id: 's', game: 'G', name: 'A', note: '', details: { min: 3, max: 99, mins: 20, desc: '', kw: [] } }).players).toBe('3+');
    const bare = suggestionToItem({ id: 's', game: 'G', name: 'A', note: '' });
    expect(bare).toMatchObject({ players: '', min: 1, max: 99, mins: 0, dur: '', cat: 'medium', kw: [] });
  });

  it('buckets durations like the collection', () => {
    expect([durationCategory(10), durationCategory(15), durationCategory(45), durationCategory(61)]).toEqual(['quick', 'quick', 'medium', 'long']);
  });

  it('reads an owner-added game as a plain entry in its section, keeping the blurb for editing', () => {
    const item = suggestionToItem({
      id: 'sug-2', game: 'Ark Nova', name: 'Jess', note: '', source: 'owner',
      details: { min: 1, max: 4, mins: 150, desc: 'Zoo building.', kw: ['strategy'], type: 'heavy' },
    });
    expect(item).toMatchObject({ type: 'heavy', source: 'owner', desc: 'Zoo building.', blurb: 'Zoo building.' });
    expect(item.suggestedBy).toBeUndefined();
    // A note still shows, quoted; an unknown section falls back to the friends' one.
    expect(suggestionToItem({ id: 's', game: 'G', name: 'Jess', note: 'Big', source: 'owner', details: { min: 1, max: 4, mins: 0, desc: '', kw: [], type: 'suggested' } }))
      .toMatchObject({ desc: '“Big”', type: 'suggested', blurb: '' });
    expect(suggestionToItem({ id: 's', game: 'G', name: 'Alex', note: '', source: 'friend' })).toMatchObject({ suggestedBy: 'Alex', source: 'friend' });
    // No BGG match and no note: the card still says something rather than showing a blank line.
    expect(suggestionToItem({ id: 's', game: 'G', name: 'Jess', note: '', source: 'owner' }).desc).toBe('Jess added this one.');
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

  it('fetches again on reload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }] }));
    const { result } = renderHook(() => useSuggestions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items.map((i) => i.name)).toEqual(['Root']));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('yields an empty loaded list when the fetch fails or has no items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useSuggestions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
  });
});

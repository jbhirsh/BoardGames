import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSuggestions, suggestionToItem } from '../hooks/useSuggestions';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';

describe('suggestionToItem', () => {
  it('quotes the note as the description and credits the suggester', () => {
    const item = suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: 'Asymmetric and mean' });
    expect(item).toMatchObject({
      id: 'sug-1',
      name: 'Root',
      type: 'suggested',
      suggestedBy: 'Alex',
      players: '',
      awards: [],
    });
    expect(item.desc).toBe('“Asymmetric and mean”');
    expect(item.yt).toContain('Root');
  });

  it('maps BoardGameGeek details into the filterable fields and leads with the description', () => {
    const item = suggestionToItem({
      id: 'sug-1',
      game: 'Root',
      name: 'Alex',
      note: 'Mean fun',
      details: {
        year: 2018,
        min: 2,
        max: 4,
        mins: 90,
        desc: 'Woodland war.',
        kw: ['strategy', 'thematic', 'not-a-keyword'],
      },
    });
    expect(item).toMatchObject({
      players: '2–4',
      min: 2,
      max: 4,
      mins: 90,
      dur: '90 min',
      kw: ['strategy', 'thematic'],
    });
    expect(item.desc).toBe('Woodland war. “Mean fun”');
  });

  it('renders open-ended player counts with a plus and matches every filter when details are missing', () => {
    expect(
      suggestionToItem({
        id: 's',
        game: 'G',
        name: 'A',
        note: '',
        details: { min: 3, max: 99, mins: 20, desc: '', kw: [] },
      }).players,
    ).toBe('3+');
    const bare = suggestionToItem({ id: 's', game: 'G', name: 'A', note: '' });
    expect(bare).toMatchObject({ players: '', min: 1, max: 99, mins: 0, dur: '', kw: [] });
  });

  it('reads an owner-added game as a plain entry in its section, keeping the blurb for editing', () => {
    const item = suggestionToItem({
      id: 'sug-2',
      game: 'Ark Nova',
      name: 'Jess',
      note: '',
      source: 'OWNER',
      details: { min: 1, max: 4, mins: 150, desc: 'Zoo building.', kw: ['strategy'], type: 'heavy' },
    });
    expect(item).toMatchObject({ type: 'heavy', source: 'owner', desc: 'Zoo building.', blurb: 'Zoo building.' });
    expect(item.img).toBeUndefined();
    expect(
      suggestionToItem({
        id: 's',
        game: 'G',
        name: 'Jess',
        note: '',
        details: { min: 1, max: 4, mins: 0, desc: '', kw: [], img: 'https://cf.geekdo-images.com/g.jpg' },
      }).img,
    ).toBe('https://cf.geekdo-images.com/g.jpg');
    expect(item.suggestedBy).toBeUndefined();
    // A note still shows, quoted; an unknown section falls back to the friends' one.
    expect(
      suggestionToItem({
        id: 's',
        game: 'G',
        name: 'Jess',
        note: 'Big',
        source: 'OWNER',
        details: { min: 1, max: 4, mins: 0, desc: '', kw: [], type: 'suggested' },
      }),
    ).toMatchObject({ desc: '“Big”', type: 'suggested', blurb: '' });
    expect(suggestionToItem({ id: 's', game: 'G', name: 'Alex', note: '', source: 'FRIEND' })).toMatchObject({
      suggestedBy: 'Alex',
      source: 'friend',
    });
    // No BGG match and no note: the card still says something rather than showing a blank line.
    expect(suggestionToItem({ id: 's', game: 'G', name: 'Jess', note: '', source: 'OWNER' }).desc).toBe(
      'Jess added this one.',
    );
  });

  it('leaves a friend\'s name out of the text, which "Suggested by" already shows', () => {
    const details = { min: 1, max: 4, mins: 60, desc: 'Woodland war.', kw: [], type: 'suggested' };
    expect(suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: '', details })).toMatchObject({
      desc: 'Woodland war.',
      suggestedBy: 'Alex',
    });
    expect(suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: 'So good', details }).desc).toBe(
      'Woodland war. “So good”',
    );
    // No BGG match and no note: a neutral line, not the friend's name again.
    expect(suggestionToItem({ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }).desc).toBe('No description yet.');
  });
});

describe('useSuggestions', () => {
  afterEach(() => vi.restoreAllMocks());

  const ROOT = { id: 'sug-1', game: 'Root', name: 'Alex', note: '', source: 'FRIEND' as const, details: null };

  it('loads approved suggestions as wishlist items', async () => {
    const spy = stubGraphql({ Suggestions: () => ({ suggestions: [ROOT] }) });
    const { result } = renderHook(() => useSuggestions());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.map((i) => i.name)).toEqual(['Root']);
    expect(operations(spy).map((o) => o.operationName)).toEqual(['Suggestions']);
  });

  it('fetches again on reload', async () => {
    let answer: unknown[] = [];
    const spy = stubGraphql({ Suggestions: () => ({ suggestions: answer }) });
    const { result } = renderHook(() => useSuggestions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
    answer = [ROOT];
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items.map((i) => i.name)).toEqual(['Root']));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('yields an empty loaded list when the fetch fails', async () => {
    stubGraphql({ Suggestions: () => gqlError('Server error', 'INTERNAL_SERVER_ERROR', 500) });
    const { result } = renderHook(() => useSuggestions());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items).toEqual([]);
  });

  it('keeps the box art only when there is some', () => {
    const details = { min: 1, max: 4, mins: 60, desc: '', kw: [], img: null };
    expect(suggestionToItem({ ...ROOT, details }).img).toBeUndefined();
    expect(suggestionToItem({ ...ROOT, details: { ...details, img: 'https://cf.geekdo-images.com/r.jpg' } }).img).toBe(
      'https://cf.geekdo-images.com/r.jpg',
    );
  });
});

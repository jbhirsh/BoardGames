import { describe, it, expect } from 'vitest';
import type { WishlistItem } from '../data/types';
import { mergeWishlist } from '../utils/mergeWishlist';

const item = (name: string, over: Partial<WishlistItem> = {}): WishlistItem => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  desc: `About ${name}.`,
  yt: `how to play ${name}`,
  players: '2–4',
  min: 2,
  max: 4,
  dur: '30 min',
  mins: 30,
  cat: 'medium',
  kw: [],
  type: 'party',
  awards: [],
  ...over,
});

describe('mergeWishlist', () => {
  it('keeps both lists when nothing overlaps, compiled entries first', () => {
    const { items, hidden } = mergeWishlist([item('Glyphics')], [item('Sky Team', { source: 'friend' })]);
    expect(items.map((w) => w.name)).toEqual(['Glyphics', 'Sky Team']);
    expect(hidden).toEqual([]);
  });

  it('holds back a suggestion for a game the compiled list already has', () => {
    const compiled = item('Glyphics', { img: '/images/wishlist/glyphics.jpg' });
    const stored = item('Glyphics', { id: 'sug_1', img: undefined, source: 'friend', suggestedBy: 'Jess' });
    const { items, hidden } = mergeWishlist([compiled], [stored]);
    expect(items).toEqual([compiled]);
    expect(hidden).toEqual([stored]);
  });

  it('matches names loosely, so case and punctuation do not let a duplicate through', () => {
    const { items, hidden } = mergeWishlist(
      [item('7 Wonders Duel'), item('Flip 7')],
      [item('7 wonders duel!', { id: 'sug_1' }), item('flip-7', { id: 'sug_2' }), item('Wavelength', { id: 'sug_3' })],
    );
    expect(items.map((w) => w.name)).toEqual(['7 Wonders Duel', 'Flip 7', 'Wavelength']);
    expect(hidden.map((w) => w.id)).toEqual(['sug_1', 'sug_2']);
  });

  it('keeps the first of two suggestions for the same game', () => {
    const first = item('Lovestruck', { id: 'sug_1', suggestedBy: 'Jess' });
    const second = item('Lovestruck', { id: 'sug_2', suggestedBy: 'Sam' });
    const { items, hidden } = mergeWishlist([], [first, second]);
    expect(items).toEqual([first]);
    expect(hidden).toEqual([second]);
  });

  it('keeps entries whose names normalise to nothing rather than collapsing them', () => {
    const { items, hidden } = mergeWishlist([item('!!!')], [item('???', { id: 'sug_1' })]);
    expect(items).toHaveLength(2);
    expect(hidden).toEqual([]);
  });

  it('leaves both input lists untouched', () => {
    const compiled = [item('Glyphics')];
    const suggested = [item('Glyphics', { id: 'sug_1' })];
    mergeWishlist(compiled, suggested);
    expect(compiled).toHaveLength(1);
    expect(suggested).toHaveLength(1);
  });

  it('handles either list being empty', () => {
    const only = item('Glyphics');
    expect(mergeWishlist([only], [])).toEqual({ items: [only], hidden: [] });
    expect(mergeWishlist([], [only])).toEqual({ items: [only], hidden: [] });
    expect(mergeWishlist([], [])).toEqual({ items: [], hidden: [] });
  });
});

import { describe, it, expect } from 'vitest';
import { GAMES } from '../data/games';
import { KW } from '../data/keywords';
import type { Award, DurationCategory } from '../data/types';
import { durationCategory } from '../hooks/useSuggestions';

/**
 * The collection's filter fields, kept coherent the way wishlistData.test.ts
 * keeps the wishlist's. Each game states its players and time twice, once as
 * text for the card (`players`, `dur`) and once as numbers for the filters
 * (`min`, `max`, `mins`, `cat`), and nothing else notices when the two drift:
 * the card says one thing while the players or time filter does another.
 */

const KEYWORDS = Object.keys(KW);
const numbers = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

interface Table {
  players: string;
  min: number;
  max: number;
  dur: string;
  mins: number;
  cat: DurationCategory;
}

/** The checks a game and a game inside one share. */
function expectCoherentTable(t: Table, label: string) {
  expect(t.min, `${label}: min`).toBeGreaterThan(0);
  expect(t.max, `${label}: max`).toBeGreaterThanOrEqual(t.min);
  expect(t.mins, `${label}: mins`).toBeGreaterThan(0);

  // The card's time ends at `mins`, the number the sorts and filters use.
  expect(t.dur, `${label}: dur`).toMatch(/^\d+(–\d+)? (min|hrs?)$/);
  const top = numbers(t.dur).at(-1)!;
  expect(t.dur.endsWith('min') ? top : top * 60, `${label}: dur vs mins`).toBe(t.mins);

  // The card's players start at `min`; an open-ended count ("2+") is max 99.
  expect(t.players, `${label}: players`).toMatch(/^\d+(–\d+)?\+?$/);
  expect(numbers(t.players)[0], `${label}: players vs min`).toBe(t.min);
  expect(t.players.endsWith('+'), `${label}: open-ended players vs max`).toBe(t.max >= 99);
}

function expectRealAwards(awards: Award[] | undefined, label: string) {
  for (const a of awards ?? []) {
    expect(a.name.trim(), `${label}: award name`).not.toBe('');
    expect(Number.isInteger(a.year) && a.year >= 1900 && a.year <= new Date().getFullYear(), `${label}: award year ${a.year}`).toBe(true);
  }
}

describe('games data', () => {
  it.each(GAMES.map((g) => [g.slug, g] as const))('%s has coherent filter fields', (slug, g) => {
    expectCoherentTable(g, slug);
    expect(g.cat, `${slug}: cat`).toBe(durationCategory(g.mins));

    // The card shows the box's whole range, so a top count above `max` must
    // come from a game inside it (Catan is 3–4, 3–6 with its extension).
    const subMax = Math.max(g.max, ...(g.subgames ?? []).map((s) => s.max));
    if (g.max < 99) expect(numbers(g.players).at(-1), `${slug}: players vs max`).toBe(subMax);

    expect(g.kw.length).toBeGreaterThan(0);
    expect(new Set(g.kw).size).toBe(g.kw.length);
    for (const k of g.kw) expect(KEYWORDS).toContain(k);

    for (const text of [g.name, g.short, g.desc, g.yt]) expect(text.trim()).not.toBe('');
    expectRealAwards(g.awards, slug);
  });


  const withHouseRules = GAMES.filter((g) => g.houseRules).map((g) => [g.slug, g.houseRules!] as const);

  it.each(withHouseRules)('%s has named, written house rules', (_slug, rules) => {
    expect(rules.length).toBeGreaterThan(0);
    expect(new Set(rules.map((r) => r.name)).size).toBe(rules.length);
    for (const r of rules) for (const text of [r.name, r.text]) expect(text.trim()).not.toBe('');
  });

  const subgames = GAMES.flatMap((g) => (g.subgames ?? []).map((s) => [`${g.slug}/${s.slug}`, s] as const));

  it('has games inside games to check', () => {
    expect(subgames.length).toBeGreaterThan(0);
  });

  it.each(subgames)('%s has coherent filter fields', (label, s) => {
    expectCoherentTable(s, label);
    expect(s.cat, `${label}: cat`).toBe(durationCategory(s.mins));
    expect(numbers(s.players).at(-1), `${label}: players vs max`).toBe(s.max);
    for (const text of [s.name, s.short, s.yt]) expect(text.trim()).not.toBe('');
    expectRealAwards(s.awards, label);
  });
});

import { describe, it, expect } from 'vitest';
import { GAMES } from '../data/games';
import { GAME_WEIGHTS } from '../data/gameWeights';
import { KW } from '../data/keywords';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import type { Award } from '../data/types';
import { durationCategory } from '../hooks/useSuggestions';
import { isDeck } from '../utils/filterGames';
import { expectCoherentTable, numbers } from './coherentTable';

/**
 * The collection's filter fields, kept coherent the way wishlistData.test.ts
 * keeps the wishlist's (see coherentTable.ts for why).
 */

const KEYWORDS = Object.keys(KW);

/**
 * A difficulty comes from BoardGameGeek alone: the weight is the one
 * `npm run game-weights` fetched for the item's BGG id (none where BGG has
 * no votes), and nothing without an id has one.
 */
function expectBggWeight(d: { bgg?: number; weight?: number }, label: string) {
  if (d.bgg === undefined) {
    expect(d.weight, `${label}: a weight with no BGG id to come from`).toBeUndefined();
    return;
  }
  expect(d.bgg in GAME_WEIGHTS, `${label}: BGG ${d.bgg} not fetched; run npm run game-weights`).toBe(true);
  expect(d.weight, `${label}: weight`).toBe(GAME_WEIGHTS[d.bgg] ?? undefined);
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

    // A deck isn't played as such: its games carry the difficulty instead.
    if (isDeck(g.subgames)) expect(g.bgg, `${slug}: a deck has no BGG id of its own`).toBeUndefined();
    expectBggWeight(g, slug);
  });

  it.each([...SCORE_CALCULATORS])('score calculator %s is a game in the collection', (slug) => {
    expect(GAMES.map((g) => g.slug)).toContain(slug);
  });

  it('the word checker\'s game is in the collection', () => {
    expect(GAMES.map((g) => g.slug)).toContain(WORD_CHECKER_GAME);
  });

  const withHouseRules = GAMES.filter((g) => g.houseRules).map((g) => [g.slug, g.houseRules!] as const);

  it.each(withHouseRules)('%s has named, written house rules', (_slug, rules) => {
    expect(rules.length).toBeGreaterThan(0);
    expect(new Set(rules.map((r) => r.name)).size).toBe(rules.length);
    for (const r of rules) for (const text of [r.name, r.text]) expect(text.trim()).not.toBe('');
  });

  const subgames = GAMES.flatMap((g) => (g.subgames ?? []).map((s) => [`${g.slug}/${s.slug}`, s] as const));

  // One id names one game: a copied id would give a game another's weight.
  it('gives each BoardGameGeek id to one game', () => {
    const ids = GAMES.flatMap((g) => [g, ...(g.subgames ?? [])]).flatMap((t) => (t.bgg === undefined ? [] : [t.bgg]));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(Number.isInteger(id) && id > 0, `bgg ${id}`).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps only fetched weights, each on BGG\'s 1 to 5 scale', () => {
    for (const [id, weight] of Object.entries(GAME_WEIGHTS)) {
      if (weight !== null) expect(weight >= 1 && weight <= 5, `BGG ${id}: weight ${weight}`).toBe(true);
    }
  });

  it('has games inside games to check', () => {
    expect(subgames.length).toBeGreaterThan(0);
  });

  it.each(subgames)('%s has coherent filter fields', (label, s) => {
    expectCoherentTable(s, label);
    expect(s.cat, `${label}: cat`).toBe(durationCategory(s.mins));
    expect(numbers(s.players).at(-1), `${label}: players vs max`).toBe(s.max);
    for (const text of [s.name, s.short, s.yt]) expect(text.trim()).not.toBe('');
    expectRealAwards(s.awards, label);
    // A deck's games and a version are played alone; an add-on is learned
    // on top of its game, so it has no difficulty of its own.
    if (s.kind !== 'card-game' && s.kind !== 'version') expect(s.bgg, `${label}: an add-on has no BGG id`).toBeUndefined();
    expectBggWeight(s, label);
  });
});

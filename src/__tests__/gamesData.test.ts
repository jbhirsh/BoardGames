import { describe, it, expect } from 'vitest';
import { ALL_GAMES } from '../data/games';
import seed from '../../data/seed.json';
import { KW } from '../data/keywords';
import { SCORE_CALCULATORS } from '../data/scoreCalculators';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import type { Award, DetailSection } from '../data/types';
import { isDeck } from '../utils/filterGames';
import { expectCoherentTable, numbers } from './coherentTable';

/**
 * The collection's filter fields, kept coherent the way wishlistData.test.ts
 * keeps the wishlist's (see coherentTable.ts for why).
 */

const KEYWORDS = Object.keys(KW);

/**
 * A difficulty and awards come from BoardGameGeek alone, by `bgg`, from the
 * games query (utils/bggInfo.ts): the compiled data carries neither.
 */
function expectBggWeight(d: { bgg?: number; weight?: number }, label: string) {
  expect(d.weight, `${label}: a weight typed in`).toBeUndefined();
}

function expectRealAwards(awards: Award[] | undefined, label: string) {
  expect(awards, `${label}: awards typed in`).toBeUndefined();
}

describe('games data', () => {
  it.each(ALL_GAMES.map((g) => [g.slug, g] as const))('%s has coherent filter fields', (slug, g) => {
    expectCoherentTable(g, slug);

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
    expect(ALL_GAMES.map((g) => g.slug)).toContain(slug);
  });

  const writeUps = ALL_GAMES.flatMap((g) => [
    [g.slug, g.detail] as const,
    ...(g.subgames ?? []).filter((sub) => sub.detail).map((sub) => [`${g.slug}.${sub.slug}`, sub.detail!] as const),
  ]);

  // The write-up is rendered as text, so markup in it would show as written.
  it.each(writeUps)('%s has a write-up of named sections in plain text', (_slug, sections: DetailSection[]) => {
    expect(sections.length).toBeGreaterThan(0);
    expect(new Set(sections.map((s) => s.heading)).size).toBe(sections.length);
    for (const s of sections) {
      for (const text of [s.heading, s.body]) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toMatch(/<\/?[a-z][^>]*>|&[a-z]+;/i);
      }
    }
  });

  it("the word checker's game is in the collection", () => {
    expect(ALL_GAMES.map((g) => g.slug)).toContain(WORD_CHECKER_GAME);
  });

  const withHouseRules = ALL_GAMES.filter((g) => g.houseRules).map((g) => [g.slug, g.houseRules!] as const);

  it.each(withHouseRules)('%s has named, written house rules', (_slug, rules) => {
    expect(rules.length).toBeGreaterThan(0);
    expect(new Set(rules.map((r) => r.name)).size).toBe(rules.length);
    for (const r of rules) for (const text of [r.name, r.text]) expect(text.trim()).not.toBe('');
  });

  const subgames = ALL_GAMES.flatMap((g) => (g.subgames ?? []).map((s) => [`${g.slug}/${s.slug}`, s] as const));

  // One id names one game: a copied id would give a game another's weight.
  it('gives each BoardGameGeek id to one game', () => {
    const ids = ALL_GAMES.flatMap((g) => [g, ...(g.subgames ?? [])]).flatMap((t) =>
      t.bgg === undefined ? [] : [t.bgg],
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(Number.isInteger(id) && id > 0, `bgg ${id}`).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists every BoardGameGeek id in the seed, whose BGG data the one-time copy fetches', () => {
    const ids = ALL_GAMES.flatMap((g) => [g, ...(g.subgames ?? [])]).flatMap((t) =>
      t.bgg === undefined ? [] : [t.bgg],
    );
    expect([...ids].sort((a, b) => a - b)).toEqual(seed.collection);
  });

  it('has games inside games to check', () => {
    expect(subgames.length).toBeGreaterThan(0);
  });

  it.each(subgames)('%s has coherent filter fields', (label, s) => {
    expectCoherentTable(s, label);
    expect(numbers(s.players).at(-1), `${label}: players vs max`).toBe(s.max);
    for (const text of [s.name, s.short, s.yt]) expect(text.trim()).not.toBe('');
    expectRealAwards(s.awards, label);
    // A deck's games and a version are played alone; an add-on is learned
    // on top of its game, so it has no difficulty of its own.
    if (s.kind !== 'card-game' && s.kind !== 'version')
      expect(s.bgg, `${label}: an add-on has no BGG id`).toBeUndefined();
    expectBggWeight(s, label);
  });
});

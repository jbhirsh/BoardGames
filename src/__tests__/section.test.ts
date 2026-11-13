import { describe, it, expect } from 'vitest';
import { HEAVY_FROM, inferSection } from '../../api/_lib/section';

const input = (max: number, weight?: number, categories: string[] = [], mechanics: string[] = []) => ({
  max,
  weight,
  categories,
  mechanics,
});

describe('inferSection', () => {
  it('files a game for at most 2 players under Two-Player, before anything else', () => {
    expect(inferSection(input(2, 4, ['Party Game'], ['Cooperative Game']))).toBe('two-player');
    expect(inferSection(input(1))).toBe('two-player');
  });

  it("files BGG's Party Game category, or 8 or more players, under Party & Card", () => {
    expect(inferSection(input(5, 3.5, ['Party Game']))).toBe('party');
    expect(inferSection(input(8, 3.5))).toBe('party');
    expect(inferSection(input(7, 1.2))).not.toBe('party');
  });

  it(`files a weight of ${HEAVY_FROM} or more under Heavy Strategy, before Cooperative`, () => {
    expect(inferSection(input(4, HEAVY_FROM, [], ['Cooperative Game']))).toBe('heavy');
    expect(inferSection(input(4, 3.24))).toBe('strategy');
  });

  it("files BGG's Cooperative Game mechanic under Cooperative, and anything else under Strategy", () => {
    expect(inferSection(input(4, 2, [], ['Cooperative Game']))).toBe('coop');
    expect(inferSection(input(4))).toBe('strategy');
  });

  // Each hand-sorted wishlist entry's players, weight, and whether BGG lists
  // it as a party game and a co-operative one, with the section the owner
  // filed it under (BGG's numbers as of November 2026).
  const SORTED: Array<[string, number, number | undefined, boolean, boolean, string]> = [
    ['lost-cities', 2, 1.47, false, false, 'two-player'],
    ['nemesis', 5, 3.5, false, true, 'heavy'],
    ['blood-on-the-clocktower', 21, 3.01, true, false, 'party'],
    ['splendor', 4, 1.77, false, false, 'strategy'],
    ['wyrmspan', 5, 2.83, false, false, 'strategy'],
    ['harmonies', 4, 2.01, false, false, 'strategy'],
    ['zombie-burrito', 6, 1, true, false, 'party'],
    ['everdell', 4, 2.84, false, false, 'strategy'],
    ['exploding-kittens-board-game', 6, 1.14, true, false, 'party'],
    ['7-wonders-duel', 2, 2.23, false, false, 'two-player'],
    ['dnup', 5, 1.33, false, false, 'party'],
    ['sky-team', 2, 2.04, false, true, 'two-player'],
    ['star-realms', 2, 1.91, false, false, 'two-player'],
    ['the-crew', 5, 1.97, false, true, 'coop'],
    ['pandemic-legacy-season-1', 4, 2.83, false, true, 'coop'],
    ['bomb-busters', 5, 2.02, false, true, 'coop'],
    ['micromacro-crime-city', 4, 1.11, false, true, 'coop'],
    ['wingspan', 5, 2.48, false, false, 'strategy'],
    ['quacks-of-quedlinburg', 4, 1.94, false, false, 'strategy'],
    ['cascadia', 4, 1.84, false, false, 'strategy'],
    ['survive-the-island', 5, 1.49, false, false, 'strategy'],
    ['akropolis', 4, 1.82, false, false, 'strategy'],
    ['seti', 4, 3.84, false, false, 'heavy'],
    ['ark-nova', 4, 3.8, false, false, 'heavy'],
    ['terraforming-mars', 5, 3.27, false, false, 'heavy'],
    ['the-mind', 4, 1.07, false, true, 'party'],
    ['wavelength', 12, 1.1, true, false, 'party'],
    ['just-one', 7, 1.03, true, true, 'party'],
    ['decrypto', 8, 1.83, true, false, 'party'],
    ['flip-7', 18, 1.04, true, false, 'party'],
    ['sounds-fishy', 10, 1, true, false, 'party'],
    ['glyphics', 99, 1.5, true, false, 'party'],
    ['lovestruck', 10, 1.2, true, false, 'party'],
    ['herd-mentality', 20, 1, true, false, 'party'],
    ['two-rooms-and-a-boom', 30, 1.48, true, false, 'party'],
    ['wyrmspan-dragon-academy', 5, 2.79, false, false, 'strategy'],
    ['dominion-seaside', 4, 2.2, false, false, 'strategy'],
    ['dominion-prosperity', 4, 2.08, false, false, 'strategy'],
    ['catan-seafarers', 4, 2.37, false, false, 'strategy'],
  ];

  it('files 37 of the 39 hand-sorted entries as the owner did, missing only the two no rule can', () => {
    const misses = SORTED.filter(
      ([, max, weight, party, coop, section]) =>
        inferSection(
          input(max, weight, party ? ['Party Game'] : ['Card Game'], coop ? ['Cooperative Game'] : ['Hand Management']),
        ) !== section,
    ).map(([id]) => id);
    expect(SORTED).toHaveLength(39);
    expect(misses).toEqual(['dnup', 'the-mind']);
  });
});

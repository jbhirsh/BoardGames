import { describe, expect, it } from 'vitest';
import { ALL_GAMES } from '../data/games';
import { SCORE_CALCULATORS, SCORE_PAD_KEYS, scorePadFor, scorePadPath } from '../data/scoreCalculators';

describe('the score pads', () => {
  it.each(SCORE_PAD_KEYS)('%s is a game in the collection, or a game inside one with its rulebook', (key) => {
    const [slug, part] = key.split('/');
    const game = ALL_GAMES.find((g) => g.slug === slug);
    expect(game, slug).toBeDefined();
    if (part) expect(game!.subgames?.find((s) => s.slug === part)?.rules, key).toBeDefined();
  });

  it('finds a pad by its game, or its game inside one, and says where it is', () => {
    expect(scorePadFor('7-wonders')).toEqual({ kind: 'seven-wonders' });
    expect(scorePadFor('ticket-to-ride')).toEqual({ kind: 'ticket-to-ride' });
    expect(scorePadFor('catan')).toBeUndefined();
    expect(scorePadPath('dominion')).toBe('/score/dominion');
    expect(scorePadPath('dominion', 'intrigue')).toBeNull();
  });

  it('lists only whole games for a card\'s Score button', () => {
    expect([...SCORE_CALCULATORS].sort()).toEqual(['7-wonders', 'dominion', 'ticket-to-ride']);
  });
});

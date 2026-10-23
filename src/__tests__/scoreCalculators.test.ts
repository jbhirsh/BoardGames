import { describe, expect, it } from 'vitest';
import { ALL_GAMES } from '../data/games';
import {
  CARD_GAMES,
  SCORE_CALCULATORS,
  SCORE_PAD_KEYS,
  scorePadFor,
  scorePadLink,
  scorePadPath,
  type CardGameId,
} from '../data/scoreCalculators';

describe('the score pads', () => {
  it.each(SCORE_PAD_KEYS)('%s is a game in the collection, or a game inside one with its rulebook', (key) => {
    const [slug, part] = key.split('/');
    const game = ALL_GAMES.find((g) => g.slug === slug);
    expect(game, slug).toBeDefined();
    if (part) expect(game!.subgames?.find((s) => s.slug === part)?.rules, key).toBeDefined();
  });

  it('finds a pad by its game, or its game inside one, and says where it is', () => {
    expect(scorePadFor('7-wonders')).toEqual({ kind: 'seven-wonders' });
    expect(scorePadFor('card-deck', 'hearts')).toEqual({ kind: 'rounds', game: 'hearts' });
    expect(scorePadFor('card-deck')).toBeUndefined();
    expect(scorePadPath('card-deck', 'spades')).toBe('/score/card-deck/spades');
    expect(scorePadPath('dominion')).toBe('/score/dominion');
    expect(scorePadPath('dominion', 'intrigue')).toBeNull();
  });

  it("links a rules tab to its own pad, else its game's, set for the tab where it can be", () => {
    expect(scorePadLink('card-deck', 'hearts')).toBe('/score/card-deck/hearts');
    expect(scorePadLink('ticket-to-ride', 'europe')).toBe('/score/ticket-to-ride?map=europe');
    expect(scorePadLink('dominion', 'intrigue')).toBe('/score/dominion');
    expect(scorePadLink('dominion')).toBe('/score/dominion');
    expect(scorePadLink('card-deck', 'spoons')).toBeNull();
    expect(scorePadLink('catan')).toBeNull();
  });

  it("lists only whole games for a card's Score button", () => {
    expect([...SCORE_CALCULATORS].sort()).toEqual(['7-wonders', 'dominion', 'ticket-to-ride', 'uno']);
  });

  // Each card game's pad seats as many as the game in games.ts says it plays.
  const seated: [CardGameId, string, string?][] = [
    ['uno', 'uno'],
    ['rummy', 'card-deck', 'rummy'],
    ['hearts', 'card-deck', 'hearts'],
    ['golf', 'card-deck', 'golf'],
    ['spades', 'card-deck', 'spades'],
    ['euchre', 'card-deck', 'euchre'],
  ];
  it.each(seated)('%s seats the players the game plays with, and states its goal', (id, slug, part) => {
    const game = ALL_GAMES.find((g) => g.slug === slug)!;
    const played = part ? game.subgames!.find((s) => s.slug === part)! : game;
    const rules = CARD_GAMES[id];
    expect([rules.minPlayers, rules.maxPlayers]).toEqual([played.min, played.max]);
    expect(rules.name).toBe(played.name);
    expect(scorePadFor(slug, part)).toEqual({ kind: 'rounds', game: id });
    const goal =
      'to' in rules.goal
        ? String(rules.goal.to)
        : ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][rules.goal.rounds];
    expect(rules.rule).toContain(goal);
    expect(rules.rule).toMatch(rules.goal.low ? /lowest/ : /First (partnership |team )?to/);
  });

  it('scores the partnership games by team, the rest by player', () => {
    expect(
      Object.entries(CARD_GAMES)
        .filter(([, r]) => r.teams)
        .map(([id]) => id),
    ).toEqual(['spades', 'euchre']);
  });
});

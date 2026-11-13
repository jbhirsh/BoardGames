import { describe, it, expect } from 'vitest';
import { ALL_GAMES } from '../data/games';
import { SCORE_PAD_KEYS } from '../data/scoreCalculators';
import { rulebooks } from '../utils/rulebooks';
import { opensRulesPage, opensScorePad } from '../utils/subPages';

describe('opensRulesPage', () => {
  it('opens every game with a rulebook, and none without', () => {
    for (const game of ALL_GAMES) expect(opensRulesPage(game.slug), game.slug).toBe(rulebooks(game).length > 0);
  });

  it.each([undefined, '', 'no-such-game'])('opens no page for %j', (slug) => {
    expect(opensRulesPage(slug)).toBe(false);
  });
});

describe('opensScorePad', () => {
  it('opens every pad, a game inside a deck included', () => {
    for (const key of SCORE_PAD_KEYS) {
      const [slug, part] = key.split('/');
      expect(opensScorePad(slug, part), key).toBe(true);
    }
  });

  it.each([
    [undefined, undefined],
    ['no-such-game', undefined],
    ['catan', undefined],
    ['7-wonders', 'no-such-part'],
    ['card-deck', 'no-such-game'],
  ])('opens no pad for %j / %j', (slug, part) => {
    expect(opensScorePad(slug, part)).toBe(false);
  });
});

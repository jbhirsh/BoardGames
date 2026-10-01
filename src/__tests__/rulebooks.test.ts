import { describe, it, expect } from 'vitest';
import { rulebooks, rulebookPath, chatParts } from '../utils/rulebooks';
import { quickGame } from './testData';
import type { Game, SubGame } from '../data/types';

const sub = (over: Partial<SubGame>): SubGame => ({
  name: 'Sub', slug: 'sub', kind: 'card-game', players: '2', min: 2, max: 2,
  dur: '5 min', mins: 5, cat: 'quick', short: 'A sub-game.', yt: 'how to play sub', ...over,
});

describe('rulebooks', () => {
  it('is just the game\'s own rulebook when nothing is inside it', () => {
    expect(rulebooks(quickGame)).toEqual([
      { label: 'Base game', name: 'Quick Game', short: 'A quick card game.', pdf: '/rules/quick-game.pdf' },
    ]);
  });

  it('lists each game inside that has a rulebook, after the game\'s own', () => {
    const game: Game = { ...quickGame, subgames: [
      sub({ name: 'Expansion', slug: 'exp', kind: 'expansion', rules: '/rules/quick-game.exp.pdf' }),
      sub({ name: 'In the box', slug: 'box', kind: 'expansion' }),
    ] };
    expect(rulebooks(game)).toEqual([
      { label: 'Base game', name: 'Quick Game', short: 'A quick card game.', pdf: '/rules/quick-game.pdf' },
      { part: 'exp', label: 'Expansion', name: 'Expansion', short: 'A sub-game.', pdf: '/rules/quick-game.exp.pdf', kind: 'expansion' },
    ]);
  });

  it('calls a deck\'s own sheet the overview, but not when anything inside is an add-on', () => {
    const deck: Game = { ...quickGame, subgames: [sub({ rules: '/rules/quick-game.sub.pdf' })] };
    expect(rulebooks(deck)[0].label).toBe('Overview');
    const mixed: Game = { ...quickGame, subgames: [sub({}), sub({ slug: 'ext', kind: 'extension' })] };
    expect(rulebooks(mixed)[0].label).toBe('Base game');
  });
});

describe('rulebookPath', () => {
  it('points at the game, or at one of its rulebooks', () => {
    expect(rulebookPath('catan')).toBe('/rules/catan');
    expect(rulebookPath('catan', 'cities-and-knights')).toBe('/rules/catan/cities-and-knights');
  });
});

describe('chatParts', () => {
  const withRules = (slug: string, kind: SubGame['kind']) => sub({ name: slug, slug, kind, rules: `/rules/quick-game.${slug}.pdf` });

  it('reads every game\'s rulebook for a deck, whichever tab is open', () => {
    const deck: Game = { ...quickGame, subgames: [withRules('euchre', 'card-game'), withRules('speed', 'card-game'), sub({ slug: 'none' })] };
    const [overview, euchre] = rulebooks(deck);
    expect(chatParts(deck, overview)).toEqual(['euchre', 'speed']);
    expect(chatParts(deck, euchre)).toEqual(['euchre', 'speed']);
  });

  it('reads only the open add-on\'s rulebook, and none on the base game tab', () => {
    const game: Game = { ...quickGame, subgames: [withRules('ext', 'extension'), withRules('exp', 'expansion')] };
    const [base, ext, exp] = rulebooks(game);
    expect(chatParts(game, base)).toEqual([]);
    expect(chatParts(game, ext)).toEqual(['ext']);
    expect(chatParts(game, exp)).toEqual(['exp']);
  });

  it('reads nothing extra for a game with nothing inside', () => {
    expect(chatParts(quickGame, rulebooks(quickGame)[0])).toEqual([]);
  });
});

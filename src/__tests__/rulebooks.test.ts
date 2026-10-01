import { describe, it, expect } from 'vitest';
import { rulebooks, rulebookPath, chatParts, chatScope } from '../utils/rulebooks';
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

describe('a game\'s further rulebooks', () => {
  const more = [
    { slug: 'game-2', label: 'Game 2', pdf: '/rules/quick-game.game-2.pdf' },
    { slug: 'game-3', label: 'Game 3', pdf: '/rules/quick-game.game-3.pdf' },
  ];

  it('come after its own, which takes the label it names', () => {
    const game: Game = { ...quickGame, rulesLabel: 'Game 1', moreRules: more };
    expect(rulebooks(game)).toEqual([
      { label: 'Game 1', name: 'Quick Game', short: 'A quick card game.', pdf: '/rules/quick-game.pdf' },
      { part: 'game-2', label: 'Game 2', name: 'Quick Game: Game 2', short: 'A quick card game.', pdf: '/rules/quick-game.game-2.pdf' },
      { part: 'game-3', label: 'Game 3', name: 'Quick Game: Game 3', short: 'A quick card game.', pdf: '/rules/quick-game.game-3.pdf' },
    ]);
  });

  it('go to the rules assistant up to the one on screen, and all of them for an add-on\'s tab', () => {
    const exp = sub({ name: 'Box', slug: 'box', kind: 'expansion', rules: '/rules/quick-game.box.pdf' });
    const game: Game = { ...quickGame, moreRules: more, subgames: [exp] };
    const [base, game2, game3, box] = rulebooks(game);
    expect(chatParts(game, base)).toEqual([]);
    expect(chatParts(game, game2)).toEqual(['game-2']);
    expect(chatParts(game, game3)).toEqual(['game-2', 'game-3']);
    expect(chatParts(game, box)).toEqual(['game-2', 'game-3', 'box']);
  });

  it('leave a deck sending every game in it, whichever tab is open', () => {
    const deck: Game = { ...quickGame, subgames: [sub({ slug: 'speed', rules: '/rules/quick-game.speed.pdf' }), sub({ slug: 'golf', rules: '/rules/quick-game.golf.pdf' })] };
    const books = rulebooks(deck);
    for (const shown of books) expect(chatParts(deck, shown)).toEqual(['speed', 'golf']);
  });
});

describe('an add-on\'s further rulebooks', () => {
  const more = [{ slug: 'game-2', label: 'Game 2', pdf: '/rules/quick-game.game-2.pdf' }];
  const box = sub({
    name: 'Box', slug: 'box', kind: 'expansion', rules: '/rules/quick-game.box.pdf', rulesLabel: 'Box 1',
    moreRules: [
      { slug: 'box-2', label: 'Box 2', pdf: '/rules/quick-game.box-2.pdf' },
      { slug: 'box-3', label: 'Box 3', pdf: '/rules/quick-game.box-3.pdf' },
    ],
  });
  const game: Game = { ...quickGame, rulesLabel: 'Game 1', moreRules: more, subgames: [box] };

  it('follow its own tab, named and marked as the add-on', () => {
    expect(rulebooks(game).slice(2)).toEqual([
      { part: 'box', label: 'Box 1', name: 'Box', short: 'A sub-game.', pdf: '/rules/quick-game.box.pdf', kind: 'expansion' },
      { part: 'box-2', label: 'Box 2', name: 'Box: Box 2', short: 'A sub-game.', pdf: '/rules/quick-game.box-2.pdf', kind: 'expansion' },
      { part: 'box-3', label: 'Box 3', name: 'Box: Box 3', short: 'A sub-game.', pdf: '/rules/quick-game.box-3.pdf', kind: 'expansion' },
    ]);
  });

  it('go to the rules assistant up to the box on screen, after all of the game\'s own', () => {
    const books = rulebooks(game);
    expect(chatParts(game, books[2])).toEqual(['game-2', 'box']);
    expect(chatParts(game, books[3])).toEqual(['game-2', 'box', 'box-2']);
    expect(chatParts(game, books[4])).toEqual(['game-2', 'box', 'box-2', 'box-3']);
  });

  it('say what the assistant is reading, numbered tabs run together', () => {
    const books = rulebooks(game);
    expect(chatScope(game, books[0])).toBe('Reading: Game 1.');
    expect(chatScope(game, books[1])).toBe('Reading: Game 2, plus Game 1.');
    expect(chatScope(game, books[4])).toBe('Reading: Box 3, plus Game 1–2 and Box 1–2.');
  });
});

describe('chatScope', () => {
  it('lists unnumbered rulebooks by name', () => {
    const exp = sub({ name: 'Knights', slug: 'knights', kind: 'expansion', rules: '/rules/quick-game.knights.pdf' });
    const game: Game = { ...quickGame, subgames: [exp] };
    expect(chatScope(game, rulebooks(game)[1])).toBe('Reading: Knights, plus Base game.');
  });

  it('says a deck reads every game in it', () => {
    const deck: Game = { ...quickGame, subgames: [sub({ slug: 'a', rules: '/rules/quick-game.a.pdf' }), sub({ slug: 'b', rules: '/rules/quick-game.b.pdf' })] };
    expect(chatScope(deck, rulebooks(deck)[0])).toBe('Reading: all 2 games in the deck.');
  });

  it('keeps a gap in the numbers as separate runs', () => {
    const game: Game = { ...quickGame, rulesLabel: 'Part 1', moreRules: [
      { slug: 'p3', label: 'Part 3', pdf: '/rules/quick-game.p3.pdf' },
      { slug: 'p4', label: 'Part 4', pdf: '/rules/quick-game.p4.pdf' },
    ] };
    expect(chatScope(game, rulebooks(game)[2])).toBe('Reading: Part 4, plus Part 1 and Part 3.');
  });
});

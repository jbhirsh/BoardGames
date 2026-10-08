import { describe, it, expect } from 'vitest';
import { rulebooks, rulebookPath, chatParts, chatScope, rulesPathFor, mentionedRulebooks, linkCitations, starterQuestions } from '../utils/rulebooks';
import { initialFilterState } from '../data/initialFilterState';
import { GAMES } from '../data/games';
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

describe('rulesPathFor', () => {
  const catan = GAMES.find((g) => g.slug === 'catan')!;
  const deck = GAMES.find((g) => g.slug === 'card-deck')!;
  const at = (players: number) => ({ ...initialFilterState, players });

  it('opens the add-on a game fits the filters through, not its base game', () => {
    expect(rulesPathFor(catan, at(5))).toBe('/rules/catan/5-6-player-extension');
    expect(rulesPathFor(catan, at(6))).toBe('/rules/catan/5-6-player-extension');
  });

  it('opens the game\'s own rulebook when it fits on its own or nothing is filtered', () => {
    expect(rulesPathFor(catan, at(4))).toBe('/rules/catan');
    expect(rulesPathFor(catan, initialFilterState)).toBe('/rules/catan');
    expect(rulesPathFor(quickGame, at(2))).toBe('/rules/quick-game');
  });

  it('keeps a deck on its overview, which lists every game in it', () => {
    expect(rulesPathFor(deck, at(4))).toBe('/rules/card-deck');
  });

  it('skips a fitting add-on with no rulebook of its own', () => {
    const game: Game = { ...quickGame, min: 2, max: 4, subgames: [
      sub({ name: 'Big Box', slug: 'big', kind: 'expansion', min: 5, max: 8 }),
    ] };
    expect(rulesPathFor(game, at(6))).toBe('/rules/quick-game');
  });
});

describe('mentionedRulebooks', () => {
  const catan = GAMES.find((g) => g.slug === 'catan')!;
  const [base, ext, ck] = rulebooks(catan);

  it('finds the tabs an answer names, however the name is written', () => {
    expect(mentionedRulebooks("That's in the 5 6 Player Extension.", catan, base)).toEqual([ext]);
    expect(mentionedRulebooks('See the 5–6 player extension rules.', catan, base)).toEqual([ext]);
    expect(mentionedRulebooks('Cities and Knights changes that.', catan, base)).toEqual([ck]);
    expect(mentionedRulebooks('Both the Cities & Knights and the 5-6 Player Extension do.', catan, base)).toEqual([ext, ck]);
  });

  it('leaves out the tab on screen and the base game, which it always reads', () => {
    expect(mentionedRulebooks('Cities and Knights says so; the base game agrees.', catan, ck)).toEqual([]);
    expect(mentionedRulebooks('Nothing about other boxes.', catan, base)).toEqual([]);
  });

  it('knows a tab by the name the server gives it as well as by its label', () => {
    const game: Game = { ...quickGame, subgames: [
      sub({ name: 'Monster Box of Monsters', slug: 'monster-box-of-monsters', kind: 'expansion', rulesLabel: 'Monster Box 1', rules: '/rules/q.m.pdf' }),
    ] };
    const [own, box] = rulebooks(game);
    expect(mentionedRulebooks('That is in the Monster Box Of Monsters rulebook.', game, own)).toEqual([box]);
    expect(mentionedRulebooks('Monster Box 1 adds it.', game, own)).toEqual([box]);
  });

  it('links only rulebooks the assistant was not already reading', () => {
    const game: Game = { ...quickGame, moreRules: [
      { slug: 'game-2', label: 'Game 2', pdf: '/rules/q.2.pdf' },
      { slug: 'game-3', label: 'Game 3', pdf: '/rules/q.3.pdf' },
    ] };
    const [, two, three] = rulebooks(game);
    // On Game 3's tab the assistant reads Game 2 too; Game 2 needs no link.
    expect(mentionedRulebooks('As in Game 2, and unlike Game 3.', game, three)).toEqual([]);
    expect(mentionedRulebooks('Game 3 adds that.', game, two)).toEqual([three]);
    // Spaces bound the match: "Game 20" is not Game 2.
    expect(mentionedRulebooks('Score 20 at game 20.', game, rulebooks(game)[0])).toEqual([]);
  });
});

describe('linkCitations', () => {
  const catan = GAMES.find((g) => g.slug === 'catan')!;
  const [base, ext, ck] = rulebooks(catan);

  it('links a bare page to the game\'s own rulebook when that was all it read', () => {
    expect(linkCitations('Roll two dice (p. 4).', catan, base)).toBe('Roll two dice ([p. 4](/rules/catan.pdf#page=4)).');
    expect(linkCitations('Trade first (p.12), then build (see p. 3).', catan, base))
      .toBe('Trade first ([p.12](/rules/catan.pdf#page=12)), then build ([see p. 3](/rules/catan.pdf#page=3)).');
    expect(linkCitations('Up (Rulebook p. 2).', catan, base)).toBe('Up ([Rulebook p. 2](/rules/catan.pdf#page=2)).');
  });

  it('leaves a bare page as text when it read more than one rulebook, since it can\'t say which', () => {
    expect(linkCitations('Knights (p. 7).', catan, ck)).toBe('Knights (p. 7).');
    const deck = GAMES.find((g) => g.slug === 'card-deck')!;
    // Every game in the deck is on its own page 1.
    expect(linkCitations('Deal five (p. 1).', deck, rulebooks(deck)[0])).toBe('Deal five (p. 1).');
  });

  it('links a named page to the rulebook sent under that name, however it is written', () => {
    const link = `(/rules/catan.cities-and-knights.pdf#page=7)`;
    expect(linkCitations('Knights (Cities And Knights p. 7).', catan, ck)).toBe(`Knights ([Cities And Knights p. 7]${link}).`);
    expect(linkCitations('Knights (Cities & Knights, p. 7).', catan, ck)).toBe(`Knights ([Cities & Knights, p. 7]${link}).`);
    expect(linkCitations('Knights (cities-and-knights p. 7).', catan, ck)).toBe(`Knights ([cities-and-knights p. 7]${link}).`);
    expect(linkCitations('Knights (Catan: Cities & Knights rulebook p. 7).', catan, ck))
      .toBe(`Knights ([Catan: Cities & Knights rulebook p. 7]${link}).`);
    // The game's own rulebook by name, label or the server's name for it.
    for (const name of ['Catan', 'Base game', 'see Catan']) {
      expect(linkCitations(`Robber (${name} p. 9).`, catan, ck)).toBe(`Robber ([${name} p. 9](/rules/catan.pdf#page=9)).`);
    }
    const ttr = GAMES.find((g) => g.slug === 'ticket-to-ride')!;
    const europe = rulebooks(ttr).find((b) => b.part === 'europe')!;
    expect(linkCitations('(Ticket to Ride Europe p. 4) and (Ticket To Ride p. 3)', ttr, europe))
      .toBe('([Ticket to Ride Europe p. 4](/rules/ticket-to-ride.europe.pdf#page=4)) and ([Ticket To Ride p. 3](/rules/ticket-to-ride.pdf#page=3))');
  });

  it('leaves a rulebook the assistant was not sent as text, and anything else in brackets', () => {
    // On the base game tab the extension isn't sent, so it can't be cited.
    expect(linkCitations('Six seats (5–6 Player Extension p. 2).', catan, base)).toBe('Six seats (5–6 Player Extension p. 2).');
    expect(linkCitations('Six seats (5–6 Player Extension p. 2).', catan, ext))
      .toBe('Six seats ([5–6 Player Extension p. 2](/rules/catan.5-6-player-extension.pdf#page=2)).');
    expect(linkCitations('Up (Seafarers p. 2).', catan, ck)).toBe('Up (Seafarers p. 2).');
    expect(linkCitations('Two dice (see the setup), page 4 (pp. 4).', catan, base)).toBe('Two dice (see the setup), page 4 (pp. 4).');
    expect(linkCitations('(p. 4', catan, base)).toBe('(p. 4');
  });

  it('cites a deck\'s games by name from any tab', () => {
    const deck = GAMES.find((g) => g.slug === 'card-deck')!;
    const [overview] = rulebooks(deck);
    expect(linkCitations('Deal five (Euchre p. 1).', deck, overview)).toBe('Deal five ([Euchre p. 1](/rules/card-deck.euchre.pdf#page=1)).');
    expect(linkCitations('Shuffle (Card Deck p. 1).', deck, overview)).toBe('Shuffle ([Card Deck p. 1](/rules/card-deck.pdf#page=1)).');
  });

  it('tells numbered rulebooks apart', () => {
    const hogwarts = GAMES.find((g) => g.slug === 'hogwarts-battle')!;
    const books = rulebooks(hogwarts);
    const game3 = books.find((b) => b.label === 'Game 3')!;
    expect(linkCitations('(Game 2 p. 4), (Hogwarts Battle Game 3 p. 2), (Game 1 p. 9)', hogwarts, game3)).toBe(
      `([Game 2 p. 4](${books.find((b) => b.label === 'Game 2')!.pdf}#page=4)), ([Hogwarts Battle Game 3 p. 2](${game3.pdf}#page=2)), ([Game 1 p. 9](${books[0].pdf}#page=9))`,
    );
  });
});

describe('starterQuestions', () => {
  const game = (slug: string) => GAMES.find((g) => g.slug === slug)!;

  it('asks setup, turn and win for a game\'s own rulebook, at a table it seats', () => {
    const wonders = game('7-wonders');
    expect(starterQuestions(wonders, rulebooks(wonders)[0])).toEqual([
      'How do we set up for 4 players?', 'How does a turn go?', 'How do you win?',
    ]);
    const two: Game = { ...quickGame, min: 2, max: 2 };
    expect(starterQuestions(two, rulebooks(two)[0])[0]).toBe('How do we set up for 2 players?');
    const solo: Game = { ...quickGame, min: 1, max: 1 };
    expect(starterQuestions(solo, rulebooks(solo)[0])[0]).toBe('How do we set up for 1 player?');
    const big: Game = { ...quickGame, min: 5, max: 10 };
    expect(starterQuestions(big, rulebooks(big)[0])[0]).toBe('How do we set up for 5 players?');
  });

  it('asks across a deck\'s games on its overview, and how to deal on a game\'s tab', () => {
    const deck = game('card-deck');
    const [overview, first] = rulebooks(deck);
    const [a, b] = deck.subgames!;
    expect(starterQuestions(deck, overview)).toEqual([
      'Which of these games work for 4 players?', `How do you play ${a.name}?`, `How do you win at ${b.name}?`,
    ]);
    expect(starterQuestions(deck, first)).toEqual([
      `How do we deal ${a.name} for ${Math.min(Math.max(4, a.min), a.max)} players?`, `How does a turn go in ${a.name}?`, `How do you win at ${a.name}?`,
    ]);
    const solitaire = rulebooks(deck).find((r) => deck.subgames!.find((s) => s.slug === r.part)?.max === 1)!;
    expect(starterQuestions(deck, solitaire)[0]).toBe(`How do we deal ${solitaire.name}?`);
    const lone: Game = { ...quickGame, subgames: [sub({ name: 'Snap', slug: 'snap', rules: '/rules/q.snap.pdf' })] };
    expect(starterQuestions(lone, rulebooks(lone)[0])[2]).toBe('How do you win at Snap?');
  });

  it('asks what an add-on changes, at a table the add-on seats', () => {
    const catan = game('catan');
    const ext = rulebooks(catan).find((r) => r.part === '5-6-player-extension')!;
    expect(starterQuestions(catan, ext)).toEqual([
      'What does 5–6 Player Extension change?', 'How do we set up for 5 players?', 'How do you win?',
    ]);
  });

  it('asks what an add-on\'s further rulebook changes too', () => {
    const game: Game = { ...quickGame, subgames: [sub({
      name: 'Big Box', slug: 'big', kind: 'expansion', rulesLabel: 'Box 1', rules: '/rules/q.big.pdf',
      moreRules: [{ slug: 'big-2', label: 'Box 2', pdf: '/rules/q.big-2.pdf' }],
    })] };
    expect(starterQuestions(game, rulebooks(game)[2])[0]).toBe('What does Box 2 change?');
  });

  it('asks what is new in a further rulebook of the same game', () => {
    const more: Game = { ...quickGame, moreRules: [{ slug: 'game-2', label: 'Game 2', pdf: '/rules/q.2.pdf' }] };
    expect(starterQuestions(more, rulebooks(more)[1])[0]).toBe("What's new in Game 2?");
  });
});

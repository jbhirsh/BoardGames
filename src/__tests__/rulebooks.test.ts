import { describe, it, expect } from 'vitest';
import { rulebooks, rulebookPath, citedPage, chatParts, chatScope, rulesPathFor, mentionedRulebooks, linkCitations, starterQuestions } from '../utils/rulebooks';
import { initialFilterState } from '../data/initialFilterState';
import { GAMES } from '../data/games';
import { quickGame } from './testData';
import type { Game, SubGame } from '../data/types';
import type { Rulebook } from '../utils/rulebooks';

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
  const game = (slug: string) => GAMES.find((g) => g.slug === slug)!;
  const book = (slug: string, label: string) => rulebooks(game(slug)).find((b) => b.label === label)!;
  const gameOf = (b: Rulebook) => GAMES.find((g) => rulebooks(g).some((r) => r.pdf === b.pdf))!;
  /**
   * A citation link as linkCitations writes it. Given its text (which then
   * names the rulebook), just that; else "p. N", with a title for its
   * accessible name that starts with its text and adds the rulebook.
   */
  const cite = (b: Rulebook, page: number, text?: string) => {
    if (text) return `[${text}](${b.pdf}#page=${page})`;
    const where = rulebooks(gameOf(b)).length > 1 ? b.label : `${b.name} rulebook`;
    return `[p. ${page}](${b.pdf}#page=${page} "p. ${page}, ${where}")`;
  };
  const catan = book('catan', 'Base game');
  const ext = book('catan', '5–6 Player Extension');
  const ck = book('catan', 'Cities & Knights');
  const europe = book('ticket-to-ride', 'Europe');
  const ttr = book('ticket-to-ride', 'Base game');
  const overview = book('card-deck', 'Overview');
  const euchre = book('card-deck', 'Euchre');
  const [game1, game2, game3] = ['Game 1', 'Game 2', 'Game 3'].map((l) => book('hogwarts-battle', l));
  // [what it shows, the tab the answer is on, the answer, what it becomes]
  const cases: [string, Rulebook, string, string][] = [
    // One rulebook read: a bare page is that rulebook's, "see" and "Rulebook" before it dropped.
    ['a bare page', catan, 'Roll two dice (p. 4).', `Roll two dice (${cite(catan, 4)}).`],
    ['a page with no space', catan, 'Trade first (p.12).', `Trade first (${cite(catan, 12)}).`],
    ['"see" before the page', catan, 'Build (see p. 3).', `Build (${cite(catan, 3)}).`],
    ['"Rulebook" for the only one read', catan, 'Up (Rulebook p. 2).', `Up (${cite(catan, 2)}).`],
    // Several pages: a link each.
    ['pages after a comma', catan, '(p. 2, 4)', `(${cite(catan, 2)}, ${cite(catan, 4)})`],
    ['pages joined by "and"', catan, '(p. 2 and 4)', `(${cite(catan, 2)}, ${cite(catan, 4)})`],
    ['a list ending ", and"', catan, '(p. 2, 3, and 6)', `(${cite(catan, 2)}, ${cite(catan, 3)}, ${cite(catan, 6)})`],
    ['pages joined by "&"', catan, '(p. 2 & 4)', `(${cite(catan, 2)}, ${cite(catan, 4)})`],
    ['the same page twice, once', catan, '(p. 4, 4)', `(${cite(catan, 4)})`],
    ['"see also" before a page', catan, '(p. 3, see also p. 5)', `(${cite(catan, 3)}, ${cite(catan, 5)})`],
    ['"also" before a page', catan, '(p. 3; also p. 5)', `(${cite(catan, 3)}, ${cite(catan, 5)})`],
    // A run: every page of a short one, the ends of a long one.
    ['a run with an en dash', catan, '(pp. 6–9)', `(${[6, 7, 8, 9].map((n) => cite(catan, n)).join(', ')})`],
    ['a run with a hyphen and spaces', catan, '(pp. 6 - 7)', `(${cite(catan, 6)}, ${cite(catan, 7)})`],
    ['a run with "to"', catan, '(pp. 3 to 4)', `(${cite(catan, 3)}, ${cite(catan, 4)})`],
    ['a run of five, in full', catan, '(pp. 1–5)', `(${[1, 2, 3, 4, 5].map((n) => cite(catan, n)).join(', ')})`],
    ['a run of six, by its ends', catan, '(pp. 1–6)', `(${cite(catan, 1)}–${cite(catan, 6)})`],
    ['a run of one', catan, '(pp. 4–4)', `(${cite(catan, 4)})`],
    ['a page and a run', catan, '(p. 2, 6–7)', `(${cite(catan, 2)}, ${cite(catan, 6)}, ${cite(catan, 7)})`],
    // Named rulebooks: the tab label shown on the first page, the model's spelling gone.
    ['an add-on by its server name', ck, 'Knights (Cities And Knights p. 7).', `Knights (${cite(ck, 7, 'Cities & Knights p. 7')}).`],
    ['an add-on after a comma', ck, '(Cities & Knights, p. 7)', `(${cite(ck, 7, 'Cities & Knights p. 7')})`],
    ['an add-on by its part', ck, '(cities-and-knights p. 7)', `(${cite(ck, 7, 'Cities & Knights p. 7')})`],
    ['an add-on with the game and "rulebook"', ck, '(Catan: Cities & Knights rulebook p. 7)', `(${cite(ck, 7, 'Cities & Knights p. 7')})`],
    ['the game\'s own by name', ck, '(Catan p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    ['the game\'s own by label', ck, '(Base game p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    ['the game\'s own after "see"', ck, '(see Catan p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    ['a named rulebook with several pages', ck, '(Catan p. 2, 4)', `(${cite(catan, 2, 'Base game p. 2')}, ${cite(catan, 4)})`],
    ['the same rulebook named twice, as one', ck, '(Catan p. 5, Catan p. 11)', `(${cite(catan, 5, 'Base game p. 5')}, ${cite(catan, 11)})`],
    ['a bare page after a named one, in that rulebook', ck, '(Catan p. 5, p. 11)', `(${cite(catan, 5, 'Base game p. 5')}, ${cite(catan, 11)})`],
    ['two rulebooks after a semicolon', ck, '(Catan p. 5; Cities And Knights p. 2)', `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ck, 2, 'Cities & Knights p. 2')})`],
    ['two rulebooks joined by "and"', ck, '(Catan p. 5 and Cities & Knights p. 2, 3)', `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ck, 2, 'Cities & Knights p. 2')}, ${cite(ck, 3)})`],
    ['a name that starts with a run', ext, '(Catan p. 5, 5–6 Player Extension p. 2)', `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ext, 2, '5–6 Player Extension p. 2')})`],
    ['a version with the game before it', europe, '(Ticket to Ride Europe p. 4)', `(${cite(europe, 4, 'Europe p. 4')})`],
    ['the version\'s base game', europe, '(Ticket To Ride p. 3)', `(${cite(ttr, 3, 'Base game p. 3')})`],
    ['a deck\'s game from its overview', overview, 'Deal five (Euchre p. 1).', `Deal five (${cite(euchre, 1, 'Euchre p. 1')}).`],
    ['a deck\'s own sheet', overview, '(Card Deck p. 1)', `(${cite(overview, 1, 'Overview p. 1')})`],
    ['numbered rulebooks told apart', game3, '(Game 2 p. 4), (Hogwarts Battle Game 3 p. 2), (Game 1 p. 9)',
      `(${cite(game2, 4, 'Game 2 p. 4')}), (${cite(game3, 2, 'Game 3 p. 2')}), (${cite(game1, 9, 'Game 1 p. 9')})`],
    // Partly known: what is known is linked, the rest kept as written.
    ['a rulebook it wasn\'t sent beside one it was', ck, '(Catan p. 5, Seafarers p. 2)', `(${cite(catan, 5, 'Base game p. 5')}, Seafarers p. 2)`],
    ['the separator written before one it wasn\'t sent', ck, '(Seafarers p. 2 and Catan p. 5)', `(Seafarers p. 2 and ${cite(catan, 5, 'Base game p. 5')})`],
    ['a page 0 beside a good one', ck, '(Catan p. 0; Cities And Knights p. 2)', `(Catan p. 0; ${cite(ck, 2, 'Cities & Knights p. 2')})`],
    // Left as written.
    ['a bare page when more than one rulebook was read', ck, 'Knights (p. 7).', 'Knights (p. 7).'],
    ['a bare page in a deck, whose games are all on page 1', overview, 'Deal five (p. 1).', 'Deal five (p. 1).'],
    ['a rulebook that tab does not send', catan, 'Six seats (5–6 Player Extension p. 2).', 'Six seats (5–6 Player Extension p. 2).'],
    ['a rulebook the game does not have', ck, 'Up (Seafarers p. 2).', 'Up (Seafarers p. 2).'],
    ['two rulebooks it wasn\'t sent', ck, '(Seafarers p. 2, Traders p. 3)', '(Seafarers p. 2, Traders p. 3)'],
    ['page 0', catan, '(p. 0)', '(p. 0)'],
    ['a run that goes backwards', catan, '(pp. 9–6)', '(pp. 9–6)'],
    ['a page with words after it', catan, '(p. 5 and the robber)', '(p. 5 and the robber)'],
    ['a page with a full stop inside', catan, '(p. 4.)', '(p. 4.)'],
    ['a page number too long to be one', catan, '(p. 12345)', '(p. 12345)'],
    ['other words in brackets', catan, 'Two dice (see the setup), page 4.', 'Two dice (see the setup), page 4.'],
    ['an unclosed bracket', catan, '(p. 4', '(p. 4'],
  ];

  it.each(cases)('%s', (_, tab, answer, linked) => {
    expect(linkCitations(answer, gameOf(tab), tab)).toBe(linked);
  });

  it('leaves the text around the citations as it was', () => {
    expect(linkCitations('A (p. 1) b (p. 2).', game('catan'), catan)).toBe(`A (${cite(catan, 1)}) b (${cite(catan, 2)}).`);
  });

  it('shows no tab label for a game with only its own rulebook', () => {
    const azul = rulebooks(game('azul'))[0];
    expect(linkCitations('(Azul p. 2)', game('azul'), azul)).toBe(`(${cite(azul, 2)})`);
  });

  it('escapes a label that Markdown would read, in the text and the title', () => {
    const odd: Game = { ...quickGame, subgames: [
      sub({ name: 'Odd', slug: 'odd', kind: 'expansion', rules: '/rules/quick-game.odd.pdf', rulesLabel: 'Odd "Box" [1]' }),
    ] };
    const [, shown] = rulebooks(odd);
    expect(linkCitations('(Odd p. 3, 4)', odd, shown)).toBe(
      '([Odd "Box" \\[1\\] p. 3](/rules/quick-game.odd.pdf#page=3), [p. 4](/rules/quick-game.odd.pdf#page=4 "p. 4, Odd \\"Box\\" [1]"))',
    );
  });

  it('names every link by its own text first, so a voice command finds it (WCAG 2.5.3)', () => {
    const answer = '(Catan p. 5, 11; Cities And Knights pp. 2–3), (Catan pp. 1–9)';
    const links = [...linkCitations(answer, game('catan'), ck).matchAll(/\[([^\]]+)\]\([^ )]+(?: "([^"]+)")?\)/g)];
    expect(links).toHaveLength(6);
    for (const [, text, title] of links) {
      // A title only where the text doesn't say which rulebook.
      expect(title === undefined).toBe(/^(Base game|Cities & Knights) /.test(text));
      if (title) expect(title).toMatch(new RegExp(`^${text}, (Base game|Cities & Knights)$`));
    }
  });
});

describe('citedPage', () => {
  const catan = GAMES.find((g) => g.slug === 'catan')!;
  const [base, , ck] = rulebooks(catan);

  it('finds the game\'s rulebook and the page a citation link opens', () => {
    expect(citedPage('/rules/catan.pdf#page=5', catan)).toEqual({ book: base, page: 5 });
    expect(citedPage('/rules/catan.cities-and-knights.pdf#page=9999', catan)).toEqual({ book: ck, page: 9999 });
  });

  it('is null for any other link, and for a page no citation gives', () => {
    expect(citedPage('/rules/azul.pdf#page=5', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf#page=', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf#page=5x', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf#page=0', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf#page=05', catan)).toBeNull();
    expect(citedPage('/rules/catan.pdf#page=12345', catan)).toBeNull();
    expect(citedPage('https://example.com/#page=5', catan)).toBeNull();
    expect(citedPage('#page=5', catan)).toBeNull();
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

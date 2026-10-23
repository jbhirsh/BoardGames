import { describe, it, expect } from 'vitest';
import { citationsIn, citedPage, linkCitations, mentionedRulebooks } from '../utils/citations';
import { rulebooks, type Rulebook } from '../utils/rulebooks';
import { ALL_GAMES } from '../data/games';
import { quickGame } from './testData';
import type { Game, SubGame } from '../data/types';

const sub = (over: Partial<SubGame>): SubGame => ({
  name: 'Sub',
  slug: 'sub',
  kind: 'card-game',
  players: '2',
  min: 2,
  max: 2,
  dur: '5 min',
  mins: 5,
  short: 'A sub-game.',
  yt: 'how to play sub',
  ...over,
});

describe('mentionedRulebooks', () => {
  const catan = ALL_GAMES.find((g) => g.slug === 'catan')!;
  const [base, ext, ck] = rulebooks(catan);

  it('finds the tabs an answer names, however the name is written', () => {
    expect(mentionedRulebooks("That's in the 5 6 Player Extension.", catan, base)).toEqual([ext]);
    expect(mentionedRulebooks('See the 5–6 player extension rules.', catan, base)).toEqual([ext]);
    expect(mentionedRulebooks('Cities and Knights changes that.', catan, base)).toEqual([ck]);
    expect(mentionedRulebooks('Both the Cities & Knights and the 5-6 Player Extension do.', catan, base)).toEqual([
      ext,
      ck,
    ]);
  });

  it('leaves out the tab on screen and the base game, which it always reads', () => {
    expect(mentionedRulebooks('Cities and Knights says so; the base game agrees.', catan, ck)).toEqual([]);
    expect(mentionedRulebooks('Nothing about other boxes.', catan, base)).toEqual([]);
  });

  it('knows a tab by the name the server gives it as well as by its label', () => {
    const game: Game = {
      ...quickGame,
      subgames: [
        sub({
          name: 'Monster Box of Monsters',
          slug: 'monster-box-of-monsters',
          kind: 'expansion',
          rulesLabel: 'Monster Box 1',
          rules: '/rules/q.m.pdf',
        }),
      ],
    };
    const [own, box] = rulebooks(game);
    expect(mentionedRulebooks('That is in the Monster Box Of Monsters rulebook.', game, own)).toEqual([box]);
    expect(mentionedRulebooks('Monster Box 1 adds it.', game, own)).toEqual([box]);
  });

  it('links only rulebooks the assistant was not already reading', () => {
    const game: Game = {
      ...quickGame,
      moreRules: [
        { slug: 'game-2', label: 'Game 2', pdf: '/rules/q.2.pdf' },
        { slug: 'game-3', label: 'Game 3', pdf: '/rules/q.3.pdf' },
      ],
    };
    const [, two, three] = rulebooks(game);
    // On Game 3's tab the assistant reads Game 2 too; Game 2 needs no link.
    expect(mentionedRulebooks('As in Game 2, and unlike Game 3.', game, three)).toEqual([]);
    expect(mentionedRulebooks('Game 3 adds that.', game, two)).toEqual([three]);
    // Spaces bound the match: "Game 20" is not Game 2.
    expect(mentionedRulebooks('Score 20 at game 20.', game, rulebooks(game)[0])).toEqual([]);
  });
});

describe('linkCitations', () => {
  const game = (slug: string) => ALL_GAMES.find((g) => g.slug === slug)!;
  const book = (slug: string, label: string) => rulebooks(game(slug)).find((b) => b.label === label)!;
  const gameOf = (b: Rulebook) => ALL_GAMES.find((g) => rulebooks(g).some((r) => r.pdf === b.pdf))!;
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
    [
      'an add-on by its server name',
      ck,
      'Knights (Cities And Knights p. 7).',
      `Knights (${cite(ck, 7, 'Cities & Knights p. 7')}).`,
    ],
    ['an add-on after a comma', ck, '(Cities & Knights, p. 7)', `(${cite(ck, 7, 'Cities & Knights p. 7')})`],
    ['an add-on by its part', ck, '(cities-and-knights p. 7)', `(${cite(ck, 7, 'Cities & Knights p. 7')})`],
    [
      'an add-on with the game and "rulebook"',
      ck,
      '(Catan: Cities & Knights rulebook p. 7)',
      `(${cite(ck, 7, 'Cities & Knights p. 7')})`,
    ],
    ["the game's own by name", ck, '(Catan p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    ["the game's own by label", ck, '(Base game p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    ['the game\'s own after "see"', ck, '(see Catan p. 9)', `(${cite(catan, 9, 'Base game p. 9')})`],
    [
      'a named rulebook with several pages',
      ck,
      '(Catan p. 2, 4)',
      `(${cite(catan, 2, 'Base game p. 2')}, ${cite(catan, 4)})`,
    ],
    [
      'the same rulebook named twice, as one',
      ck,
      '(Catan p. 5, Catan p. 11)',
      `(${cite(catan, 5, 'Base game p. 5')}, ${cite(catan, 11)})`,
    ],
    [
      'a bare page after a named one, in that rulebook',
      ck,
      '(Catan p. 5, p. 11)',
      `(${cite(catan, 5, 'Base game p. 5')}, ${cite(catan, 11)})`,
    ],
    [
      'two rulebooks after a semicolon',
      ck,
      '(Catan p. 5; Cities And Knights p. 2)',
      `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ck, 2, 'Cities & Knights p. 2')})`,
    ],
    [
      'two rulebooks joined by "and"',
      ck,
      '(Catan p. 5 and Cities & Knights p. 2, 3)',
      `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ck, 2, 'Cities & Knights p. 2')}, ${cite(ck, 3)})`,
    ],
    [
      'a name that starts with a run',
      ext,
      '(Catan p. 5, 5–6 Player Extension p. 2)',
      `(${cite(catan, 5, 'Base game p. 5')}; ${cite(ext, 2, '5–6 Player Extension p. 2')})`,
    ],
    [
      'a version with the game before it',
      europe,
      '(Ticket to Ride Europe p. 4)',
      `(${cite(europe, 4, 'Europe p. 4')})`,
    ],
    ["the version's base game", europe, '(Ticket To Ride p. 3)', `(${cite(ttr, 3, 'Base game p. 3')})`],
    [
      "a deck's game from its overview",
      overview,
      'Deal five (Euchre p. 1).',
      `Deal five (${cite(euchre, 1, 'Euchre p. 1')}).`,
    ],
    ["a deck's own sheet", overview, '(Card Deck p. 1)', `(${cite(overview, 1, 'Overview p. 1')})`],
    [
      'numbered rulebooks told apart',
      game3,
      '(Game 2 p. 4), (Hogwarts Battle Game 3 p. 2), (Game 1 p. 9)',
      `(${cite(game2, 4, 'Game 2 p. 4')}), (${cite(game3, 2, 'Game 3 p. 2')}), (${cite(game1, 9, 'Game 1 p. 9')})`,
    ],
    // Partly known: what is known is linked, the rest kept as written.
    [
      "a rulebook it wasn't sent beside one it was",
      ck,
      '(Catan p. 5, Seafarers p. 2)',
      `(${cite(catan, 5, 'Base game p. 5')}, Seafarers p. 2)`,
    ],
    [
      "the separator written before one it wasn't sent",
      ck,
      '(Seafarers p. 2 and Catan p. 5)',
      `(Seafarers p. 2 and ${cite(catan, 5, 'Base game p. 5')})`,
    ],
    [
      'a page 0 beside a good one',
      ck,
      '(Catan p. 0; Cities And Knights p. 2)',
      `(Catan p. 0; ${cite(ck, 2, 'Cities & Knights p. 2')})`,
    ],
    // Left as written.
    ['a bare page when more than one rulebook was read', ck, 'Knights (p. 7).', 'Knights (p. 7).'],
    ['a bare page in a deck, whose games are all on page 1', overview, 'Deal five (p. 1).', 'Deal five (p. 1).'],
    [
      'a rulebook that tab does not send',
      catan,
      'Six seats (5–6 Player Extension p. 2).',
      'Six seats (5–6 Player Extension p. 2).',
    ],
    ['a rulebook the game does not have', ck, 'Up (Seafarers p. 2).', 'Up (Seafarers p. 2).'],
    ["two rulebooks it wasn't sent", ck, '(Seafarers p. 2, Traders p. 3)', '(Seafarers p. 2, Traders p. 3)'],
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
    expect(linkCitations('A (p. 1) b (p. 2).', game('catan'), catan)).toBe(
      `A (${cite(catan, 1)}) b (${cite(catan, 2)}).`,
    );
  });

  it('shows no tab label for a game with only its own rulebook', () => {
    const azul = rulebooks(game('azul'))[0];
    expect(linkCitations('(Azul p. 2)', game('azul'), azul)).toBe(`(${cite(azul, 2)})`);
  });

  it('escapes a label that Markdown would read, in the text and the title', () => {
    const odd: Game = {
      ...quickGame,
      subgames: [
        sub({
          name: 'Odd',
          slug: 'odd',
          kind: 'expansion',
          rules: '/rules/quick-game.odd.pdf',
          rulesLabel: 'Odd "Box" [1]',
        }),
      ],
    };
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

describe('citationsIn', () => {
  const catan = ALL_GAMES.find((g) => g.slug === 'catan')!;
  const [base, knights] = ['Base game', 'Cities & Knights'].map((label) =>
    rulebooks(catan).find((b) => b.label === label)!,
  );

  it('lists the rulebook and page each citation opens, once each, in the order cited', () => {
    const answer =
      'Knights (Cities And Knights p. 4). A 7 (Catan p. 5, 6). Again (Catan p. 5); see also [a link](https://example.com).';
    expect(citationsIn(answer, catan, knights)).toEqual([
      { book: knights, page: 4 },
      { book: base, page: 5 },
      { book: base, page: 6 },
    ]);
  });

  it('lists nothing for an answer without a citation it can link', () => {
    expect(citationsIn('Roll two dice (p. 3).', catan, knights)).toEqual([]);
    expect(citationsIn('Roll two dice.', catan, base)).toEqual([]);
  });
});

describe('citedPage', () => {
  const catan = ALL_GAMES.find((g) => g.slug === 'catan')!;
  const [base, , ck] = rulebooks(catan);

  it("finds the game's rulebook and the page a citation link opens", () => {
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

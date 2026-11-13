import { describe, it, expect } from 'vitest';
import { ALL_GAMES } from '../data/games';
import { collectionWithBgg, indexBgg, toWishlistItem, type ListedGame } from '../utils/bggInfo';
import { awardLine, honoursSummary, splitHonours } from '../utils/honours';

// Made-up BoardGameGeek data, none of it BGG's.
const win = { name: 'Fixture Award', year: 2020, result: 'Winner' };
const nominee = { name: 'Fixture Prize', year: 2021, result: 'Nominee' };

describe('collectionWithBgg', () => {
  const catan = ALL_GAMES.find((g) => g.slug === 'catan')!;
  const azul = ALL_GAMES.find((g) => g.slug === 'azul')!;
  const info = indexBgg([
    { bggId: catan.bgg!, summary: 'Trade and build.', weight: 2.3, honours: [win, nominee] },
    { bggId: azul.bgg!, summary: 'Tiles.', weight: 1.8, honours: [] },
  ]);
  const [withCatan, withAzul] = ['catan', 'azul'].map((slug) =>
    collectionWithBgg(ALL_GAMES, info).find((g) => g.slug === slug)!,
  );

  it("gives each game BGG's weight and honours, and BGG's summary only to a game the owner picked", () => {
    expect(catan.bggSummary).toBe(true);
    expect(withCatan).toMatchObject({ weight: 2.3, short: 'Trade and build.', awards: [win, nominee] });
    expect(azul.bggSummary).toBeUndefined();
    expect(withAzul).toMatchObject({ weight: 1.8, short: azul.short, awards: [] });
  });

  it('leaves a game BGG has nothing for as it is', () => {
    expect(collectionWithBgg(ALL_GAMES, new Map())).toEqual(ALL_GAMES);
  });

  it("keeps a picked game's own line when BGG has no summary", () => {
    const none = indexBgg([{ bggId: catan.bgg!, summary: null, weight: null, honours: [] }]);
    expect(collectionWithBgg(ALL_GAMES, none).find((g) => g.slug === 'catan')!.short).toBe(catan.short);
  });
});

describe('toWishlistItem', () => {
  const game: ListedGame = {
    id: 'sug-1',
    name: 'Root',
    source: 'FRIEND',
    suggestedBy: 'Alex',
    note: 'Mean fun',
    players: '2–4',
    minPlayers: 2,
    maxPlayers: 4,
    dur: '90 min',
    minutes: 90,
    description: 'Woodland war. Asymmetric factions.',
    keywords: ['strategy', 'nope'],
    section: 'heavy',
    bggId: 237182,
  };

  it("takes BGG's summary as its line, the description and the friend's note behind More", () => {
    const item = toWishlistItem(
      game,
      indexBgg([{ bggId: 237182, summary: 'Rule the woods.', weight: 3.7, honours: [win] }]),
    );
    expect(item).toMatchObject({
      short: 'Rule the woods.',
      desc: 'Woodland war. Asymmetric factions. “Mean fun”',
      blurb: 'Woodland war. Asymmetric factions.',
      kw: ['strategy'],
      type: 'heavy',
      weight: 3.7,
      awards: [win],
      source: 'friend',
      suggestedBy: 'Alex',
      yt: 'how to play Root board game',
    });
  });

  it("falls back to the description's first sentence, and files a game with no section under friends", () => {
    const item = toWishlistItem({ ...game, section: null, bggId: null, source: 'OWNER', note: '' }, new Map());
    expect(item).toMatchObject({ short: 'Woodland war.', type: 'suggested', source: 'owner', awards: [] });
    expect(item.weight).toBeUndefined();
    expect(toWishlistItem({ ...game, description: '', note: '', source: 'OWNER' }, new Map()).desc).toBe(
      'Added by the owner.',
    );
  });
});

describe('honours', () => {
  it('splits wins from the rest, newest first, and words each one way', () => {
    const { wins, others } = splitHonours([nominee, win, { name: 'Old', year: 2001, result: 'Winner' }]);
    expect(wins.map(awardLine)).toEqual(['Fixture Award, 2020', 'Old, 2001']);
    expect(others.map(awardLine)).toEqual(['Fixture Prize, 2021 · Nominee']);
    expect(awardLine({ name: 'Undated', result: 'Finalist' })).toBe('Undated · Finalist');
  });

  it('counts the rest by result, most first', () => {
    const n = (result: string) => ({ name: 'X', year: 2020, result });
    expect(
      honoursSummary([n('Nominee'), n('Nominee'), n('Nominee'), n('Recommended'), n('Finalist'), n('Finalist')]),
    ).toBe('Nominated 3 times · A finalist twice · Recommended once');
    expect(honoursSummary([])).toBe('');
  });
});

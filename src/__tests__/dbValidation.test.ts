// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checked, gameRow, suggestionRow, voteRow } from '../../api/_db/validation';

const game = {
  id: 'azul',
  name: 'Azul',
  status: 'wanted',
  source: 'curated',
  minPlayers: 2,
  maxPlayers: 4,
  minutes: 45,
  description: 'Tiles.',
  keywords: ['abstract'],
  awards: [],
};
const suggestion = {
  id: 'sug-1a2b',
  gameName: 'Azul',
  name: 'Sam',
  note: '',
  status: 'approved',
  source: 'friend',
  createdAt: 2_000,
};

/** The messages `checked` gives for `value`, one per broken rule. */
function problems(schema: Parameters<typeof checked>[0], value: unknown): string[] {
  try {
    checked(schema, value, 'it');
    return [];
  } catch (e) {
    return (e as Error).message.split('\n').slice(1);
  }
}

describe('the rows the database takes', () => {
  it('pass as they are when they keep every rule', () => {
    expect(checked(gameRow, game, 'it')).toEqual(game);
    expect(checked(suggestionRow, suggestion, 'it')).toEqual(suggestion);
    expect(checked(voteRow, { gameId: 'azul', anonId: 'anon-aaaaaaaa' }, 'it')).toEqual({
      gameId: 'azul',
      anonId: 'anon-aaaaaaaa',
    });
  });

  it("name each rule a game breaks, in the site's words", () => {
    expect(
      problems(gameRow, {
        ...game,
        id: 'Azul!',
        name: 'A',
        minutes: 601,
        keywords: ['abstract', 'abstract'],
        section: 'suggested',
        image: 'http://example.com/a.jpg',
        weight: 6,
      }),
    ).toEqual([
      "  id: A game's id is lowercase letters, digits and dashes",
      "  name: A game's name needs at least 2 characters",
      '  minutes: Minutes are at most 600',
      '  keywords: A keyword is listed once',
      '  section: A section has to be one of the wishlist’s',
      '  image: Box art is a file the site serves or an https link',
      '  weight: A weight is up to 5 (heavy)',
    ]);
  });

  it("hold a suggestion's decision after it was made", () => {
    expect(problems(suggestionRow, { ...suggestion, decidedAt: 1_000 })).toEqual([
      "  decidedAt: A suggestion can't be decided before it was made",
    ]);
  });

  it('say so when what arrives is no row at all', () => {
    const [only, ...more] = problems(voteRow, null);
    expect(only).toMatch(/^ {2}\(row\): /);
    expect(more).toEqual([]);
  });
});

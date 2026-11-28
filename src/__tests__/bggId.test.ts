import { describe, it, expect } from 'vitest';
import { parseBggId } from '../../api/_lib/bggId';

// What the owner may paste into the edit form's "Paste a BGG link or id" (api/_lib/bggId.ts).

describe('parseBggId', () => {
  it.each([
    ['453740', 453740],
    ['  453740  ', 453740],
    ['https://boardgamegeek.com/boardgame/453740/container', 453740],
    ['https://www.boardgamegeek.com/boardgame/453740', 453740],
    ['http://boardgamegeek.com/boardgame/453740/container?foo=1#x', 453740],
    ['boardgamegeek.com/boardgame/26990/container', 26990],
    ['BoardGameGeek.com/BoardGame/26990', 26990],
    ['https://boardgamegeek.com/boardgameexpansion/12345/more-containers', 12345],
  ])('reads %j as %d', (text, id) => {
    expect(parseBggId(text)).toBe(id);
  });

  it.each([
    '',
    '0',
    '-5',
    '12.5',
    '1e3',
    '2147483648',
    '99999999999999999999',
    'container',
    'https://boardgamegeek.com/boardgameversion/772438/english-edition',
    'https://boardgamegeek.com/geeklist/123',
    'https://example.com/boardgame/453740',
    'https://boardgamegeek.com.evil.example/boardgame/453740',
    'https://boardgamegeek.com/boardgame/',
  ])('refuses %j', (text) => {
    expect(parseBggId(text)).toBeNull();
  });

  it('refuses anything that is not text', () => {
    for (const v of [undefined, null, 453740, {}, [], true]) expect(parseBggId(v)).toBeNull();
  });
});

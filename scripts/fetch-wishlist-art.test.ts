// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEntries, renderMap, run } from './fetch-wishlist-art.ts';

type Fetch = typeof fetch;

// Entries as Prettier lays them out (wishlist.ts's shape), the fields in any
// order; an award's name is not the entry's.
const WISHLIST = `const ENTRIES: WishlistItem[] = [
  {
    id: 'lost-cities',
    bgg: 50,
    name: 'Lost Cities',
    players: '2',
    awards: [{ name: "As d'Or", year: 2009 }],
  },
  {
    id: 'azul',
    name: 'Azul',
    players: '2–4',
    bgg: 230802,
  },
  {
    id: 'no-id',
    name: 'No Id',
  },
  {
    id: 'wingspan',
    bgg: 266192,
  },
];
`;

const ITEM = (bgg: number) => `https://api.geekdo.com/api/geekitems?objectid=${bgg}&objecttype=thing&nosession=1`;
const item = (fields: Record<string, unknown>) => new Response(JSON.stringify({ item: fields }));
const image = (bytes: string) => new Response(bytes);

/** A fetch answering each URL from `answers`, failing a test that asks for any other. */
function fakeFetch(answers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<Fetch>((input) => {
    const answer = answers[String(input)];
    if (!answer) throw new Error(`unexpected fetch of ${String(input)}`);
    return Promise.resolve(answer());
  });
}

const pause = () => Promise.resolve();

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('readEntries', () => {
  it('reads each entry with a bgg id, its fields in any order, naming it by its id where it has no name', () => {
    expect(readEntries(WISHLIST)).toEqual([
      { id: 'lost-cities', bgg: 50, name: 'Lost Cities' },
      { id: 'azul', bgg: 230802, name: 'Azul' },
      { id: 'wingspan', bgg: 266192, name: 'wingspan' },
    ]);
    expect(console.warn).toHaveBeenCalledWith('no-id has no bgg id in src/data/wishlist.ts; add one to fetch its art');
  });

  it('reads a string in double quotes, as Prettier writes one holding an apostrophe', () => {
    expect(readEntries(`[\n  {\n    id: "tzolkin",\n    bgg: 126163,\n    name: "Tzolk'in",\n  },\n]`)).toEqual([
      { id: 'tzolkin', bgg: 126163, name: "Tzolk'in" },
    ]);
  });

  it('reads every entry in wishlist.ts as it stands', () => {
    const source = readFileSync('src/data/wishlist.ts', 'utf8');
    const entries = readEntries(source);
    expect(entries).toHaveLength(source.match(/^ {4}id: /gm)?.length ?? 0);
    expect(entries).toContainEqual({ id: 'lost-cities', bgg: 50, name: 'Lost Cities' });
  });

  it('refuses a source with no entries', () => {
    expect(() => readEntries('const ENTRIES = [];')).toThrow('no wishlist entries found in src/data/wishlist.ts');
  });
});

describe('renderMap', () => {
  it('lists each file by id, in order', () => {
    expect(renderMap({ b: '/images/wishlist/b.png', a: '/images/wishlist/a.jpg' })).toContain(
      "export const WISHLIST_ART: Record<string, string> = {\n  'a': '/images/wishlist/a.jpg',\n  'b': '/images/wishlist/b.png',\n};\n",
    );
  });
});

describe('run', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wishlist-art-'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    writeFileSync(join(dir, 'src/data/wishlist.ts'), WISHLIST);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const art = (file: string) => join(dir, 'public/images/wishlist', file);
  const files = () => readdirSync(join(dir, 'public/images/wishlist')).sort();
  const map = () => readFileSync(join(dir, 'src/data/wishlistArt.ts'), 'utf8');
  const putArt = (file: string, bytes = 'old') => {
    mkdirSync(join(dir, 'public/images/wishlist'), { recursive: true });
    writeFileSync(art(file), bytes);
  };

  it("downloads each entry's square crop, else its image, typed by the URL's extension, and maps them", async () => {
    const wait = vi.fn(pause);
    const fetch = fakeFetch({
      [ITEM(50)]: () => item({ name: 'Lost Cities', images: { square200: 'https://cf.geekdo.com/lc.png?x=1' } }),
      [ITEM(230802)]: () => item({ imageurl: 'https://cf.geekdo.com/azul.jpeg' }),
      [ITEM(266192)]: () => item({ images: { square200: 'https://cf.geekdo.com/w.WEBP' } }),
      'https://cf.geekdo.com/lc.png?x=1': () => image('png bytes'),
      'https://cf.geekdo.com/azul.jpeg': () => image('jpg bytes'),
      'https://cf.geekdo.com/w.WEBP': () => image('webp bytes'),
    });
    await run(false, { dir, fetch, pause: wait });
    expect(files()).toEqual(['azul.jpg', 'lost-cities.png', 'wingspan.webp']);
    expect(readFileSync(art('lost-cities.png'), 'utf8')).toBe('png bytes');
    expect(map()).toContain(
      "  'azul': '/images/wishlist/azul.jpg',\n  'lost-cities': '/images/wishlist/lost-cities.png',\n  'wingspan': '/images/wishlist/wingspan.webp',\n",
    );
    expect(wait).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenCalledWith('Lost Cities (BGG "Lost Cities"): /images/wishlist/lost-cities.png');
    expect(console.log).toHaveBeenLastCalledWith('3 of 3 entries have art.');
  });

  it('skips an entry that already has art, unless refreshing', async () => {
    putArt('lost-cities.jpg');
    putArt('azul.png');
    putArt('wingspan.webp');
    putArt('dropped.jpg');
    const fetch = fakeFetch({});
    await run(false, { dir, fetch, pause });
    expect(fetch).not.toHaveBeenCalled();
    // Only entries still in the wishlist are mapped.
    expect(map()).not.toContain('dropped');
    expect(console.log).toHaveBeenLastCalledWith('3 of 3 entries have art.');
  });

  it('replaces the art on a refresh, removing a file in the old format', async () => {
    putArt('lost-cities.jpg');
    putArt('azul.png');
    const fetch = fakeFetch({
      [ITEM(50)]: () => item({ imageurl: 'https://cf.geekdo.com/lc.png' }),
      [ITEM(230802)]: () => item({ imageurl: 'https://cf.geekdo.com/azul.png' }),
      [ITEM(266192)]: () => new Response('', { status: 404 }),
      'https://cf.geekdo.com/lc.png': () => image('new lc'),
      'https://cf.geekdo.com/azul.png': () => image('new azul'),
    });
    await run(true, { dir, fetch, pause });
    expect(files()).toEqual(['azul.png', 'lost-cities.png']);
    expect(readFileSync(art('azul.png'), 'utf8')).toBe('new azul');
    expect(map()).toContain("'lost-cities': '/images/wishlist/lost-cities.png'");
  });

  it('goes on past an entry BGG has no art for', async () => {
    const fetch = fakeFetch({
      [ITEM(50)]: () => new Response('', { status: 500 }),
      [ITEM(230802)]: () => new Response('<html>'),
      [ITEM(266192)]: () => item({ images: {} }),
    });
    await run(false, { dir, fetch, pause });
    expect(files()).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('no art for Lost Cities: BoardGameGeek answered 500 for item 50');
    expect(console.warn).toHaveBeenCalledWith('no art for Azul: item 230802 did not answer with JSON');
    expect(console.warn).toHaveBeenCalledWith('no art for wingspan: item 266192 has no image');
    expect(console.log).toHaveBeenLastCalledWith('0 of 3 entries have art.');
  });

  it('goes on past art that does not download', async () => {
    const fetch = fakeFetch({
      [ITEM(50)]: () => item({ imageurl: 'https://cf.geekdo.com/lc.jpg' }),
      [ITEM(230802)]: () => item({ imageurl: 'https://cf.geekdo.com/azul.jpg' }),
      [ITEM(266192)]: () => item({}),
      'https://cf.geekdo.com/lc.jpg': () => new Response('', { status: 404 }),
      'https://cf.geekdo.com/azul.jpg': () => image('azul'),
    });
    await run(false, { dir, fetch, pause });
    expect(files()).toEqual(['azul.jpg']);
    expect(console.warn).toHaveBeenCalledWith('could not download art for Lost Cities: 404');
  });

  it('stops at a rate limit on the item, still writing the map of what is on disk', async () => {
    putArt('azul.jpg');
    const fetch = fakeFetch({ [ITEM(50)]: () => new Response('', { status: 429 }) });
    await run(false, { dir, fetch, pause });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(map()).toContain("  'azul': '/images/wishlist/azul.jpg',\n};");
    expect(console.error).toHaveBeenCalledWith(
      'BoardGameGeek is rate limiting (429) at Lost Cities; keeping what was fetched, re-run later for the rest.',
    );
    expect(console.log).toHaveBeenLastCalledWith('1 of 3 entries have art.');
  });

  it('stops when the image host stalls', async () => {
    const fetch = fakeFetch({
      [ITEM(50)]: () => item({ imageurl: 'https://cf.geekdo.com/lc.jpg' }),
      'https://cf.geekdo.com/lc.jpg': () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    });
    await run(false, { dir, fetch, pause });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dir, 'src/data/wishlistArt.ts'))).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      'BoardGameGeek stopped answering at Lost Cities; keeping what was fetched, re-run later for the rest.',
    );
  });

  it('fails on any other network error', async () => {
    const fetch = vi.fn<Fetch>(() => Promise.reject(new TypeError('fetch failed')));
    await expect(run(false, { dir, fetch, pause })).rejects.toThrow('fetch failed');
  });
});

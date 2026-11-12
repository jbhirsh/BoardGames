// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findMagick, readGames, readWishlist, run, withArt, type Exec } from './fetch-box-art.ts';

type Fetch = typeof fetch;

// Games as Prettier lays them out (games.ts's shape). The slugs are COVERS'
// own, but for the two that are not in it; an award's name is not a game's.
const GAMES = `const ENTRIES: GameEntry[] = [
  {
    name: 'Catan',
    slug: 'catan',
    players: '3–4',
    bgg: 13,
    awards: [{ name: "As d'Or", year: 1996 }],
    subgames: [
      {
        name: 'Seafarers',
        slug: 'seafarers',
        kind: 'expansion',
        bgg: 325,
      },
    ],
  },
  {
    name: 'Azul',
    slug: 'azul',
    bgg: 230802,
  },
  {
    name: '7 Wonders',
    slug: '7-wonders',
    img: '/images/7w.webp',
    bgg: 68448,
  },
  {
    name: 'Exploding Kittens',
    slug: 'exploding-kittens',
    bgg: 172225,
  },
  {
    name: 'DCC RPG',
    slug: 'dungeon-crawler-carl-rpg-starter-set',
    players: '1–4',
  },
  {
    name: 'Analyze Me',
    slug: 'analyze-me',
    bgg: 1,
  },
  {
    name: 'Mystery',
    slug: 'mystery',
    bgg: 999,
  },
  {
    name: 'Homemade',
    slug: 'homemade',
    players: '2',
  },
];
`;

// The seed's written wishlist entries (data/seed.json's shape), with the
// rest of the file, which the script must keep. Lost Cities is in COVERS.
const WISHLIST = `${JSON.stringify(
  {
    '//': 'kept as it is',
    wishlist: [
      { id: 'lost-cities', name: 'Lost Cities', bggId: 50, players: '2', image: '/images/wishlist/lost-cities.jpg' },
      { id: 'no-id', name: 'No Id' },
      { id: 'unnamed', name: 'Unnamed', bggId: 7 },
    ],
    awards: [{ bggId: 50, name: "As d'Or", year: 2009 }],
  },
  null,
  2,
)}\n`;

/** The seed's entries' art, as the run left it in `dir`. */
const seedArt = (dir: string) =>
  (
    JSON.parse(readFileSync(join(dir, 'data/seed.json'), 'utf8')) as { wishlist: Array<{ id: string; image?: string }> }
  ).wishlist.flatMap(({ id, image }) => (image ? [[id, image]] : []));

const ITEM = (bgg: number) => `https://api.geekdo.com/api/geekitems?objectid=${bgg}&objecttype=thing&nosession=1`;
const IMAGE = (id: number) => `https://api.geekdo.com/api/images/${id}`;
const json = (body: unknown) => new Response(JSON.stringify(body));
const sizes = (url: string) => json({ images: { large: { url } } });
const status = (code: number) => new Response('', { status: code });

/** A fetch answering each URL from `answers`, failing a test that asks for any other. */
function fakeFetch(answers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<Fetch>((input) => {
    const answer = answers[String(input)];
    if (!answer) throw new Error(`unexpected fetch of ${String(input)}`);
    return Promise.resolve(answer());
  });
}

/**
 * ImageMagick as `magick`, answering the size of a download and of a trimmed
 * cover, and the colour along an edge; every other call (a write) prints
 * nothing, and a cover's write leaves a file. The downloads it is asked
 * about are kept, to check them.
 */
function fakeMagick(raw: string, trimmed = '0 0') {
  const downloads: { path: string; bytes: string }[] = [];
  const exec = vi.fn<Exec>((cmd, args) => {
    if (cmd !== 'magick') throw new Error(`${cmd}: not found`);
    if (args.includes('%[pixel:p{0,0}]')) return `srgb(${args.includes('north') ? '1,1,1' : '2,2,2'})`;
    if (args.at(-1)?.endsWith('.webp')) writeFileSync(args.at(-1)!, 'webp');
    if (args.at(-1) !== 'info:') return '';
    if (args[0].endsWith('.png')) return trimmed;
    const path = args[0].replace(/\[0\]$/, '');
    downloads.push({ path, bytes: readFileSync(path, 'utf8') });
    return raw;
  });
  return { exec, downloads, writes: () => exec.mock.calls.filter(([, args]) => args.at(-1)?.endsWith('.webp')) };
}

const pause = () => Promise.resolve();

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('readGames', () => {
  it("reads each game with its own id, not its subgames', and its art's path", () => {
    const games = readGames(GAMES);
    expect(games.map((g) => g.slug)).not.toContain('seafarers');
    expect(games[0]).toEqual({ name: 'Catan', slug: 'catan', img: '/images/catan.webp', bgg: 13 });
    expect(games[2]).toEqual({ name: '7 Wonders', slug: '7-wonders', img: '/images/7w.webp', bgg: 68448 });
    expect(games[4].bgg).toBeUndefined();
  });

  it('reads a string in double quotes, as Prettier writes one holding an apostrophe', () => {
    expect(readGames(`[\n  {\n    name: "Tzolk'in",\n    slug: "tzolkin",\n    bgg: 126163,\n  },\n]`)).toEqual([
      { name: "Tzolk'in", slug: 'tzolkin', img: '/images/tzolkin.webp', bgg: 126163 },
    ]);
  });

  it('reads every game in games.ts as it stands', () => {
    const source = readFileSync('src/data/games.ts', 'utf8');
    const games = readGames(source);
    // Each game opens a literal at the list's own indent.
    expect(games).toHaveLength(source.match(/^ {2}\{$/gm)?.length ?? 0);
    expect(games).toContainEqual({
      name: 'One Night Werewolf',
      slug: 'one-night-werewolf',
      img: '/images/one-night-werewolf.webp',
      bgg: 147949,
    });
  });

  it('refuses a source with no games', () => {
    expect(() => readGames('export const GAMES = [];')).toThrow('no games found in src/data/games.ts');
  });
});

describe('readWishlist', () => {
  it('reads each entry by its id and name, its art a webp named by its id', () => {
    expect(readWishlist(WISHLIST)).toEqual([
      { name: 'Lost Cities', slug: 'lost-cities', img: '/images/wishlist/lost-cities.webp', bgg: 50 },
      { name: 'No Id', slug: 'no-id', img: '/images/wishlist/no-id.webp', bgg: undefined },
      { name: 'Unnamed', slug: 'unnamed', img: '/images/wishlist/unnamed.webp', bgg: 7 },
    ]);
  });

  it('reads every entry in data/seed.json as it stands, each with its id', () => {
    const seed = readFileSync('data/seed.json', 'utf8');
    const entries = readWishlist(seed);
    expect(entries).toHaveLength((JSON.parse(seed) as { wishlist: unknown[] }).wishlist.length);
    expect(entries.every((e) => e.bgg)).toBe(true);
    expect(entries).toContainEqual({
      name: 'Cascadia',
      slug: 'cascadia',
      img: '/images/wishlist/cascadia.webp',
      bgg: 295947,
    });
  });

  it('refuses a seed with no entries', () => {
    expect(() => readWishlist('{"wishlist": []}')).toThrow('no wishlist entries found in data/seed.json');
  });
});

describe('withArt', () => {
  it("sets each entry's art to its file on disk, drops it where there is none, and keeps the rest of the seed", () => {
    const out = withArt(WISHLIST, { 'no-id': '/images/wishlist/no-id.webp' });
    const parsed = JSON.parse(out) as Record<string, unknown> & { wishlist: Array<Record<string, unknown>> };
    expect(parsed.wishlist).toEqual([
      { id: 'lost-cities', name: 'Lost Cities', bggId: 50, players: '2' },
      { id: 'no-id', name: 'No Id', image: '/images/wishlist/no-id.webp' },
      { id: 'unnamed', name: 'Unnamed', bggId: 7 },
    ]);
    expect(parsed['//']).toBe('kept as it is');
    expect(parsed.awards).toEqual([{ bggId: 50, name: "As d'Or", year: 2009 }]);
    expect(out.endsWith('}\n')).toBe(true);
  });

  it("names each written entry's art as it is on disk", () => {
    const seed = readFileSync('data/seed.json', 'utf8');
    const have = Object.fromEntries(
      readWishlist(seed).flatMap(({ slug }) =>
        ['webp', 'jpg', 'png']
          .map((ext) => `/images/wishlist/${slug}.${ext}`)
          .filter((path) => existsSync(join('public', path)))
          .slice(0, 1)
          .map((path) => [slug, path]),
      ),
    );
    expect(JSON.parse(withArt(seed, have))).toEqual(JSON.parse(seed));
  });
});

describe('findMagick', () => {
  it('prefers `magick`, then falls back to `convert`', () => {
    expect(findMagick(() => '')).toBe('magick');
    const exec = vi.fn<Exec>((cmd) => {
      if (cmd === 'magick') throw new Error('not found');
      return '';
    });
    expect(findMagick(exec)).toBe('convert');
    expect(exec).toHaveBeenCalledWith('convert', ['-version'], { stdio: 'ignore' });
  });

  it('fails when neither is on the PATH', () => {
    expect(() =>
      findMagick(() => {
        throw new Error('not found');
      }),
    ).toThrow('ImageMagick is needed: neither `magick` nor `convert` is on the PATH');
  });
});

describe('run', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'box-art-test-'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'src/data/games.ts'), GAMES);
    writeFileSync(join(dir, 'data/seed.json'), WISHLIST);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses a name neither list has, before fetching anything', async () => {
    const fetch = fakeFetch({});
    await expect(
      run(['catan', 'lost-cities', 'nope', 'seafarers'], { dir, fetch, exec: () => '', pause }),
    ).rejects.toThrow('not in src/data/games.ts or data/seed.json: nope, seafarers');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cuts a pinned cover's centred square, downloading it once, and pauses after each request", async () => {
    const wait = vi.fn(pause);
    const fetch = fakeFetch({
      [IMAGE(9156909)]: () => sizes('https://cf.geekdo.com/catan.jpg'),
      'https://cf.geekdo.com/catan.jpg': () => new Response('catan bytes'),
    });
    const magick = fakeMagick('1000 800');
    expect(await run(['catan'], { dir, fetch, exec: magick.exec, pause: wait })).toBe(1);
    expect(magick.downloads.map((d) => d.bytes)).toEqual(['catan bytes']);
    const out = join(dir, 'public/images/catan.webp');
    expect(magick.writes()).toEqual([
      [
        'magick',
        [
          `${magick.downloads[0].path}[0]`,
          '-auto-orient',
          '-colorspace',
          'sRGB',
          '-crop',
          '1000x800+0+0',
          '+repage',
          '-crop',
          '800x800+100+0',
          '+repage',
          '-resize',
          '400x400!',
          '-strip',
          '-quality',
          '82',
          '-define',
          'webp:method=6',
          out,
        ],
      ],
    ]);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.headers).toEqual({
      'User-Agent': 'TheGameRoom-art-script (personal collection site)',
    });
    expect(console.log).toHaveBeenCalledWith(`Catan: image 9156909 (1000x800) -> ${out}`);
    expect(console.log).toHaveBeenLastCalledWith('1 cover written.');
    // The downloads' folder is gone.
    expect(existsSync(magick.downloads[0].path)).toBe(false);
  });

  it("keeps a tall cover's top, and cuts a pinned box first, falling back to the original size", async () => {
    const fetch = fakeFetch({
      [IMAGE(6973671)]: () => sizes('https://cf.geekdo.com/azul.jpg'),
      'https://cf.geekdo.com/azul.jpg': () => new Response('azul'),
      [IMAGE(7416519)]: () => json({ images: { original: { url: 'https://cf.geekdo.com/7w.png' } } }),
      'https://cf.geekdo.com/7w.png': () => new Response('7w'),
    });
    const magick = fakeMagick('600 1000');
    expect(await run(['azul', '7-wonders'], { dir, fetch, exec: magick.exec, pause })).toBe(2);
    const [azul, wonders] = magick.writes().map(([, args]) => args);
    // 0.2 of the way down a 400 px overhang.
    expect(azul.slice(5, 9)).toEqual(['600x1000+0+0', '+repage', '-crop', '600x600+0+80']);
    // box [0.036, 0.032, 0.928, 0.936] of 600x1000.
    expect(wonders.slice(5, 9)).toEqual(['557x936+22+32', '+repage', '-crop', '557x557+0+76']);
    expect(wonders.at(-1)).toBe(join(dir, 'public/images/7w.webp'));
    expect(console.log).toHaveBeenLastCalledWith('2 covers written.');
  });

  it("fits a wide cover on bands of its edges' colours", async () => {
    const fetch = fakeFetch({
      [IMAGE(2691976)]: () => sizes('https://cf.geekdo.com/ek.jpg'),
      'https://cf.geekdo.com/ek.jpg': () => new Response('ek'),
    });
    const magick = fakeMagick('1200 700', '800 400');
    await run(['exploding-kittens'], { dir, fetch, exec: magick.exec, pause });
    const edges = magick.exec.mock.calls.filter(([, args]) => args.includes('%[pixel:p{0,0}]'));
    // A 3 px strip 2% of the height in from each edge.
    expect(edges.map(([, args]) => args.slice(1, 5))).toEqual([
      ['-gravity', 'north', '-crop', '800x3+0+8'],
      ['-gravity', 'south', '-crop', '800x3+0+8'],
    ]);
    const [[, compose]] = magick.writes();
    expect(compose.slice(0, 7)).toEqual([
      '-size',
      '400x200',
      'xc:srgb(1,1,1)',
      '-size',
      '400x200',
      'xc:srgb(2,2,2)',
      '-append',
    ]);
  });

  it('fits a tall cover beside bands of its pinned colour', async () => {
    const fetch = fakeFetch({
      [IMAGE(9629120)]: () => sizes('https://cf.geekdo.com/dcc.jpg'),
      'https://cf.geekdo.com/dcc.jpg': () => new Response('dcc'),
    });
    const magick = fakeMagick('1000 1000', '300 600');
    await run(['dungeon-crawler-carl-rpg-starter-set'], { dir, fetch, exec: magick.exec, pause });
    expect(magick.exec.mock.calls.some(([, args]) => args.includes('%[pixel:p{0,0}]'))).toBe(false);
    // The box [0, 0, 0.775, 1] is cut before the trim.
    const trim = magick.exec.mock.calls.find(([, args]) => args.includes('-trim'));
    expect(trim?.[1].slice(5, 7)).toEqual(['775x1000+0+0', '+repage']);
    const [[, compose]] = magick.writes();
    expect(compose.slice(0, 7)).toEqual([
      '-size',
      '200x400',
      'xc:#ffffff',
      '-size',
      '200x400',
      'xc:#ffffff',
      '+append',
    ]);
  });

  it('leaves a kept cover, and one with neither a pin nor an id, as they are', async () => {
    const fetch = fakeFetch({});
    const magick = fakeMagick('0 0');
    expect(await run(['analyze-me', 'homemade'], { dir, fetch, exec: magick.exec, pause })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(magick.writes()).toEqual([]);
    expect(console.log).toHaveBeenCalledWith(
      "Analyze Me: keeping /images/analyze-me.webp (BGG only has the 2011 tin; this edition's box front, flattened from a product photo)",
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Homemade: no bgg id and no entry in COVERS; keeping /images/homemade.webp',
    );
    expect(console.log).toHaveBeenLastCalledWith('0 covers written.');
  });

  it("falls back to an unpinned game's main image, asking for it to be pinned", async () => {
    const fetch = fakeFetch({
      [ITEM(999)]: () => json({ item: { imageid: '4242' } }),
      [IMAGE(4242)]: () => sizes('https://cf.geekdo.com/m.jpg'),
      'https://cf.geekdo.com/m.jpg': () => new Response('m'),
    });
    const magick = fakeMagick('500 500');
    expect(await run(['mystery'], { dir, fetch, exec: magick.exec, pause })).toBe(1);
    expect(console.warn).toHaveBeenCalledWith(
      'Mystery: not in COVERS, using its main image 4242; check it is a flat front cover and pin it',
    );
  });

  it('keeps the art on disk where BGG has no image for it', async () => {
    const magick = fakeMagick('500 500');
    const cases: [Record<string, () => Response>, string][] = [
      [
        { [ITEM(999)]: () => json({ item: {} }) },
        'Mystery: item 999 has no main image (200); keeping /images/mystery.webp',
      ],
      [
        { [ITEM(999)]: () => new Response('<html>a challenge page</html>') },
        'Mystery: item 999 has no main image (200); keeping /images/mystery.webp',
      ],
      [{ [ITEM(999)]: () => status(404) }, 'Mystery: item 999 has no main image (404); keeping /images/mystery.webp'],
      [
        { [ITEM(999)]: () => json({ item: { imageid: '1' } }), [IMAGE(1)]: () => status(500) },
        'Mystery: image 1 answered 500; keeping /images/mystery.webp',
      ],
      [
        { [ITEM(999)]: () => json({ item: { imageid: '1' } }), [IMAGE(1)]: () => json({ images: {} }) },
        'Mystery: image 1 has no download; keeping /images/mystery.webp',
      ],
      [
        {
          [ITEM(999)]: () => json({ item: { imageid: '1' } }),
          [IMAGE(1)]: () => sizes('https://cf.geekdo.com/1.jpg'),
          'https://cf.geekdo.com/1.jpg': () => status(404),
        },
        'Mystery: download of image 1 answered 404; keeping /images/mystery.webp',
      ],
    ];
    for (const [answers, warning] of cases) {
      expect(await run(['mystery'], { dir, fetch: fakeFetch(answers), exec: magick.exec, pause })).toBe(0);
      expect(console.warn).toHaveBeenLastCalledWith(warning);
    }
    expect(magick.writes()).toEqual([]);
  });

  it('stops at a rate limit or a challenge page, keeping what it wrote', async () => {
    for (const code of [429, 403]) {
      const fetch = fakeFetch({
        [IMAGE(9156909)]: () => sizes('https://cf.geekdo.com/catan.jpg'),
        'https://cf.geekdo.com/catan.jpg': () => new Response('catan'),
        [IMAGE(6973671)]: () => status(code),
      });
      expect(await run(['catan', 'azul', '7-wonders'], { dir, fetch, exec: fakeMagick('10 10').exec, pause })).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(console.error).toHaveBeenLastCalledWith(
        `BoardGameGeek answered ${code} for ${IMAGE(6973671)}; stopping, re-run later for the rest.`,
      );
      expect(console.log).toHaveBeenLastCalledWith('1 cover written.');
    }
  });

  it('stops when BGG stalls, before answering or partway through its answer', async () => {
    const fetch = vi.fn<Fetch>(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    expect(await run(['catan'], { dir, fetch, exec: fakeMagick('10 10').exec, pause })).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      `BoardGameGeek stopped answering for ${IMAGE(9156909)}; stopping, re-run later for the rest.`,
    );
    const stalled = new Response(
      new ReadableStream({ start: (c) => c.error(new DOMException('timed out', 'TimeoutError')) }),
    );
    const partway = fakeFetch({
      [IMAGE(9156909)]: () => sizes('https://cf.geekdo.com/catan.jpg'),
      'https://cf.geekdo.com/catan.jpg': () => stalled,
    });
    expect(await run(['catan'], { dir, fetch: partway, exec: fakeMagick('10 10').exec, pause })).toBe(0);
    expect(console.error).toHaveBeenLastCalledWith(
      'BoardGameGeek stopped answering for https://cf.geekdo.com/catan.jpg; stopping, re-run later for the rest.',
    );
  });

  it('fails on any other error, still clearing its downloads and writing the art into the seed', async () => {
    const fetch = fakeFetch({
      [IMAGE(9156909)]: () => sizes('https://cf.geekdo.com/catan.jpg'),
      'https://cf.geekdo.com/catan.jpg': () => new Response('catan'),
      [IMAGE(6973671)]: () => Promise.reject(new TypeError('fetch failed')),
    });
    const magick = fakeMagick('10 10');
    const art = join(dir, 'public/images/wishlist');
    mkdirSync(art, { recursive: true });
    writeFileSync(join(art, 'lost-cities.webp'), 'webp');
    await expect(run(['catan', 'azul'], { dir, fetch, exec: magick.exec, pause })).rejects.toThrow('fetch failed');
    expect(existsSync(magick.downloads[0].path)).toBe(false);
    // The seed still names what is on disk.
    expect(seedArt(dir)).toEqual([['lost-cities', '/images/wishlist/lost-cities.webp']]);
  });

  it("writes a wishlist entry's cover as webp, drops its file in an old format, and names what is on disk in the seed", async () => {
    const art = join(dir, 'public/images/wishlist');
    mkdirSync(art, { recursive: true });
    writeFileSync(join(art, 'lost-cities.jpg'), 'old');
    writeFileSync(join(art, 'unnamed.png'), 'kept');
    writeFileSync(join(art, 'stray.jpg'), 'not an entry');
    const fetch = fakeFetch({
      [IMAGE(4597095)]: () => sizes('https://cf.geekdo.com/lc.jpg'),
      'https://cf.geekdo.com/lc.jpg': () => new Response('lc'),
    });
    const magick = fakeMagick('1000 1000');
    expect(await run(['lost-cities'], { dir, fetch, exec: magick.exec, pause })).toBe(1);
    expect(magick.writes()[0][1].at(-1)).toBe(join(art, 'lost-cities.webp'));
    expect(readdirSync(art).sort()).toEqual(['lost-cities.webp', 'stray.jpg', 'unnamed.png']);
    expect(seedArt(dir)).toEqual([
      ['lost-cities', '/images/wishlist/lost-cities.webp'],
      ['unnamed', '/images/wishlist/unnamed.png'],
    ]);
  });

  it('still names what is on disk when a run stops, making the folder where there is none', async () => {
    const fetch = vi.fn<Fetch>(() => Promise.resolve(status(429)));
    expect(await run(['lost-cities'], { dir, fetch, exec: fakeMagick('10 10').exec, pause })).toBe(0);
    expect(seedArt(dir)).toEqual([]);
  });

  it('goes through every game when given none', async () => {
    const fetch = vi.fn<Fetch>(() => Promise.resolve(status(429)));
    await run([], { dir, fetch, exec: fakeMagick('10 10').exec, pause });
    // Catan is first, and stops the run.
    expect(fetch).toHaveBeenCalledWith(IMAGE(9156909), expect.anything());
  });
});

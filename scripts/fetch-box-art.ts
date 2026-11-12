// Fetch the box art of the collection and of the wishlist from
// BoardGameGeek: each game's flat front cover, cropped to fill a square, so
// every tile on either list is the same kind of picture. A game's goes to
// public/images/<slug>.webp (the `img` games.ts gives it); a wishlist
// entry's to public/images/wishlist/<id>.webp, and the id -> path map in
// src/data/wishlistArt.ts that wishlist.ts merges in is rebuilt from what is
// on disk there.
//
//   npm run box-art                      every game and wishlist entry
//   npm run box-art -- catan ark-nova    just these (a game's slug or an entry's id)
//
// Needs ImageMagick (`magick`, or `convert` from version 6) on the PATH.
// It goes by id through the site's own endpoints, which need no token: an
// image's sizes come from its id, and a game's main image from the game's
// id (`bgg`). The main image is usually the front cover scan, but not
// always, so COVERS below pins the image chosen for each game, picked by eye
// from the item's gallery (its BoxFront tag lists the candidates), with how
// to frame it: a square cut from it, or, where no square keeps the whole
// title, the whole cover on bands of its own colour. A game missing from
// COVERS falls back to its main image; a game marked `keep` is left as it is
// on disk. COVERS is keyed by slug and id alike, so a wished-for game that
// joins the collection under the same slug keeps its pick.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WISHLIST_ART_DIR } from '../src/utils/precache.ts';

const SIZE = 400;
const MAP_FILE = 'src/data/wishlistArt.ts';
const ART = `/${WISHLIST_ART_DIR}/`;
const QUALITY = '82';
const UA = 'TheGameRoom-art-script (personal collection site)';
const ITEM_URL = (bgg: number) => `https://api.geekdo.com/api/geekitems?objectid=${bgg}&objecttype=thing&nosession=1`;
const IMAGE_URL = (id: number) => `https://api.geekdo.com/api/images/${id}`;

interface Cover {
  /** The BoardGameGeek image id (the number in its pic<id> file name). */
  image: number;
  /** Cut to this box first: left, top, width, height as fractions of the image. */
  box?: [number, number, number, number];
  /**
   * Where the square sits along the longer side, from 0 (top or left) to 1
   * (bottom or right). Defaults to the centre, or 0.2 on a tall cover so a
   * title along the top survives.
   */
  focus?: number;
  /**
   * Show the whole cover instead, trimmed of white margins and centred in the
   * square, the bands either side filled with the colour along that edge
   * (or `pad`, where the edge is striped or shaded).
   */
  fit?: boolean;
  pad?: string;
}
type Entry = Cover | { keep: string };

/**
 * A game in games.ts or an entry in wishlist.ts: its slug (an entry's id),
 * its box art's path and, where it has one, its BoardGameGeek id.
 */
export interface Game {
  name: string;
  slug: string;
  img: string;
  bgg: number | undefined;
}

/** Runs a command and returns what it printed: ImageMagick, here. */
export type Exec = (cmd: string, args: string[], options?: { stdio: 'ignore' }) => string;

/** What a run reaches outside itself: the folder it writes under, the network, ImageMagick and its pause. */
export interface Deps {
  dir?: string;
  fetch?: typeof fetch;
  exec?: Exec;
  pause?: () => Promise<unknown>;
}

const COVERS: Record<string, Entry> = {
  '7-wonders': { image: 7416519, box: [0.036, 0.032, 0.928, 0.936] }, // second edition, inside its printed frame
  '7-wonders-duel': { image: 2576399 },
  akropolis: { image: 6705097 },
  'analyze-me': { keep: "BGG only has the 2011 tin; this edition's box front, flattened from a product photo" },
  'ark-nova': { image: 6293412, focus: 0.9 }, // the title low
  'arkham-horror-remastered': { image: 9861848 },
  azul: { image: 6973671 },
  bananagrams: { image: 480795, box: [0.515, 0.13, 0.475, 0.85], focus: 0 }, // no box: the front of the pouch's tag
  'blood-on-the-clocktower': { image: 7009391, focus: 0.5 }, // the title low
  'bomb-busters': { image: 8303080 },
  'card-deck': { image: 1128756, box: [0.08, 0.025, 0.84, 0.93], focus: 0 }, // a generic deck: a Bicycle tuck box's front
  'cards-against-humanity': { image: 2909692, focus: 0 },
  'caroling-charades': { keep: "not on BoardGameGeek; the publisher's flat cover art" },
  cascadia: { image: 5100691 },
  catan: { image: 9156909 },
  'catan-seafarers': { image: 8828019 },
  codenames: { image: 8907965, focus: 0.1 },
  cranium: { keep: 'BGG lacks the 25th anniversary edition; its box front, flattened from a product photo' },
  decrypto: { image: 3759421, focus: 0 },
  dnup: { image: 9490614, focus: 0.5 }, // the title mid-cover
  dominion: { image: 3187001 },
  'dominion-prosperity': { image: 6849008 },
  'dominion-seaside': { image: 6654841 },
  'dungeon-crawler-carl-rpg-starter-set': { image: 9629120, box: [0, 0, 0.775, 1], fit: true, pad: '#ffffff' }, // an RPG, so no BGG game id: RPGGeek's box shot, cut to its front, kept whole
  'dungeon-crawler-carl-unstoppable': { image: 9745791, focus: 0 }, // a tall cover: keep the series title along the top
  everdell: { image: 3918905 },
  'exploding-kittens': { image: 2691976, fit: true }, // a wide box
  'exploding-kittens-board-game': { image: 9011140, fit: true }, // the English front (BGG's main image is a 3D box); its title runs edge to edge
  'far-out-questions': { keep: "not on BoardGameGeek; the publisher's flat cover art" },
  'flip-7': { image: 8780246 },
  'for-the-girls': { keep: 'BGG only has the German edition; the English box front, flattened from a product photo' },
  glyphics: { image: 8872676 },
  harmonies: { image: 8026369 },
  'herd-mentality': { image: 5509026, focus: 0 },
  'hogwarts-battle': { image: 3518231 },
  'just-one': { image: 8669313 },
  'lost-cities': { image: 4597095 },
  'love-letter': { image: 4766499, focus: 0.85 }, // sold in a clamshell: its front, around the title
  lovestruck: { image: 8308857, focus: 0 },
  'micromacro-crime-city': { image: 7632081 },
  mysterium: { image: 8625343 },
  nemesis: { image: 8211747 },
  'one-night-werewolf': { image: 8783294 },
  pandemic: { image: 1534148, focus: 0.3 }, // the heads up top, the title low
  'pandemic-legacy-season-1': { image: 2452831, focus: 0.2 }, // a wide box: the title sits left of centre
  'poetry-for-neanderthals': { image: 5702797, fit: true, pad: '#e3e2e7' }, // a wide box; its ground, not its shaded rim
  'quacks-of-quedlinburg': { image: 6137509 }, // the English edition the entry names, not 2025's Quacks
  risk: { image: 4916782, focus: 0 },
  seti: { image: 8160466 },
  'sky-team': { image: 7398904, focus: 0 },
  'sounds-fishy': { image: 6938099, focus: 0 },
  splendor: { image: 8234167, focus: 0 },
  'star-realms': { image: 1903816, focus: 0 },
  'survive-the-island': { image: 8337555 },
  suspicion: { image: 3109861, focus: 0.8 }, // the title badge sits at the right
  taboo: { image: 8361187, box: [0.012, 0.065, 0.976, 0.925] }, // below the lid's top edge
  'taco-goat-cheese-pizza': { image: 7192024, fit: true, pad: '#e2e05a' }, // the title runs top to bottom; the stripes' yellow
  'taco-vs-burrito': { image: 8691394, focus: 0 }, // the 5th anniversary edition
  'terraforming-mars': { image: 3536616 },
  'the-crew': { image: 5687013, focus: 0 },
  'the-mind': { image: 4155606, focus: 0 }, // English: BGG's main image is the German edition
  'these-cards-will-get-you-drunk': { keep: 'not on BoardGameGeek; its box front, flattened from a product photo' },
  'throw-throw-burrito': { image: 7073068, fit: true, pad: '#ebe8d4' }, // its cream ground, not its shaded rim
  'ticket-to-ride': { image: 8937637 },
  'truth-or-dare-tower': { keep: "not on BoardGameGeek; the publisher's flat cover art" },
  'two-rooms-and-a-boom': { image: 2335221 },
  uno: { image: 8204165, focus: 0 },
  wavelength: { image: 4552862 },
  wingspan: { image: 4458123 },
  wyrmspan: { image: 8894992 },
  'wyrmspan-dragon-academy': { image: 9079437, fit: true }, // a wide expansion box
  'zombie-burrito': { image: 8321601 },
};

/**
 * The games in games.ts's source.
 *
 * The games are data literals; read them straight off the source rather
 * than importing it (its path-less imports are Vite's, not Node's), each
 * string in either quote (Prettier's double quotes where it holds an
 * apostrophe). A game is a literal with a name and slug and no `kind`,
 * which only a game inside one has; its box art is /images/<slug>.webp
 * unless it names an `img` (as games.ts fills it in), and its own `bgg`
 * comes before any `subgames`, whose ids are theirs.
 */
export function readGames(source: string): Game[] {
  const starts = [...source.matchAll(/\{\s*name:\s*(['"])(.+?)\1,\s*slug:\s*(['"])(.+?)\3,(?!\s*kind:)/g)];
  const games = starts.map((m, i) => {
    const literal = source.slice(m.index, starts[i + 1]?.index ?? source.length).split('subgames:')[0];
    const bgg = /\bbgg:\s*(\d+)/.exec(literal)?.[1];
    const img = /\bimg:\s*(['"])(.+?)\1/.exec(literal)?.[2] ?? `/images/${m[4]}.webp`;
    return { name: m[2], slug: m[4], img, bgg: bgg ? Number(bgg) : undefined };
  });
  if (games.length === 0) throw new Error('no games found in src/data/games.ts');
  return games;
}

/**
 * The entries in wishlist.ts's source, each named by its id (`slug`), its
 * art at /images/wishlist/<id>.webp.
 *
 * The entries are data literals too. Each runs from its `id:` to the next
 * one, its own fields in any order at the list's indent (an award's name is
 * deeper); every entry has a name, and the id only stands in for a literal
 * the pattern could not read.
 */
export function readWishlist(source: string): Game[] {
  const starts = [...source.matchAll(/\{\s*id:\s*(['"])(.+?)\1/g)];
  const entries = starts.map((m, i) => {
    const literal = source.slice(m.index, starts[i + 1]?.index ?? source.length);
    const bgg = /\bbgg:\s*(\d+)/.exec(literal)?.[1];
    const name = /^ {4}name:\s*(['"])(.+?)\1/m.exec(literal)?.[2] ?? m[2];
    return { name, slug: m[2], img: `${ART}${m[2]}.webp`, bgg: bgg ? Number(bgg) : undefined };
  });
  if (entries.length === 0) throw new Error('no wishlist entries found in src/data/wishlist.ts');
  return entries;
}

/** The source of wishlistArt.ts: each entry's art file, by id. */
export function renderMap(have: Record<string, string>): string {
  const lines = Object.keys(have)
    .sort()
    .map((id) => `  '${id}': '${have[id]}',`)
    .join('\n');
  return `// Generated by \`npm run box-art\` (scripts/fetch-box-art.ts): the bundled
// box-art file for each compiled-in wishlist entry, by id. Entries missing
// here render without art. Do not edit by hand; re-run the script.
export const WISHLIST_ART: Record<string, string> = {
${lines}
};
`;
}

/** The ImageMagick command on the PATH: `magick`, or version 6's `convert`. */
export function findMagick(exec: Exec): string {
  for (const cmd of ['magick', 'convert']) {
    try {
      exec(cmd, ['-version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      // Try the next name.
    }
  }
  throw new Error('ImageMagick is needed: neither `magick` nor `convert` is on the PATH');
}

class Stop extends Error {}

/**
 * The command: writes the cover of each game and wishlist entry under `dir`
 * (of those in `only`, when it names any), then the wishlist's map of what
 * is on disk, and returns how many covers it wrote.
 */
export async function run(
  only: string[],
  {
    dir = '.',
    fetch: request = fetch,
    exec = (cmd, args, options) => execFileSync(cmd, args, { encoding: 'utf8', ...options }),
    // BGG asks clients to keep a gentle pace: one request at a time, spaced.
    pause = () => new Promise((resolve) => setTimeout(resolve, 1200)),
  }: Deps = {},
): Promise<number> {
  const games = [
    ...readGames(await readFile(join(dir, 'src/data/games.ts'), 'utf8')),
    ...readWishlist(await readFile(join(dir, 'src/data/wishlist.ts'), 'utf8')),
  ];
  const unknown = only.filter((slug) => !games.some((g) => g.slug === slug));
  if (unknown.length) throw new Error(`not in src/data/games.ts or wishlist.ts: ${unknown.join(', ')}`);

  const magick = findMagick(exec);

  const get = async (url: string) => {
    // A rate limit, a challenge page or a stall, before the answer or in its
    // body, ends the run; what was written stays.
    const stalled = (e: unknown): never => {
      if ((e as Error).name === 'TimeoutError')
        throw new Stop(`BoardGameGeek stopped answering for ${url}; stopping, re-run later for the rest.`);
      throw e;
    };
    const r = await request(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) }).catch(stalled);
    if (r.status === 429 || r.status === 403)
      throw new Stop(`BoardGameGeek answered ${r.status} for ${url}; stopping, re-run later for the rest.`);
    const body = Buffer.from(await r.arrayBuffer().catch(stalled));
    await pause();
    return { ok: r.ok, status: r.status, body };
  };
  // An answer's JSON, or nothing where it is not JSON (a page served in its place).
  const json = <T>({ body }: { body: Buffer }): T | undefined => {
    try {
      return JSON.parse(body.toString('utf8')) as T;
    } catch {
      return undefined;
    }
  };

  await mkdir(join(dir, `public${ART}`), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'box-art-'));
  let written = 0;
  try {
    for (const game of games) {
      if (only.length && !only.includes(game.slug)) continue;
      const entry = COVERS[game.slug];
      if (entry && 'keep' in entry) {
        console.log(`${game.name}: keeping ${game.img} (${entry.keep})`);
        continue;
      }
      let cover: Cover | undefined = entry;
      if (!cover) {
        if (!game.bgg) {
          console.warn(`${game.name}: no bgg id and no entry in COVERS; keeping ${game.img}`);
          continue;
        }
        const r = await get(ITEM_URL(game.bgg));
        const image = r.ok ? Number(json<{ item?: { imageid?: string } }>(r)?.item?.imageid) : NaN;
        if (!image) {
          console.warn(`${game.name}: item ${game.bgg} has no main image (${r.status}); keeping ${game.img}`);
          continue;
        }
        console.warn(
          `${game.name}: not in COVERS, using its main image ${image}; check it is a flat front cover and pin it`,
        );
        cover = { image };
      }
      const info = await get(IMAGE_URL(cover.image));
      if (!info.ok) {
        console.warn(`${game.name}: image ${cover.image} answered ${info.status}; keeping ${game.img}`);
        continue;
      }
      const sizes = json<{ images?: Record<string, { url?: string }> }>(info)?.images;
      // `large` fits in 1024 px without upscaling: plenty for a 400 px tile.
      const url = sizes?.large?.url ?? sizes?.original?.url;
      if (!url) {
        console.warn(`${game.name}: image ${cover.image} has no download; keeping ${game.img}`);
        continue;
      }
      const file = await get(url);
      if (!file.ok) {
        console.warn(`${game.name}: download of image ${cover.image} answered ${file.status}; keeping ${game.img}`);
        continue;
      }
      const raw = join(work, `${game.slug}.src`);
      await writeFile(raw, file.body);

      // Cut the box, then the largest square inside it at the focus, or fit
      // the whole box in the square.
      const [w, h] = exec(magick, [`${raw}[0]`, '-auto-orient', '-format', '%w %h', 'info:'])
        .split(' ')
        .map(Number);
      const [bl, bt, bw, bh] = cover.box ?? [0, 0, 1, 1];
      const box = { x: Math.round(bl * w), y: Math.round(bt * h), w: Math.round(bw * w), h: Math.round(bh * h) };
      const out = join(dir, `public${game.img}`);
      const load = [
        `${raw}[0]`,
        '-auto-orient',
        '-colorspace',
        'sRGB',
        '-crop',
        `${box.w}x${box.h}+${box.x}+${box.y}`,
        '+repage',
      ];
      const save = ['-strip', '-quality', QUALITY, '-define', 'webp:method=6', out];
      if (cover.fit) {
        const trimmed = join(work, `${game.slug}.png`);
        // A white border first makes the trim take off white margins only.
        exec(magick, [...load, '-bordercolor', 'white', '-border', '1', '-fuzz', '4%', '-trim', '+repage', trimmed]);
        const [tw, th] = exec(magick, [trimmed, '-format', '%w %h', 'info:']).split(' ').map(Number);
        const wide = tw >= th;
        // Each band takes the mean colour of a 3 px strip just inside its
        // edge, clear of a scan's outline or shadow.
        const inset = Math.round((wide ? th : tw) * 0.02);
        const edge = (gravity: string) =>
          cover.pad ??
          exec(magick, [
            trimmed,
            '-gravity',
            gravity,
            '-crop',
            wide ? `${tw}x3+0+${inset}` : `3x${th}+${inset}+0`,
            '+repage',
            '-scale',
            '1x1!',
            '-format',
            '%[pixel:p{0,0}]',
            'info:',
          ]);
        const half = wide ? `${SIZE}x${SIZE / 2}` : `${SIZE / 2}x${SIZE}`;
        exec(magick, [
          '-size',
          half,
          `xc:${edge(wide ? 'north' : 'west')}`,
          '-size',
          half,
          `xc:${edge(wide ? 'south' : 'east')}`,
          wide ? '-append' : '+append',
          '(',
          trimmed,
          '-resize',
          `${SIZE}x${SIZE}`,
          ')',
          '-gravity',
          'center',
          '-composite',
          ...save,
        ]);
      } else {
        const side = Math.min(box.w, box.h);
        const focus = cover.focus ?? (box.h > box.w * 1.15 ? 0.2 : 0.5);
        const x = Math.round((box.w - side) * focus);
        const y = Math.round((box.h - side) * focus);
        exec(magick, [
          ...load,
          '-crop',
          `${side}x${side}+${x}+${y}`,
          '+repage',
          '-resize',
          `${SIZE}x${SIZE}!`,
          ...save,
        ]);
      }
      // An entry fetched before the wishlist's art was webp has its old file.
      if (game.img.startsWith(ART))
        for (const ext of ['jpg', 'png']) await rm(join(dir, `public${ART}${game.slug}.${ext}`), { force: true });
      written++;
      console.log(`${game.name}: image ${cover.image} (${w}x${h}) -> ${out}`);
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(e.message);
  } finally {
    await rm(work, { recursive: true, force: true });
    // The map is rebuilt from the files, so a run cut short, by whatever,
    // still names only files that are there.
    const files = await readdir(join(dir, `public${ART}`));
    const have: Record<string, string> = {};
    for (const { slug } of games.filter((g) => g.img.startsWith(ART))) {
      const file = ['webp', 'jpg', 'png'].map((ext) => `${slug}.${ext}`).find((f) => files.includes(f));
      if (file) have[slug] = `${ART}${file}`;
    }
    await writeFile(join(dir, MAP_FILE), renderMap(have));
  }
  console.log(`${written} cover${written === 1 ? '' : 's'} written.`);
  return written;
}

if (import.meta.main) await run(process.argv.slice(2));

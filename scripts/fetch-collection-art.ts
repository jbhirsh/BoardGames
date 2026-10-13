// Fetch the collection's box art from BoardGameGeek: each game's flat front
// cover, cropped to fill a square and written to public/images/<slug>.webp
// (the `img` games.ts gives it), so every tile is the same kind of picture.
//
//   npm run collection-art              every game
//   npm run collection-art -- catan uno  just these
//
// Needs ImageMagick (`magick`, or `convert` from version 6) on the PATH.
// Like the wishlist's art (scripts/fetch-wishlist-art.ts) it goes by id
// through the site's own endpoints, which need no token: an image's sizes
// come from its id, and a game's main image from the game's id (`bgg`).
// The main image is usually the front cover scan, but not always, so
// COVERS below pins the image chosen for each game, picked by eye from the
// item's gallery, with how to frame it. A game missing from COVERS falls
// back to its main image; a game marked `keep` is left as it is on disk.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SIZE = 400;
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
}
type Entry = Cover | { keep: string };

const COVERS: Record<string, Entry> = {
  '7-wonders': { image: 7416519, box: [0.036, 0.032, 0.928, 0.936] }, // second edition, inside its printed frame
  'analyze-me': { keep: 'BGG only has the 2011 tin; this edition\'s box front, flattened from a product photo' },
  azul: { image: 6973671 },
  bananagrams: { image: 480795, box: [0.515, 0.13, 0.475, 0.85], focus: 0 }, // no box: the front of the pouch's tag
  'card-deck': { image: 1128756, box: [0.08, 0.055, 0.84, 0.9], focus: 0 }, // a generic deck: a Bicycle tuck box's front
  'cards-against-humanity': { image: 2909692, focus: 0 },
  'caroling-charades': { keep: 'not on BoardGameGeek; the publisher\'s flat cover art' },
  catan: { image: 9156909 },
  codenames: { image: 8907965, focus: 0.1 },
  cranium: { keep: 'BGG lacks the 25th anniversary edition; its box front, flattened from a product photo' },
  dominion: { image: 3187001 },
  'exploding-kittens': { image: 2691976, focus: 0 }, // a wide box: keep the start of the title
  'far-out-questions': { keep: 'not on BoardGameGeek; the publisher\'s flat cover art' },
  'for-the-girls': { keep: 'BGG only has the German edition; the English box front, flattened from a product photo' },
  'hogwarts-battle': { image: 3518231 },
  'love-letter': { image: 4766499, focus: 0.85 }, // sold in a clamshell: its front, around the title
  mysterium: { image: 8625343 },
  'one-night-werewolf': { image: 8783294 },
  pandemic: { image: 1534148, focus: 0.5 }, // the title sits low
  'poetry-for-neanderthals': { image: 5702797, focus: 0 }, // a wide box: keep the start of the title
  risk: { image: 4916782, focus: 0 },
  suspicion: { image: 3109861, focus: 0.8 }, // the title badge sits at the right
  taboo: { image: 8361187, box: [0.012, 0.065, 0.976, 0.925] }, // below the lid's top edge
  'taco-goat-cheese-pizza': { image: 7192024 },
  'taco-vs-burrito': { image: 8691394 }, // the 5th anniversary edition
  'these-cards-will-get-you-drunk': { keep: 'not on BoardGameGeek; its box front, flattened from a product photo' },
  'throw-throw-burrito': { image: 7073068 },
  'ticket-to-ride': { image: 8937637 },
  'truth-or-dare-tower': { keep: 'not on BoardGameGeek; the publisher\'s flat cover art' },
  uno: { image: 8204165 },
};

// The games are data literals; read them straight off the source rather
// than importing it (its path-less imports are Vite's, not Node's). A game
// is a literal with an `img`; its own `bgg` comes before any `subgames`,
// whose ids are theirs.
const source = await readFile('src/data/games.ts', 'utf8');
const starts = [...source.matchAll(/\{\s*name:"([^"]+)",\s*slug:"([^"]+)",\s*img:"([^"]+)"/g)];
const games = starts.map((m, i) => {
  const literal = source.slice(m.index, starts[i + 1]?.index ?? source.length).split('subgames:')[0];
  const bgg = /\bbgg:(\d+)/.exec(literal)?.[1];
  return { name: m[1], slug: m[2], img: m[3], bgg: bgg ? Number(bgg) : undefined };
});
if (games.length === 0) throw new Error('no games found in src/data/games.ts');
const only = process.argv.slice(2);
const unknown = only.filter((slug) => !games.some((g) => g.slug === slug));
if (unknown.length) throw new Error(`not in src/data/games.ts: ${unknown.join(', ')}`);

const magick = (() => {
  for (const cmd of ['magick', 'convert']) {
    try {
      execFileSync(cmd, ['-version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      // Try the next name.
    }
  }
  throw new Error('ImageMagick is needed: neither `magick` nor `convert` is on the PATH');
})();

// BGG asks clients to keep a gentle pace: one request at a time, spaced.
const pause = () => new Promise((resolve) => setTimeout(resolve, 1200));
class Stop extends Error {}
const get = async (url: string) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  // A rate limit or a challenge page ends the run; what was written stays.
  if (r.status === 429 || r.status === 403) throw new Stop(`BoardGameGeek answered ${r.status} for ${url}; stopping, re-run later for the rest.`);
  await pause();
  return r;
};

const work = await mkdtemp(join(tmpdir(), 'collection-art-'));
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
      const image = r.ok ? Number(((await r.json()) as { item?: { imageid?: string } }).item?.imageid) : NaN;
      if (!image) {
        console.warn(`${game.name}: item ${game.bgg} has no main image (${r.status}); keeping ${game.img}`);
        continue;
      }
      console.warn(`${game.name}: not in COVERS, using its main image ${image}; check it is a flat front cover and pin it`);
      cover = { image };
    }
    const info = await get(IMAGE_URL(cover.image));
    if (!info.ok) {
      console.warn(`${game.name}: image ${cover.image} answered ${info.status}; keeping ${game.img}`);
      continue;
    }
    const sizes = ((await info.json()) as { images?: Record<string, { url?: string }> }).images;
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
    await writeFile(raw, Buffer.from(await file.arrayBuffer()));

    // Cut the box, then the largest square inside it at the focus.
    const [w, h] = execFileSync(magick, [`${raw}[0]`, '-auto-orient', '-format', '%w %h', 'info:'], { encoding: 'utf8' })
      .split(' ').map(Number);
    const [bl, bt, bw, bh] = cover.box ?? [0, 0, 1, 1];
    const box = { x: Math.round(bl * w), y: Math.round(bt * h), w: Math.round(bw * w), h: Math.round(bh * h) };
    const side = Math.min(box.w, box.h);
    const focus = cover.focus ?? (box.h > box.w * 1.15 ? 0.2 : 0.5);
    const x = box.x + Math.round((box.w - side) * focus);
    const y = box.y + Math.round((box.h - side) * focus);
    const out = `public${game.img}`;
    execFileSync(magick, [
      `${raw}[0]`, '-auto-orient', '-colorspace', 'sRGB',
      '-crop', `${side}x${side}+${x}+${y}`, '+repage',
      '-resize', `${SIZE}x${SIZE}!`, '-strip',
      '-quality', QUALITY, '-define', 'webp:method=6', out,
    ]);
    written++;
    console.log(`${game.name}: image ${cover.image} (${w}x${h}) -> ${out}`);
  }
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  console.error(e.message);
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log(`${written} cover${written === 1 ? '' : 's'} written.`);

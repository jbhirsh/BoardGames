import { describe, it, expect } from 'vitest';
import {
  parseRange,
  rangeHeaders,
  routeFor,
  rulebookSize,
  SAVE_ON_OPEN_BELOW,
  savesOnOpen,
  savesRulebook,
  savingData,
  WARM_HEADER,
} from '../utils/offline';

const ORIGIN = 'https://game-room.example';
const SHELL = new Set(['/assets/index-abc.js', '/words/enable.txt', '/images/catan.webp']);
const route = (path: string, method = 'GET', mode = 'no-cors', origin = ORIGIN) =>
  routeFor({ url: `${origin}${path}`, method, mode }, ORIGIN, SHELL);

describe('routeFor', () => {
  it('leaves the API to the network, whatever the method', () => {
    expect(route('/api/votes')).toBe('skip');
    expect(route('/api/chat', 'POST', 'cors')).toBe('skip');
    expect(route('/api/suggestions?action=pending', 'GET', 'navigate')).toBe('skip');
  });

  it('leaves other sites alone', () => {
    expect(route('/api/rest_v1/page/definition/cat', 'GET', 'cors', 'https://en.wiktionary.org')).toBe('skip');
    expect(route('/rules/catan.pdf', 'GET', 'no-cors', 'https://elsewhere.example')).toBe('skip');
  });

  it('answers pages from the network with the saved app behind it', () => {
    expect(route('/', 'GET', 'navigate')).toBe('page');
    expect(route('/rules/catan', 'GET', 'navigate')).toBe('page');
    expect(route('/word-checker?w=qi', 'GET', 'navigate')).toBe('page');
  });

  it('takes a rulebook as a rulebook, even opened as a page of its own, and its HEAD too', () => {
    expect(route('/rules/catan.pdf')).toBe('rulebook');
    expect(route('/rules/catan.seafarers.pdf', 'GET', 'navigate')).toBe('rulebook');
    expect(route('/rules/catan.pdf', 'HEAD', 'cors')).toBe('rulebook');
    expect(route('/rules/catan.pdf', 'POST', 'cors')).toBe('skip');
    // Only PDFs straight under /rules/.
    expect(route('/rules/nested/catan.pdf')).toBe('skip');
    expect(route('/rules/catan.txt')).toBe('skip');
    expect(route('/old/rules/catan.pdf')).toBe('skip');
    expect(route('/rules/catan.pdf.bak')).toBe('skip');
  });

  it('answers precached files from the cache first', () => {
    expect(route('/assets/index-abc.js')).toBe('shell');
    expect(route('/words/enable.txt')).toBe('shell');
    expect(route('/images/catan.webp')).toBe('shell');
  });

  it("saves the app's other files as they are fetched", () => {
    expect(route('/assets/later-chunk-def.js')).toBe('asset');
    expect(route('/images/wishlist/ark-nova.jpg')).toBe('asset');
    expect(route('/pdfjs/wasm/openjpeg.wasm')).toBe('asset');
    // Only from the top of the site.
    expect(route('/old/assets/index-abc.js')).toBe('skip');
  });

  it('leaves everything else to the browser', () => {
    expect(route('/_vercel/insights/script.js')).toBe('skip');
    expect(route('/sw.js')).toBe('skip');
    expect(route('/assets/index-abc.js', 'HEAD')).toBe('skip');
    expect(route('/images/catan.webp', 'POST')).toBe('skip');
    expect(route('/', 'POST', 'navigate')).toBe('skip');
  });
});

describe('savesRulebook', () => {
  it("saves the whole rulebook for a reader's request", () => {
    expect(savesRulebook(new Headers({ Range: 'bytes=0-65535' }))).toBe(true);
    expect(savesRulebook(new Headers())).toBe(true);
  });

  it('saves nothing for a warm request, which fetches only its ranges', () => {
    expect(WARM_HEADER).toBe('X-Warm');
    expect(savesRulebook(new Headers({ Range: 'bytes=0-65535', [WARM_HEADER]: '1' }))).toBe(false);
  });
});

describe('rulebookSize', () => {
  const answer = (status: number, headers: Record<string, string>) => ({ status, headers: new Headers(headers) });

  it("reads the whole file's size from a range's Content-Range", () => {
    expect(rulebookSize(answer(206, { 'Content-Range': 'bytes 0-65535/16445120', 'Content-Length': '65536' }))).toBe(
      16445120,
    );
    expect(rulebookSize(answer(206, { 'Content-Range': ' bytes 100-199/2048 ' }))).toBe(2048);
  });

  it('reads it from the Content-Length of the whole file, or of a HEAD for it', () => {
    expect(rulebookSize(answer(200, { 'Content-Length': '1470444' }))).toBe(1470444);
    expect(rulebookSize(answer(200, { 'Content-Length': ' 2048 ' }))).toBe(2048);
  });

  it("knows no size it isn't told, nor one from another answer", () => {
    expect(rulebookSize(answer(206, { 'Content-Range': 'bytes 0-99/*' }))).toBeNull();
    expect(rulebookSize(answer(206, { 'Content-Range': 'bytes */2048' }))).toBeNull();
    expect(rulebookSize(answer(206, { 'Content-Range': 'bytes 0-99/2048 extra' }))).toBeNull();
    expect(rulebookSize(answer(206, { 'Content-Range': 'items bytes 0-99/2048' }))).toBeNull();
    expect(rulebookSize(answer(200, { 'Content-Length': 'about 2048' }))).toBeNull();
    expect(rulebookSize(answer(206, { 'Content-Length': '100' }))).toBeNull();
    expect(rulebookSize(answer(200, {}))).toBeNull();
    expect(rulebookSize(answer(200, { 'Content-Length': '12abc' }))).toBeNull();
    expect(rulebookSize(answer(200, { 'Content-Range': 'bytes 0-99/2048' }))).toBeNull();
    expect(rulebookSize(answer(404, { 'Content-Length': '9' }))).toBeNull();
    expect(rulebookSize(answer(304, { 'Content-Length': '2048' }))).toBeNull();
  });
});

describe('savesOnOpen', () => {
  const reader = new Headers({ Range: 'bytes=0-65535' });
  const whole = (bytes: number) => ({ status: 200, headers: new Headers({ 'Content-Length': String(bytes) }) });
  const range = (bytes: number) => ({
    status: 206,
    headers: new Headers({ 'Content-Range': `bytes 0-65535/${bytes}` }),
  });

  it('saves a rulebook under 3 MB when it is opened, whether the answer is whole or a range', () => {
    expect(SAVE_ON_OPEN_BELOW).toBe(3_000_000);
    expect(savesOnOpen(reader, range(1_470_444), false)).toBe(true);
    expect(savesOnOpen(new Headers(), whole(SAVE_ON_OPEN_BELOW - 1), false)).toBe(true);
  });

  it('leaves one of 3 MB or more for Save for offline', () => {
    expect(savesOnOpen(reader, range(SAVE_ON_OPEN_BELOW), false)).toBe(false);
    expect(savesOnOpen(new Headers(), whole(16_445_120), false)).toBe(false);
  });

  it("leaves one whose size isn't said, and any when the browser is saving data", () => {
    expect(savesOnOpen(reader, { status: 200, headers: new Headers() }, false)).toBe(false);
    expect(savesOnOpen(reader, range(1_470_444), true)).toBe(false);
  });

  it('saves nothing for a warm request, however small the rulebook', () => {
    expect(savesOnOpen(new Headers({ [WARM_HEADER]: '1' }), range(2048), false)).toBe(false);
  });
});

describe('savingData', () => {
  it("reads the browser's data saver where it says, and counts it off where it doesn't", () => {
    expect(savingData({ connection: { saveData: true } })).toBe(true);
    expect(savingData({ connection: { saveData: false } })).toBe(false);
    expect(savingData({ connection: {} })).toBe(false);
    expect(savingData({})).toBe(false);
  });
});

describe('parseRange', () => {
  it('sends the whole file with no Range header', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('', 1000)).toBeNull();
  });

  it('reads a closed range, both ends inclusive', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange(' bytes=500-999 ', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=5-5', 1000)).toEqual({ start: 5, end: 5 });
  });

  it('trims a range that runs past the end to the file', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('reads an open-ended range to the end of the file', () => {
    expect(parseRange('bytes=250-', 1000)).toEqual({ start: 250, end: 999 });
  });

  it('reads a suffix range as the last n bytes, at most the whole file', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it("refuses ranges that can't be met", () => {
    expect(parseRange('bytes=1000-1100', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=999-', 1000)).toEqual({ start: 999, end: 999 });
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-10', 0)).toBe('unsatisfiable');
  });

  it("answers what it doesn't understand with the whole file", () => {
    expect(parseRange('bytes=0-10, 20-30', 1000)).toBeNull();
    expect(parseRange('items=0-10', 1000)).toBeNull();
    expect(parseRange('bytes=a-b', 1000)).toBeNull();
    expect(parseRange('bytes=0-10x', 1000)).toBeNull();
    // Not ranges at all, by HTTP's grammar: ignored rather than refused.
    expect(parseRange('bytes=600-500', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('xbytes=0-10', 1000)).toBeNull();
  });
});

describe('rangeHeaders', () => {
  it('describes the part and the whole', () => {
    expect(rangeHeaders({ start: 100, end: 199 }, 1000, 'application/pdf')).toEqual({
      'Content-Type': 'application/pdf',
      'Content-Length': '100',
      'Content-Range': 'bytes 100-199/1000',
      'Accept-Ranges': 'bytes',
    });
  });
});

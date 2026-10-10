import { describe, it, expect } from 'vitest';
import { parseRange, rangeHeaders, routeFor } from '../utils/offline';

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

  it('takes a rulebook as a rulebook, even opened in an iframe, and its HEAD too', () => {
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

  it('saves the app\'s other files as they are fetched', () => {
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

  it('refuses ranges that can\'t be met', () => {
    expect(parseRange('bytes=1000-1100', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=999-', 1000)).toEqual({ start: 999, end: 999 });
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-10', 0)).toBe('unsatisfiable');
  });

  it('answers what it doesn\'t understand with the whole file', () => {
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

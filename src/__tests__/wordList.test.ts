import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeWord, parseWordList } from '../utils/wordList';

describe('normalizeWord', () => {
  it('trims and lowercases', () => {
    expect(normalizeWord('  Banana ')).toBe('banana');
  });

  it('drops punctuation a phone puts around a word, but not inside one', () => {
    expect(normalizeWord('OK.')).toBe('ok');
    expect(normalizeWord('“qi,”')).toBe('qi');
    expect(normalizeWord("don't")).toBeNull();
    expect(normalizeWord('e-mail')).toBeNull();
    expect(normalizeWord('...')).toBeNull();
  });

  it('refuses anything but letters', () => {
    expect(normalizeWord("rock'n'roll")).toBeNull();
    expect(normalizeWord('two words')).toBeNull();
    expect(normalizeWord('b4')).toBeNull();
    expect(normalizeWord('   ')).toBeNull();
  });
});

describe('parseWordList', () => {
  it('reads one word per line, skipping blanks and stray whitespace', () => {
    const words = parseWordList('aa\naah\r\n\n  zebra \n');
    expect([...words]).toEqual(['aa', 'aah', 'zebra']);
  });
});

describe('loadWordList', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  const FILES: Record<string, string> = { '/words/enable.txt': 'cat\ndog\n', '/words/additions.txt': 'qi\nza\n' };
  const serve = (url: string | URL | Request) => ({ ok: true, text: async () => FILES[String(url)] }) as Response;

  it('fetches ENABLE and the additions once, as one shared set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => serve(url));
    const { loadWordList } = await import('../hooks/wordList');
    const [a, b] = await Promise.all([loadWordList(), loadWordList()]);
    expect(a).toBe(b);
    expect([...a!].sort()).toEqual(['cat', 'dog', 'qi', 'za']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const url of Object.keys(FILES)) {
      expect(fetchSpy).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    }
  });

  it('answers null when ENABLE cannot load, and tries again next time', async () => {
    let enableDown = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).endsWith('enable.txt') && enableDown ? { ok: false, status: 503 } as Response : serve(url)));
    const { loadWordList } = await import('../hooks/wordList');
    expect(await loadWordList()).toBeNull();
    enableDown = false;
    expect((await loadWordList())?.has('qi')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('answers from ENABLE alone when the additions cannot load', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (
      String(url).endsWith('additions.txt') ? Promise.reject(new TypeError('Failed to fetch')) : serve(url)));
    const { loadWordList } = await import('../hooks/wordList');
    const words = await loadWordList();
    expect(words?.has('cat')).toBe(true);
    expect(words?.has('qi')).toBe(false);
  });

  it('gives up on a list that takes more than 10 seconds', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const { loadWordList } = await import('../hooks/wordList');
      const pending = loadWordList();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('the bundled word lists', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), 'public/words', file), 'utf8').trim().split('\n');
  const enable = new Set(read('enable.txt'));
  const additions = read('additions.txt');

  it('add newer words ENABLE predates, the two-letter ones first among them', () => {
    for (const word of ['qi', 'za', 'te', 'ok', 'ew', 'zen', 'email', 'texted']) {
      expect(enable.has(word), word).toBe(false);
      expect(additions, word).toContain(word);
    }
  });

  it('keep the additions sorted, lowercase, unique and out of ENABLE', () => {
    expect(additions).toEqual([...additions].sort());
    expect(new Set(additions).size).toBe(additions.length);
    for (const word of additions) {
      expect(word, word).toMatch(/^[a-z]+$/);
      expect(enable.has(word), `${word} is already in ENABLE`).toBe(false);
    }
  });
});

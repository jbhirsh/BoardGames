import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeWord, parseWordList } from '../utils/wordList';

describe('normalizeWord', () => {
  it('trims and lowercases', () => {
    expect(normalizeWord('  Banana ')).toBe('banana');
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

  it('fetches the list once and shares it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => 'cat\ndog\n' } as Response);
    const { loadWordList } = await import('../hooks/wordList');
    const [a, b] = await Promise.all([loadWordList(), loadWordList()]);
    expect(a).toBe(b);
    expect(a?.has('dog')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/words/enable.txt', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('answers null when the list cannot load, and tries again next time', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => 'cat\n' } as Response);
    const { loadWordList } = await import('../hooks/wordList');
    expect(await loadWordList()).toBeNull();
    expect((await loadWordList())?.has('cat')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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


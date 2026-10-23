import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  addGame,
  callJson,
  decideSuggestion,
  editGame,
  fetchPending,
  previewGame,
  removeGame,
} from '../client/adminApi';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const ROOT = {
  bggId: 237182,
  name: 'Root: A Game of Woodland Might and Right',
  year: 2018,
  min: 2,
  max: 4,
  mins: 90,
  desc: 'Woodland war.',
  kw: ['strategy'],
  img: 'https://cf.geekdo-images.com/root.jpg',
};

describe('adminApi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches the pending queue and tolerates a malformed body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }] }));
    expect(await fetchPending()).toEqual([{ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }]);
    expect(fetchSpy).toHaveBeenCalledWith('/api/suggestions?action=pending', { signal: undefined });
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchPending()).toEqual([]);
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(fetchPending()).rejects.toThrow('fetch failed');
  });

  it('sends every mutation as JSON with the shape the API expects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    await decideSuggestion('sug-1', 'deny');
    await previewGame('Root');
    await addGame({ game: 'Root', name: 'Jess', note: '', type: 'strategy', details: null });
    await addGame({ game: 'Root', name: 'Jess', note: '', type: null, details: ROOT });
    await editGame({
      id: 'sug-1',
      game: 'Root',
      details: { min: 2, max: 4, mins: 60, desc: 'War.', kw: ['strategy'], type: null },
    });
    await removeGame('sug-1');
    const calls = fetchSpy.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).method,
      JSON.parse((init as RequestInit).body as string),
    ]);
    expect(calls).toEqual([
      ['/api/suggestions', 'POST', { decision: 'deny', id: 'sug-1' }],
      ['/api/suggestions', 'POST', { action: 'preview', game: 'Root' }],
      [
        '/api/suggestions',
        'POST',
        { action: 'add', game: 'Root', name: 'Jess', note: '', type: 'strategy', details: null },
      ],
      // BGG's name for the match stays behind: the entry keeps the typed one.
      [
        '/api/suggestions',
        'POST',
        {
          action: 'add',
          game: 'Root',
          name: 'Jess',
          note: '',
          details: {
            bggId: 237182,
            year: 2018,
            min: 2,
            max: 4,
            mins: 90,
            desc: 'Woodland war.',
            kw: ['strategy'],
            img: 'https://cf.geekdo-images.com/root.jpg',
          },
        },
      ],
      [
        '/api/suggestions',
        'PATCH',
        {
          id: 'sug-1',
          game: 'Root',
          details: { min: 2, max: 4, mins: 60, desc: 'War.', kw: ['strategy'], type: null },
        },
      ],
      ['/api/suggestions', 'DELETE', { id: 'sug-1' }],
    ]);
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    }
  });

  it('is one helper for any endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    expect(await callJson('/api/auth', 'POST', { email: 'a@b.c' })).toEqual({ ok: true, data: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledWith('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c' }),
    });
  });

  it('turns failures into messages instead of throwing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'owner sign-in required' }, false));
    expect(await removeGame('sug-1')).toEqual({ ok: false, error: 'owner sign-in required' });
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error('html');
      },
    } as unknown as Response);
    expect(await removeGame('sug-1')).toEqual({ ok: false, error: 'Something went wrong. Try again in a minute.' });
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    expect(await removeGame('sug-1')).toEqual({ ok: false, error: 'Something went wrong. Try again in a minute.' });
    fetchSpy.mockResolvedValueOnce(jsonResponse({ item: { id: 'sug-1' } }));
    expect(await decideSuggestion('sug-1', 'approve')).toEqual({ ok: true, data: { item: { id: 'sug-1' } } });
  });

  it("sends an approval's corrected name and previewed details only when there are some", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    await decideSuggestion('sug-1', 'approve', { details: ROOT });
    await decideSuggestion('sug-1', 'approve', { game: 'Root', details: null });
    await decideSuggestion('sug-1', 'approve', { game: 'Root' });
    await decideSuggestion('sug-1', 'approve', {});
    expect(fetchSpy.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))).toEqual([
      // As on an add, BGG's name for the match stays behind.
      {
        decision: 'approve',
        id: 'sug-1',
        details: {
          bggId: 237182,
          year: 2018,
          min: 2,
          max: 4,
          mins: 90,
          desc: 'Woodland war.',
          kw: ['strategy'],
          img: 'https://cf.geekdo-images.com/root.jpg',
        },
      },
      { decision: 'approve', id: 'sug-1', game: 'Root', details: null },
      { decision: 'approve', id: 'sug-1', game: 'Root' },
      { decision: 'approve', id: 'sug-1' },
    ]);
  });

  it("passes a preview's abort signal to fetch, and reads an aborted one as a failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const controller = new AbortController();
    controller.abort();
    expect(await previewGame('Root', controller.signal)).toEqual({
      ok: false,
      error: 'Something went wrong. Try again in a minute.',
    });
    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });
});

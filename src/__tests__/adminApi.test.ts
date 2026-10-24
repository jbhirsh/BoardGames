import { describe, it, expect, vi, afterEach } from 'vitest';
import { addGame, decideSuggestion, editGame, fetchPending, previewGame, removeGame } from '../client/adminApi';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';

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
// BGG's name for the match stays behind: the entry keeps the typed one.
const STORED = {
  bggId: 237182,
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

  it('fetches the pending queue, and throws when it cannot', async () => {
    const queue = [{ id: 'sug-1', game: 'Root', name: 'Alex', note: '' }];
    const spy = stubGraphql({ PendingSuggestions: () => ({ pendingSuggestions: queue }) });
    expect(await fetchPending()).toEqual(queue);
    expect(operations(spy).map((o) => o.operationName)).toEqual(['PendingSuggestions']);
    stubGraphql({ PendingSuggestions: () => gqlError('owner sign-in required', 'FORBIDDEN', 403) });
    await expect(fetchPending()).rejects.toThrow('fetch failed');
  });

  it('sends each operation with the variables the API expects', async () => {
    const spy = stubGraphql({
      DecideSuggestion: () => ({ decideSuggestion: { lookup: null } }),
      PreviewGame: () => ({ previewGame: { outcome: 'NO_MATCH', details: null } }),
      AddGame: () => ({ addGame: { lookup: 'FOUND' } }),
      EditSuggestion: () => ({ editSuggestion: { id: 'sug-1' } }),
      RemoveSuggestion: () => ({ removeSuggestion: true }),
    });
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
    expect(operations(spy).map((o) => [o.operationName, o.variables])).toEqual([
      ['DecideSuggestion', { id: 'sug-1', decision: 'DENY' }],
      ['PreviewGame', { game: 'Root' }],
      ['AddGame', { game: 'Root', name: 'Jess', note: '', type: 'strategy', details: null }],
      ['AddGame', { game: 'Root', name: 'Jess', note: '', details: STORED }],
      [
        'EditSuggestion',
        {
          id: 'sug-1',
          game: 'Root',
          details: { min: 2, max: 4, mins: 60, desc: 'War.', kw: ['strategy'], type: null },
        },
      ],
      ['RemoveSuggestion', { id: 'sug-1' }],
    ]);
  });

  it("reads a preview and an approval's lookup in the admin controls' words", async () => {
    stubGraphql({
      PreviewGame: ({ game }) =>
        game === 'Root'
          ? { previewGame: { outcome: 'FOUND', details: { ...ROOT, year: null, img: null } } }
          : { previewGame: { outcome: 'NO_TOKEN', details: null } },
      DecideSuggestion: ({ decision }) => ({ decideSuggestion: { lookup: decision === 'APPROVE' ? 'REFUSED' : null } }),
    });
    expect(await previewGame('Root')).toEqual({
      ok: true,
      data: { outcome: 'found', details: { ...ROOT, year: undefined, img: undefined } },
    });
    expect(await previewGame('Rot')).toEqual({ ok: true, data: { outcome: 'no-token' } });
    expect(await decideSuggestion('sug-1', 'approve')).toEqual({ ok: true, data: { lookup: 'refused' } });
    expect(await decideSuggestion('sug-1', 'deny')).toEqual({ ok: true, data: {} });
  });

  it('turns failures into messages instead of throwing', async () => {
    stubGraphql({ RemoveSuggestion: () => gqlError('owner sign-in required', 'FORBIDDEN', 403) });
    expect(await removeGame('sug-1')).toEqual({ ok: false, error: 'owner sign-in required' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await removeGame('sug-1')).toEqual({ ok: false, error: 'Something went wrong. Try again in a minute.' });
  });

  it("sends an approval's corrected name and previewed details only when there are some", async () => {
    const spy = stubGraphql({ DecideSuggestion: () => ({ decideSuggestion: { lookup: null } }) });
    await decideSuggestion('sug-1', 'approve', { details: ROOT });
    await decideSuggestion('sug-1', 'approve', { game: 'Root', details: null });
    await decideSuggestion('sug-1', 'approve', { game: 'Root' });
    await decideSuggestion('sug-1', 'approve', {});
    expect(operations(spy).map((o) => o.variables)).toEqual([
      { decision: 'APPROVE', id: 'sug-1', details: STORED },
      { decision: 'APPROVE', id: 'sug-1', game: 'Root', details: null },
      { decision: 'APPROVE', id: 'sug-1', game: 'Root' },
      { decision: 'APPROVE', id: 'sug-1' },
    ]);
  });

  it("passes a preview's abort signal to fetch, and reads an aborted one as a failure", async () => {
    const spy = stubGraphql({});
    const controller = new AbortController();
    controller.abort();
    expect(await previewGame('Root', controller.signal)).toEqual({
      ok: false,
      error: 'Something went wrong. Try again in a minute.',
    });
    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

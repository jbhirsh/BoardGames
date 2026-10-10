import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared across the fresh module each test imports, so its calls can be read.
const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/react', () => ({ captureMessage }));

const BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const NOUN = { en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'A <b>fruit</b>.' }] }] };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const status = (code: number, body: unknown = {}) => ({ ok: code < 300, status: code, json: async () => body }) as Response;
/** The API's own answer for a page it doesn't have. */
const MISSING_PAGE = { status: 404, type: 'Internal error' };

/** A fresh copy of the module: "once per page load" starts over. */
async function load() {
  return (await import('../hooks/dictionary')).lookUp;
}

const unreachableReports = () =>
  captureMessage.mock.calls.filter(([message]) => message === 'word checker: dictionary unreachable');

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  captureMessage.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lookUp', () => {
  it('asks Wiktionary for the word and reads its playable meanings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(NOUN));
    const lookUp = await load();
    expect(await lookUp('qi')).toEqual({
      found: true,
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A fruit.', example: undefined }] }],
    });
    expect(fetchSpy).toHaveBeenCalledWith(`${BASE}qi`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('takes a 404, or a page with nothing playable, as no such word, without a report', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(status(404, MISSING_PAGE))
      .mockResolvedValueOnce(ok({ en: [{ partOfSpeech: 'Proper noun', language: 'English', definitions: [{ definition: 'A city.' }] }] }))
      .mockResolvedValueOnce(ok({ fr: [] }));
    const lookUp = await load();
    expect(await lookUp('asdfgh')).toEqual({ found: false });
    expect(await lookUp('london')).toEqual({ found: false });
    expect(await lookUp('und')).toEqual({ found: false });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports a server error once per page load, with its status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(status(522)).mockResolvedValueOnce(status(503));
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    expect(await lookUp('za')).toBeNull();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('word checker: dictionary unreachable', { level: 'warning', extra: { status: 522 } });
  });

  it("takes a 404 that isn't the API's missing page, as from a retired route, as unreachable, and reports it", async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(status(404, { httpCode: 404, httpReason: 'Not Found' }))
      .mockResolvedValueOnce(status(404, { httpCode: 404, httpReason: 'Not Found' }));
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    expect(await lookUp('za')).toBeNull();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith('word checker: dictionary unreachable', { level: 'warning', extra: { status: 404 } });
  });

  it('takes a 404 whose body is not JSON as unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); },
    } as unknown as Response);
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    expect(unreachableReports()).toEqual([
      ['word checker: dictionary unreachable', { level: 'warning', extra: { status: 404 } }],
    ]);
  });

  it('reports a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    expect(unreachableReports()).toEqual([
      ['word checker: dictionary unreachable', { level: 'warning', extra: { status: 'network error' } }],
    ]);
  });

  it('gives up after five seconds and reports a timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const lookUp = await load();
    const pending = lookUp('qi');
    await vi.advanceTimersByTimeAsync(4999);
    expect(captureMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(unreachableReports()).toEqual([
      ['word checker: dictionary unreachable', { level: 'warning', extra: { status: 'timeout' } }],
    ]);
  });

  it('reports a timeout that cuts the body off', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    }) as Response);
    const lookUp = await load();
    const pending = lookUp('qi');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(unreachableReports()).toHaveLength(1);
  });

  it("doesn't report Wikimedia rate-limiting this visitor, or a device that is offline", async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(status(429))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await lookUp('qi')).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('still reports an outage after a rate limit or an offline spell', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(500));
    const lookUp = await load();
    await lookUp('qi');
    await lookUp('qi');
    expect(unreachableReports()).toEqual([
      ['word checker: dictionary unreachable', { level: 'warning', extra: { status: 500 } }],
    ]);
  });

  it.each([
    ['not JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response],
    ['not shaped as expected', ok([])],
  ])('reports a 200 whose body is %s as unexpected, once per page load', async (_label, response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response).mockResolvedValueOnce(ok(null));
    const lookUp = await load();
    expect(await lookUp('qi')).toBeNull();
    expect(captureMessage).toHaveBeenCalledWith('word checker: unexpected dictionary response', { level: 'warning' });
    expect(await lookUp('za')).toBeNull();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports an outage even after an unexpected body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok([])).mockResolvedValueOnce(status(500));
    const lookUp = await load();
    await lookUp('qi');
    await lookUp('qi');
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(unreachableReports()).toHaveLength(1);
  });
});

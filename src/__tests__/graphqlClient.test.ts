import { describe, it, expect, vi, afterEach } from 'vitest';
import { request } from '../client/graphql';
import { SessionDocument, VoteDocument } from '../gql/graphql';

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('request', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs the document as JSON with its name and variables, and answers its data', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: { vote: { count: 3 } } }));
    expect(await request(VoteDocument, { itemId: 'azul', anonId: 'anon-1234567', vote: 1 })).toEqual({
      ok: true,
      data: { vote: { count: 3 } },
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/graphql');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(init).not.toHaveProperty('signal');
    const body: unknown = JSON.parse(String(init?.body));
    expect(body).toEqual({
      query: VoteDocument.toString(),
      operationName: 'Vote',
      variables: { itemId: 'azul', anonId: 'anon-1234567', vote: 1 },
    });
  });

  it("answers the API's first error, with its code and a decision's status", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        {
          errors: [
            { message: 'Azul was already approved', extensions: { code: 'ALREADY_DECIDED', status: 'approved' } },
            { message: 'second' },
          ],
        },
        409,
      ),
    );
    expect(await request(SessionDocument, {})).toEqual({
      ok: false,
      error: 'Azul was already approved',
      code: 'ALREADY_DECIDED',
      status: 'approved',
    });
  });

  it('words anything else generically: a 500 page, an error without a message, no data, a lost network', async () => {
    const generic = { ok: false, error: 'Something went wrong. Try again in a minute.' };
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('<h1>500</h1>', { status: 500 }));
    expect(await request(SessionDocument, {})).toEqual(generic);
    spy.mockResolvedValueOnce(json({ errors: [{ extensions: 'odd' }, 'junk'] }, 400));
    expect(await request(SessionDocument, {})).toEqual({ ...generic, code: undefined, status: undefined });
    spy.mockResolvedValueOnce(json({ data: null }));
    expect(await request(SessionDocument, {})).toEqual(generic);
    spy.mockResolvedValueOnce(json('nope'));
    expect(await request(SessionDocument, {})).toEqual(generic);
    spy.mockResolvedValueOnce(json({ data: { session: { admin: true } } }, 502));
    expect(await request(SessionDocument, {})).toEqual(generic);
    spy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await request(SessionDocument, {})).toEqual(generic);
  });

  it('passes the abort signal along', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: { session: { admin: false } } }));
    const controller = new AbortController();
    await request(SessionDocument, {}, controller.signal);
    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

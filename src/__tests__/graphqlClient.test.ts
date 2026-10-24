import { describe, it, expect, vi, afterEach } from 'vitest';
import { errorCode, openStream, readEvents, request } from '../client/graphql';
import { AskRulesDocument, SessionDocument, VoteDocument } from '../gql/graphql';

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

describe('subscriptions over server-sent events', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A reader handing over `parts` one read at a time. */
  const reader = (...parts: string[]) => new Response(parts.join('')).body!.getReader();
  const event = (data: unknown) => `event: next\ndata: ${JSON.stringify(data)}\n\n`;

  it('asks for an event stream with the same JSON POST', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));
    const controller = new AbortController();
    await openStream(AskRulesDocument, { slug: 'catan', message: 'hi' }, controller.signal);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/graphql');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({ operationName: 'AskRules', variables: { slug: 'catan' } });
  });

  it('reads each next event as an answer until complete, skipping comments and other events', async () => {
    const answers = [];
    for await (const answer of readEvents(
      reader(
        ':\n\n',
        event({ data: { askRules: 'a' } }),
        'event: ping\ndata: x\n\n',
        'event: next\ndata: {"data":\ndata: {"askRules":"b"}}\n\n',
        'event: complete\ndata:\n\n',
        event({ data: { askRules: 'never' } }),
      ),
    )) {
      answers.push(answer);
    }
    expect(answers).toEqual([
      { data: { askRules: 'a' }, errors: [] },
      { data: { askRules: 'b' }, errors: [] },
    ]);
  });

  it('reads a stream that ends without complete, the last event included', async () => {
    const answers = [];
    const text =
      event({ data: { askRules: 'a' } }) + event({ errors: [{ message: 'late', extensions: { code: 'X' } }] });
    for await (const answer of readEvents(reader(text.slice(0, -2)))) answers.push(answer);
    expect(answers).toEqual([
      { data: { askRules: 'a' }, errors: [] },
      { data: null, errors: [{ message: 'late', code: 'X', status: undefined }] },
    ]);
  });

  it("finds a refusal's code in an event stream or a JSON answer, and nothing in anything else", async () => {
    expect(
      await errorCode(new Response(event({ errors: [{ message: 'x', extensions: { code: 'DAILY_LIMIT' } }] }))),
    ).toBe('DAILY_LIMIT');
    expect(await errorCode(Response.json({ errors: [{ message: 'x', extensions: { code: 'RATE_LIMITED' } }] }))).toBe(
      'RATE_LIMITED',
    );
    expect(await errorCode(new Response('<h1>502</h1>'))).toBeUndefined();
    expect(await errorCode(Response.json({ errors: [] }))).toBeUndefined();
  });
});

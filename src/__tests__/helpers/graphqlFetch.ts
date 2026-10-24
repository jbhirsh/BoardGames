import { vi } from 'vitest';

/** One operation a component sent to the API, as client/graphql.ts posts it. */
export interface Operation {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
}

/** An answer other than plain data: errors, a status, or a Response of the test's own. */
export class Reply {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    this.status = status;
    this.body = body;
  }
}

/** A GraphQL error as the API sends one. */
export const gqlError = (
  message: string,
  code = 'BAD_REQUEST',
  status = 400,
  extensions: Record<string, unknown> = {},
) => new Reply(status, { errors: [{ message, extensions: { code, ...extensions } }] });

/**
 * Each stub answers its operation's variables (and the request, for its
 * abort signal) with the `data` to send, a Reply, or a Response; a stub
 * that throws makes the fetch fail, as a lost network does.
 */
export type Handlers = Record<string, (variables: Record<string, unknown>, init?: RequestInit) => unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The operation a fetch call posted to /api/graphql, or null for any other call. */
function operationOf(input: RequestInfo | URL, init?: RequestInit): Operation | null {
  if (String(input) !== '/api/graphql' || typeof init?.body !== 'string') return null;
  const body: unknown = JSON.parse(init.body);
  if (!isRecord(body) || typeof body.query !== 'string' || typeof body.operationName !== 'string') return null;
  return {
    operationName: body.operationName,
    query: body.query,
    variables: isRecord(body.variables) ? body.variables : {},
  };
}

/** Every operation a fetch spy saw, in order. */
export const operations = (spy: { mock: { calls: Array<[RequestInfo | URL, RequestInit?]> } }) =>
  spy.mock.calls.flatMap(([input, init]) => {
    const op = operationOf(input, init);
    return op ? [op] : [];
  });

/**
 * A fetch that answers the API's operations from `handlers` and anything
 * else from `other` (a test that makes another call says how to answer it).
 * An operation with no stub gets a GraphQL error, as an unknown field would.
 */
export function graphqlFetch(handlers: Handlers, other?: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const op = operationOf(input, init);
    if (!op) {
      if (other) return other(String(input), init);
      throw new Error(`unexpected fetch: ${String(input)}`);
    }
    const handler = handlers[op.operationName];
    if (!handler) return Response.json({ errors: [{ message: `no stub for ${op.operationName}` }] }, { status: 400 });
    const out: unknown = await handler(op.variables, init);
    if (out instanceof Response) return out;
    if (out instanceof Reply) return Response.json(out.body, { status: out.status });
    return Response.json({ data: out });
  });
}

/** Installs graphqlFetch as the global fetch for one test. */
export const stubGraphql = (handlers: Handlers, other?: (url: string, init?: RequestInit) => Response) => {
  const spy = graphqlFetch(handlers, other);
  vi.spyOn(globalThis, 'fetch').mockImplementation(spy);
  return spy;
};

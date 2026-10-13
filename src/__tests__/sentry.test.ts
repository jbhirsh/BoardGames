import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));

import * as Sentry from '@sentry/node';
import { failWith500, initSentry, reportError } from '../../api/_lib/sentry';

describe('api Sentry helpers', () => {
  const env = { ...process.env };
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    consoleError.mockRestore();
  });

  it('initSentry starts Sentry with the server DSN and a 10% trace sample', () => {
    process.env.SENTRY_DSN = 'https://key@sentry.example/1';
    initSentry();
    expect(vi.mocked(Sentry.init)).toHaveBeenCalledWith({
      dsn: 'https://key@sentry.example/1',
      tracesSampleRate: 0.1,
    });
  });

  it('reportError captures, waits for the flush, then logs under the label', async () => {
    const boom = new Error('boom');
    const order: string[] = [];
    vi.mocked(Sentry.captureException).mockImplementation(() => { order.push('capture'); return ''; });
    vi.mocked(Sentry.flush).mockImplementation(async () => { order.push('flush'); return true; });
    consoleError.mockImplementation(() => { order.push('log'); });

    await reportError('votes api error:', boom);

    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
    expect(vi.mocked(Sentry.flush)).toHaveBeenCalledWith(2000);
    expect(consoleError).toHaveBeenCalledWith('votes api error:', boom);
    expect(order).toEqual(['capture', 'flush', 'log']);
  });

  it('failWith500 reports the error and answers 500 with the generic body', async () => {
    const boom = new Error('boom');
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) { res.statusCode = code; return res; },
      json(body: unknown) { res.body = body; return res; },
    };

    const returned = await failWith500(res, 'auth api error:', boom);

    expect(returned).toBe(res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Server error' });
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(boom);
    expect(consoleError).toHaveBeenCalledWith('auth api error:', boom);
  });
});

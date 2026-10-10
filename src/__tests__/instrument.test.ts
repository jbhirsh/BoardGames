import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrowserOptions, ErrorEvent } from '@sentry/react';

const dsn = vi.hoisted(() => ({ value: 'https://key@o1.ingest.sentry.io/1' as string | undefined }));
const sentry = vi.hoisted(() => ({
  init: vi.fn<(options: BrowserOptions) => void>(),
  addIntegration: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  getClient: vi.fn(() => ({ getDsn: () => dsn.value })),
}));
const integration = vi.hoisted(() => ({
  name: 'Replay',
  flush: vi.fn(() => Promise.resolve()),
  getReplayId: vi.fn((): string | undefined => 'replay-1'),
}));
const lazy = vi.hoisted(() => ({
  replayIntegration: vi.fn(() => integration),
}));
vi.mock('@sentry/react', () => sentry);
vi.mock('../sentryReplay', () => lazy);

/** A fresh instrument.ts (it initialises Sentry on import) and its init options. */
async function instrument() {
  vi.resetModules();
  const module = await import('../instrument');
  const options = sentry.init.mock.calls.at(-1)![0];
  const beforeSend = (event: ErrorEvent) => options.beforeSend!(event, {}) as Promise<ErrorEvent | null>;
  return { ...module, options, beforeSend };
}

const thrown: ErrorEvent = { type: undefined, level: 'error', exception: { values: [{ type: 'Error', value: 'boom' }] } };
// The SDK attaches a stack to a message as a synthetic exception.
const warning: ErrorEvent = {
  type: undefined, level: 'warning', message: 'rules chat request timed out',
  exception: { values: [{ value: 'rules chat request timed out', mechanism: { type: 'generic', synthetic: true } }] },
};
const failed: ErrorEvent = { type: undefined, level: 'error', message: 'rules chat request failed: HTTP 502' };

/** Lets a dynamic import and the promises after it settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('instrument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dsn.value = 'https://key@o1.ingest.sentry.io/1';
    integration.getReplayId.mockReturnValue('replay-1');
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.doMock('../sentryReplay', () => lazy);
    vi.useRealTimers();
  });

  it('traces a tenth of sessions and records replay only after an error', async () => {
    const { options } = await instrument();
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(1.0);
    // Replay isn't set up at start-up: its code stays out of the main bundle.
    expect(options.integrations).toEqual([{ name: 'BrowserTracing' }]);
    expect(lazy.replayIntegration).not.toHaveBeenCalled();
    expect(sentry.addIntegration).not.toHaveBeenCalled();
  });

  it('loads replay on the first error, once, records the rest of the session and links the error to it', async () => {
    const { beforeSend } = await instrument();
    const first = await beforeSend({ ...thrown });
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
    expect(sentry.addIntegration).toHaveBeenCalledExactlyOnceWith(integration);
    // From buffering to recording the session, once it's set up.
    expect(integration.flush).toHaveBeenCalledExactlyOnceWith();
    expect(sentry.addIntegration.mock.invocationCallOrder[0])
      .toBeLessThan(integration.flush.mock.invocationCallOrder[0]);
    expect(first).toEqual({ ...thrown, tags: { replayId: 'replay-1' } });

    const second = await beforeSend({ ...thrown, tags: { slug: 'catan' } });
    expect(second?.tags).toEqual({ slug: 'catan', replayId: 'replay-1' });
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
    expect(integration.flush).toHaveBeenCalledOnce();
  });

  it('starts replay for a message at error level, but never for a warning', async () => {
    const { beforeSend } = await instrument();
    await expect(beforeSend({ ...warning })).resolves.toEqual(warning);
    await settle();
    expect(lazy.replayIntegration).not.toHaveBeenCalled();

    await expect(beforeSend({ ...failed })).resolves.toEqual({ ...failed, tags: { replayId: 'replay-1' } });
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
  });

  it.each<[string, ErrorEvent]>([
    ['a fatal message', { type: undefined, level: 'fatal', message: 'down' }],
    ['an exception with no level (Sentry reads it as an error)', { type: undefined, exception: { values: [{ type: 'Error' }] } }],
  ])('starts replay for %s', async (_, event) => {
    const { beforeSend } = await instrument();
    await beforeSend(event);
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
  });

  it.each(['info', 'debug', 'log'] as const)('never starts replay for a message at %s level', async (level) => {
    const { beforeSend } = await instrument();
    await beforeSend({ type: undefined, level, message: 'note' });
    await settle();
    expect(lazy.replayIntegration).not.toHaveBeenCalled();
  });

  it('records nothing without a DSN', async () => {
    dsn.value = undefined;
    const { beforeSend } = await instrument();
    await expect(beforeSend({ ...thrown })).resolves.toEqual(thrown);
    await settle();
    expect(lazy.replayIntegration).not.toHaveBeenCalled();
  });

  it('sends the error untagged when replay has no id', async () => {
    integration.getReplayId.mockReturnValue(undefined);
    const { beforeSend } = await instrument();
    await expect(beforeSend({ ...thrown })).resolves.toEqual(thrown);
  });

  it('goes without replay when its code fails to load, and tries again on a later error', async () => {
    vi.doMock('../sentryReplay', () => { throw new Error('offline') });
    const { beforeSend } = await instrument();
    await expect(beforeSend({ ...thrown })).resolves.toEqual(thrown);
    expect(sentry.addIntegration).not.toHaveBeenCalled();

    vi.doMock('../sentryReplay', () => lazy);
    await beforeSend({ ...thrown });
    expect(sentry.addIntegration).toHaveBeenCalledExactlyOnceWith(integration);
  });

  it('never builds a second replay once one was built, even if it failed after', async () => {
    integration.flush.mockRejectedValueOnce(new Error('upload failed'));
    const { beforeSend } = await instrument();
    await beforeSend({ ...thrown });
    await settle();
    await beforeSend({ ...thrown });
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
  });

  it('never builds a second replay when adding it threw', async () => {
    sentry.addIntegration.mockImplementationOnce(() => { throw new Error('Multiple instances') });
    const { beforeSend } = await instrument();
    await expect(beforeSend({ ...thrown })).resolves.toEqual(thrown);
    await beforeSend({ ...thrown });
    expect(lazy.replayIntegration).toHaveBeenCalledOnce();
  });

  it('sends the error after a few seconds if replay is slow to load', async () => {
    vi.doMock('../sentryReplay', () => new Promise(() => {}));
    const { beforeSend } = await instrument();
    vi.useFakeTimers();
    const sent = beforeSend({ ...thrown });
    await vi.advanceTimersByTimeAsync(2999);
    let done = false;
    void sent.then(() => { done = true });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(sent).resolves.toEqual(thrown);
  });

  describe('after a reload', () => {
    const save = (session: object | string) =>
      sessionStorage.setItem('sentryReplaySession', typeof session === 'string' ? session : JSON.stringify(session));
    const minutesAgo = (minutes: number) => Date.now() - minutes * 60 * 1000;

    it('carries on a replay this tab was recording', async () => {
      save({ id: 'r', segmentId: 3, started: minutesAgo(20), lastActivity: minutesAgo(1) });
      await instrument();
      await settle();
      expect(sentry.addIntegration).toHaveBeenCalledExactlyOnceWith(integration);
    });

    it.each([
      ['buffering only, never sent', { segmentId: 0, started: minutesAgo(5), lastActivity: minutesAgo(1) }],
      ['idle too long', { segmentId: 3, started: minutesAgo(30), lastActivity: minutesAgo(16) }],
      ['past replay\'s hour', { segmentId: 3, started: minutesAgo(61), lastActivity: minutesAgo(1) }],
      ['unreadable', '{not json'],
    ])('starts nothing for a stored session %s', async (_, session) => {
      save(session);
      await instrument();
      await settle();
      expect(lazy.replayIntegration).not.toHaveBeenCalled();
    });

    it('starts nothing without a DSN', async () => {
      dsn.value = undefined;
      save({ segmentId: 3, started: minutesAgo(5), lastActivity: minutesAgo(1) });
      await instrument();
      await settle();
      expect(lazy.replayIntegration).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdk = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
// How often the SDK's module was fetched, failing or not.
const fetched = vi.hoisted(() => ({ count: 0 }));
const online = () => {
  fetched.count++;
  return sdk;
};
const offline = () => {
  fetched.count++;
  throw new Error('offline');
};
vi.mock('../instrument', () => online());

const DSN = 'https://key@o1.ingest.sentry.io/1';
const ONERROR = { mechanism: { handled: false, type: 'auto.browser.global_handlers.onerror' } };
const ONREJECTION = { mechanism: { handled: false, type: 'auto.browser.global_handlers.onunhandledrejection' } };

/** A fresh client/sentry.ts: its queue and listeners are the module's own. */
async function fresh() {
  vi.resetModules();
  return import('../client/sentry');
}

/** Lets the SDK's import, and what runs after it, settle. */
const settle = () => vi.dynamicImportSettled();

const uncaught = (error: unknown, message = '') => window.dispatchEvent(new ErrorEvent('error', { error, message }));
const rejected = (reason: unknown) => window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }));

describe('client/sentry', () => {
  // Every listener a test adds and doesn't take off itself, taken off after
  // it, so one test's module never sees the next one's events.
  const added = new Set<[string, EventListenerOrEventListenerObject]>();
  let idle: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    idle = undefined;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      added.add([type, listener]);
      add(type, listener, options);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
      for (const entry of added) if (entry[0] === type && entry[1] === listener) added.delete(entry);
      remove(type, listener);
    });
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => { idle = callback; return 1 }));
  });

  afterEach(() => {
    for (const [type, listener] of added) window.removeEventListener(type, listener);
    vi.doMock('../instrument', online);
    fetched.count = 0;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads the SDK once the browser is idle, not before', async () => {
    const { startSentry, captureMessage } = await fresh();
    startSentry(DSN);
    expect(window.requestIdleCallback).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { timeout: 3000 });
    await settle();
    expect(fetched.count).toBe(0);
    idle!();
    await settle();
    // In: a report goes straight through.
    captureMessage('after');
    expect(sdk.captureMessage).toHaveBeenCalledExactlyOnceWith('after', undefined);
  });

  it('without requestIdleCallback, loads it a few seconds on', async () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    let later: (() => void) | undefined;
    const timeout = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      later = callback;
      return 0;
    }) as typeof setTimeout);
    const { startSentry, captureMessage } = await fresh();
    startSentry(DSN);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 3000);
    timeout.mockRestore();
    later!();
    await settle();
    captureMessage('after');
    expect(sdk.captureMessage).toHaveBeenCalledExactlyOnceWith('after', undefined);
  });

  it('sends what was reported before the SDK came, in order, once it does, and then straight away', async () => {
    const { startSentry, captureException, captureMessage } = await fresh();
    startSentry(DSN);
    const boom = new Error('boom');
    captureException(boom, { tags: { slug: 'catan' } });
    captureMessage('dictionary unreachable', { level: 'warning' });
    expect(sdk.captureException).not.toHaveBeenCalled();
    await settle();
    expect(sdk.captureException).toHaveBeenCalledExactlyOnceWith(boom, { tags: { slug: 'catan' } });
    expect(sdk.captureMessage).toHaveBeenCalledExactlyOnceWith('dictionary unreachable', { level: 'warning' });
    expect(sdk.captureException.mock.invocationCallOrder[0]).toBeLessThan(sdk.captureMessage.mock.invocationCallOrder[0]);

    captureMessage('later');
    expect(sdk.captureMessage).toHaveBeenLastCalledWith('later', undefined);
  });

  it('reports an uncaught error or rejection from before the SDK came as unhandled', async () => {
    const { startSentry } = await fresh();
    startSentry(DSN);
    const thrown = new TypeError('x is undefined');
    uncaught(thrown, 'x is undefined');
    uncaught(undefined, 'Script error.');
    rejected('no reason');
    await settle();
    expect(sdk.captureException.mock.calls).toEqual([
      [thrown, ONERROR],
      ['Script error.', ONERROR],
      ['no reason', ONREJECTION],
    ]);
  });

  it('leaves uncaught errors to the SDK once it is in', async () => {
    const { startSentry, captureMessage } = await fresh();
    startSentry(DSN);
    captureMessage('load it');
    await settle();
    // Standing in for the SDK's own handler.
    const handler = vi.fn();
    window.addEventListener('error', handler);
    uncaught(new Error('later'));
    rejected(new Error('later'));
    expect(handler).toHaveBeenCalledOnce();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('keeps what was reported when the SDK fails to load, and tries again on a report 10 s on, not sooner', async () => {
    vi.doMock('../instrument', offline);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { startSentry, captureMessage } = await fresh();
    startSentry(DSN);
    captureMessage('first');
    await settle();
    expect(fetched.count).toBe(1);

    // An error repeating every frame fetches nothing more for a while.
    vi.doMock('../instrument', online);
    now.mockReturnValue(1_009_999);
    for (let i = 0; i < 5; i++) uncaught(new Error('every frame'));
    await settle();
    expect(fetched.count).toBe(1);
    expect(sdk.captureMessage).not.toHaveBeenCalled();

    now.mockReturnValue(1_010_000);
    captureMessage('second');
    await settle();
    expect(fetched.count).toBe(2);
    expect(sdk.captureMessage.mock.calls).toEqual([['first', undefined], ['second', undefined]]);
    expect(sdk.captureException).toHaveBeenCalledTimes(5);
  });

  it('keeps the first 20 reports while the SDK is not in, and drops any after', async () => {
    vi.doMock('../instrument', offline);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { startSentry, captureMessage } = await fresh();
    startSentry(DSN);
    for (let i = 0; i < 25; i++) captureMessage(`report ${i}`);
    await settle();

    vi.doMock('../instrument', online);
    now.mockReturnValue(1_010_000);
    captureMessage('late');
    await settle();
    expect(sdk.captureMessage.mock.calls.map(([message]) => message)).toEqual(Array.from({ length: 20 }, (_, i) => `report ${i}`));
  });

  it('starts once, however often it is called', async () => {
    const { startSentry } = await fresh();
    startSentry(DSN);
    startSentry(DSN);
    expect(window.requestIdleCallback).toHaveBeenCalledOnce();
    uncaught(new Error('once'));
    await settle();
    expect(sdk.captureException).toHaveBeenCalledOnce();
  });

  it('without a DSN, loads nothing, catches nothing and drops every report', async () => {
    const { startSentry, captureException, captureMessage } = await fresh();
    startSentry(undefined);
    startSentry('');
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(window.addEventListener).not.toHaveBeenCalled();
    captureException(new Error('dropped'));
    captureMessage('dropped');
    await settle();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.captureMessage).not.toHaveBeenCalled();
  });

  it('reads the DSN from the build by default', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const { startSentry } = await fresh();
    startSentry();
    expect(window.requestIdleCallback).toHaveBeenCalledOnce();
  });
});

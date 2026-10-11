import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NO_REPLY_MS, RECHECK_MS, useOfflineSave } from '../hooks/useOfflineSave';
import type { SaveState } from '../pdfjs/saved';

// Pandemic's 16 MB waits for Save for offline; Azul's 1.5 MB saves itself (public/rules).
const LARGE = '/rules/pandemic.pdf';
const SMALL = '/rules/azul.pdf';

type Say = (state: SaveState) => void;
/** How the fake worker answers a message: each state at once, or a function given the port to answer on later; null answers nothing. */
type Answer = SaveState[] | ((say: Say) => void) | null;

/**
 * A service worker in charge of the page (or not yet, `controlling` false),
 * which answers a question about a rulebook with `asked(path, save)`.
 */
function serviceWorker(asked: (path: string, save: boolean) => Answer = () => ['unsaved'], controlling = true) {
  const postMessage = vi.fn((message: { path: string; save: boolean }, [port]: Transferable[]) => {
    const say = (state: SaveState) => (port as MessagePort).postMessage({ path: message.path, state });
    const answer = asked(message.path, message.save);
    if (typeof answer === 'function') answer(say);
    else answer?.forEach(say);
  });
  const container = Object.assign(new EventTarget(), { controller: controlling ? { postMessage } : null });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  return {
    postMessage,
    asks: () => postMessage.mock.calls.map(([m]) => `${m.path} ${m.save ? 'save' : 'ask'}`),
    /** Takes charge of the page, as a first visit's worker does with clients.claim(). */
    claim: () => act(() => {
      container.controller = { postMessage };
      container.dispatchEvent(new Event('controllerchange'));
    }),
  };
}

/** Lets the worker's answers through: they come over a MessagePort. */
const answers = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));

function hook(pdf: string, saved: boolean | 'asking' = false, online = true) {
  return renderHook((p: { pdf: string; saved: boolean | 'asking'; online: boolean }) => useOfflineSave(p.pdf, p.saved, p.online), {
    initialProps: { pdf, saved, online },
  });
}

afterEach(() => {
  vi.useRealTimers();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  delete (navigator as { storage?: unknown }).storage;
});

describe('useOfflineSave', () => {
  it('offers nothing without a service worker, which would save nothing', () => {
    const { result } = hook(LARGE);
    expect(result.current.state).toBeNull();
  });

  it('starts a large rulebook at Save for offline, asks the worker only where it stands, and takes its word', async () => {
    const sw = serviceWorker(() => ['saved']);
    const { result } = hook(LARGE);
    expect(result.current).toMatchObject({ state: 'unsaved', hidden: false });
    expect(sw.asks()).toEqual([`${LARGE} ask`]);
    await answers();
    expect(result.current.state).toBe('saved');
  });

  it('starts a small rulebook at Saving… and asks the worker to save it, as opening it does', async () => {
    let finish: Say = () => {};
    const sw = serviceWorker(() => (say) => { say('saving'); finish = say; });
    const { result } = hook(SMALL);
    expect(result.current.state).toBe('saving');
    expect(sw.asks()).toEqual([`${SMALL} save`]);
    await answers();
    expect(result.current.state).toBe('saving');
    finish('saved');
    await answers();
    expect(result.current.state).toBe('saved');
  });

  it('holds its place unseen until the page\'s saved check answers, and asks nothing meanwhile', () => {
    const sw = serviceWorker();
    const { result, rerender } = hook(LARGE, 'asking');
    expect(result.current).toMatchObject({ state: 'unsaved', hidden: true });
    expect(sw.postMessage).not.toHaveBeenCalled();
    rerender({ pdf: LARGE, saved: true, online: true });
    expect(result.current).toMatchObject({ state: 'saved', hidden: false });
    expect(sw.postMessage).not.toHaveBeenCalled();
  });

  it('says Saved offline of a saved rulebook, and nothing of one that isn\'t', () => {
    const sw = serviceWorker();
    const { result, rerender } = hook(LARGE, true, false);
    expect(result.current.state).toBe('saved');
    rerender({ pdf: LARGE, saved: false, online: false });
    expect(result.current.state).toBeNull();
    expect(sw.postMessage).not.toHaveBeenCalled();
  });

  it('shows nothing once a worker answers nothing in time, an older one that knows no such message', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    let late: Say = () => {};
    serviceWorker(() => (say) => { late = say; });
    const { result } = hook(LARGE);
    act(() => vi.advanceTimersByTime(NO_REPLY_MS - 1));
    expect(result.current.state).toBe('unsaved');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state).toBeNull();
    // One that answers after all is heard.
    late('unsaved');
    await answers();
    expect(result.current.state).toBe('unsaved');
  });

  it('keeps an answer that came in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    serviceWorker(() => ['unsaved']);
    const { result } = hook(LARGE);
    await answers();
    act(() => vi.advanceTimersByTime(NO_REPLY_MS * 2));
    expect(result.current.state).toBe('unsaved');
  });

  it('asks again while saving, and a worker restarted mid-save, which never says how it ended, puts it right', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // The first worker says it is saving and is stopped; the next knows of no save.
    const sw = serviceWorker((_path, save) => (save ? ['saving'] : ['unsaved']));
    const { result } = hook(LARGE);
    await answers();
    act(() => result.current.save());
    await answers();
    expect(result.current.state).toBe('saving');
    act(() => vi.advanceTimersByTime(RECHECK_MS - 1));
    expect(sw.asks()).toEqual([`${LARGE} ask`, `${LARGE} save`]);
    act(() => vi.advanceTimersByTime(1));
    expect(sw.asks()).toEqual([`${LARGE} ask`, `${LARGE} save`, `${LARGE} ask`]);
    await answers();
    expect(result.current.state).toBe('unsaved');
    // Asked no more once it isn't saving.
    act(() => vi.advanceTimersByTime(RECHECK_MS * 3));
    expect(sw.asks()).toHaveLength(3);
  });

  it('asks again while saving as the page comes back into view, and hears a save finished meanwhile', async () => {
    const sw = serviceWorker((_path, save) => (save ? ['saving'] : ['saved']));
    const { result } = hook(SMALL);
    await answers();
    expect(result.current.state).toBe('saving');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sw.asks()).toEqual([`${SMALL} save`]);
    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(sw.asks()).toEqual([`${SMALL} save`, `${SMALL} ask`]);
    await answers();
    expect(result.current.state).toBe('saved');
  });

  it('comes in as a first visit\'s worker takes charge of the page', async () => {
    const sw = serviceWorker(() => ['saving', 'saved'], false);
    const { result } = hook(SMALL);
    expect(result.current.state).toBeNull();
    sw.claim();
    expect(result.current.state).toBe('saving');
    expect(sw.asks()).toEqual([`${SMALL} save`]);
    await answers();
    expect(result.current.state).toBe('saved');
  });

  it('saves on a tap, asking once for the site\'s storage to be kept, failures and all', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('no'));
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
    const sw = serviceWorker((_path, save) => (save ? ['saving', 'failed'] : ['unsaved']));
    const { result } = hook(LARGE);
    await answers();
    act(() => result.current.save());
    expect(result.current.state).toBe('saving');
    await answers();
    expect(result.current.state).toBe('failed');
    act(() => result.current.save());
    await answers();
    expect(sw.asks()).toEqual([`${LARGE} ask`, `${LARGE} save`, `${LARGE} save`]);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('saves without asking to keep storage where the browser can\'t', async () => {
    Object.defineProperty(navigator, 'storage', { value: {}, configurable: true });
    serviceWorker((_path, save) => (save ? ['saving', 'full'] : ['unsaved']));
    const { result } = hook(LARGE);
    await answers();
    act(() => result.current.save());
    await answers();
    expect(result.current.state).toBe('full');
  });

  it('does nothing on a tap with no worker in charge', () => {
    const { result } = hook(LARGE);
    act(() => result.current.save());
    expect(result.current.state).toBeNull();
  });

  it('keeps what each tab\'s rulebook was said to be', async () => {
    serviceWorker((path) => [path === LARGE ? 'saved' : 'unsaved']);
    const { result, rerender } = hook(LARGE);
    await answers();
    expect(result.current.state).toBe('saved');
    rerender({ pdf: '/rules/7-wonders.pdf', saved: false, online: true });
    await answers();
    expect(result.current.state).toBe('unsaved');
    rerender({ pdf: LARGE, saved: false, online: true });
    expect(result.current.state).toBe('saved');
  });
});

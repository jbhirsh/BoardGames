import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from '../hooks/useWakeLock';

type FakeSentinel = EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> };

/** A screen wake lock stand-in: each grant is a sentinel the test can see released. */
function fakeWakeLock() {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const sentinel: FakeSentinel = Object.assign(new EventTarget(), {
      released: false,
      release: vi.fn(async () => drop(sentinel)),
    });
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return { request, sentinels };
}

/** Lets a lock go as the browser does, whoever asked: once, with a `release` event. */
function drop(sentinel: FakeSentinel) {
  if (sentinel.released) return;
  sentinel.released = true;
  sentinel.dispatchEvent(new Event('release'));
}

let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

// Lets the request's promise settle.
const settle = () => act(async () => {});

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
  visibility = 'visible';
});

describe('useWakeLock', () => {
  it('does nothing where the browser has no wake lock', () => {
    expect('wakeLock' in navigator).toBe(false);
    const add = vi.spyOn(document, 'addEventListener');
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    expect(add).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    add.mockRestore();
  });

  it('asks for the screen lock on mount and lets it go on unmount', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinels[0].release).not.toHaveBeenCalled();

    unmount();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it('lets the lock go when it turns inactive, and asks again when it turns back', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await settle();
    rerender({ active: false });
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    rerender({ active: true });
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks nothing while inactive', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    await settle();
    setVisibility('visible');
    await settle();
    expect(request).not.toHaveBeenCalled();
  });

  it('asks again when the page comes back, after the browser dropped the lock', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();

    // Hiding the page releases the lock; nothing is asked while hidden.
    visibility = 'hidden';
    drop(sentinels[0]);
    setVisibility('hidden');
    await settle();
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps a lock it still holds rather than asking twice', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    // A visibilitychange while the first request is in flight, and another after.
    setVisibility('visible');
    await settle();
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('waits for the page to be visible before asking', async () => {
    visibility = 'hidden';
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();
    expect(request).not.toHaveBeenCalled();
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('lets go of a lock granted after unmount', async () => {
    const { sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    await settle();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    unmount();
    drop(sentinels[0]);
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('asks again when the system drops the lock while the page is in view', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();

    // Battery saver, say, lets the lock go with the page still showing.
    drop(sentinels[0]);
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(sentinels[1].released).toBe(false);

    // And again, for a lock it had asked for again.
    drop(sentinels[1]);
    await settle();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('asks once after a drop when that ask is refused, then waits for the next visit', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();

    request.mockRejectedValueOnce(new DOMException('Battery saver', 'NotAllowedError'));
    drop(sentinels[0]);
    await settle();
    await settle();
    expect(request).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('does not ask again for the lock it lets go of on unmount', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    unmount();
    await settle();
    expect(sentinels[0].released).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask again for the lock it lets go of when it turns inactive', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await settle();
    rerender({ active: false });
    await settle();
    expect(sentinels[0].released).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shrugs off a refused request and tries again on the next visit', async () => {
    const { request } = fakeWakeLock();
    request.mockRejectedValueOnce(new DOMException('Battery saver', 'NotAllowedError'));
    renderHook(() => useWakeLock(true));
    await settle();
    setVisibility('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shrugs off a failed release', async () => {
    const { sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    sentinels[0].release.mockRejectedValueOnce(new Error('gone'));
    unmount();
    await settle();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });
});

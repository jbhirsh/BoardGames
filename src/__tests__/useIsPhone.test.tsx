import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsPhone } from '../hooks/useIsPhone';

/** A matchMedia stand-in whose answer the test can flip, firing 'change'. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    get matches() { return matches; },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useIsPhone', () => {
  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useIsPhone()).result.current).toBe(false);
  });

  it('asks for the stylesheet phone width and follows changes', () => {
    const media = stubMatchMedia(true);
    const { result, unmount } = renderHook(() => useIsPhone());
    expect(media.matchMedia).toHaveBeenCalledWith('(max-width: 520px)');
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

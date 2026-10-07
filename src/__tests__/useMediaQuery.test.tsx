import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../hooks/useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(false);
  });

  it('answers the query and follows its changes', () => {
    let matches = true;
    const listeners = new Set<() => void>();
    const matchMedia = vi.fn(() => ({
      get matches() { return matches; },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 720px)'));
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 720px)');
    expect(result.current).toBe(true);

    act(() => { matches = false; listeners.forEach((fn) => fn()); });
    expect(result.current).toBe(false);

    unmount();
    expect(listeners.size).toBe(0);
  });
});

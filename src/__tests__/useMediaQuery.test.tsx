import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { stubMatchMedia } from './helpers/stubMatchMedia';

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(pointer: coarse)')).result.current).toBe(false);
  });

  it('answers the query and follows its changes', () => {
    const media = stubMatchMedia(true);

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 720px)'));
    expect(media.matchMedia).toHaveBeenCalledWith('(max-width: 720px)');
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});

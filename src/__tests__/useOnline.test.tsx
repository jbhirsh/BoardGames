import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useOnline } from '../hooks/useOnline';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOnline', () => {
  it('says what the browser says, and follows its online and offline events', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useOnline());
    expect(result.current).toBe(false);

    onLine.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);

    onLine.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);

    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('counts as online when rendered without a browser', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    function Probe() {
      return <p>{useOnline() ? 'online' : 'offline'}</p>;
    }
    expect(renderToString(<Probe />)).toBe('<p>online</p>');
  });
});

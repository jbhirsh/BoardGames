import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useStickyOffset } from '../hooks/useStickyOffset';

describe('useClickOutside', () => {
  it('calls handler when clicking outside the ref element', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);

    const ref = { current: div };
    renderHook(() => useClickOutside(ref, handler));

    const outside = new MouseEvent('mousedown', { bubbles: true });
    document.dispatchEvent(outside);
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(div);
  });

  it('does not call handler when clicking inside the ref element', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);

    const ref = { current: div };
    renderHook(() => useClickOutside(ref, handler));

    const inside = new MouseEvent('mousedown', { bubbles: true });
    div.dispatchEvent(inside);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does nothing when ref is null', () => {
    const handler = vi.fn();
    const ref = { current: null };
    renderHook(() => useClickOutside(ref, handler));

    const event = new MouseEvent('mousedown', { bubbles: true });
    document.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useStickyOffset', () => {
  it('creates a ResizeObserver, sets CSS var on resize, and cleans up on unmount', () => {
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    let capturedCb: ResizeObserverCallback | undefined;

    const OriginalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class MockResizeObserver {
      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = disconnectSpy;
      constructor(cb: ResizeObserverCallback) {
        capturedCb = cb;
      }
    } as unknown as typeof ResizeObserver;

    const div = document.createElement('div');
    const ref = { current: div };

    const { unmount } = renderHook(() => useStickyOffset(ref));
    // Border box, not content box: the offset must include the bar's padding
    // and bottom border or the sticky <thead> hides behind it.
    expect(observeSpy).toHaveBeenCalledWith(div, { box: 'border-box' });

    capturedCb!(
      [{ borderBoxSize: [{ blockSize: 42, inlineSize: 300 }], target: div } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(document.documentElement.style.getPropertyValue('--thead-top')).toBe('42px');

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();

    globalThis.ResizeObserver = OriginalRO;
  });

  it('falls back to the bounding rect when borderBoxSize is unavailable', () => {
    let capturedCb: ResizeObserverCallback | undefined;

    const OriginalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        capturedCb = cb;
      }
    } as unknown as typeof ResizeObserver;

    const div = document.createElement('div');
    div.getBoundingClientRect = () => ({ height: 91 }) as DOMRect;
    const ref = { current: div };

    renderHook(() => useStickyOffset(ref));

    capturedCb!(
      [{ target: div } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
    expect(document.documentElement.style.getPropertyValue('--thead-top')).toBe('91px');

    globalThis.ResizeObserver = OriginalRO;
  });

  it('does nothing when ref is null', () => {
    const observeSpy = vi.fn();

    const OriginalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class MockResizeObserver {
      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor() {}
    } as unknown as typeof ResizeObserver;

    const ref = { current: null };
    renderHook(() => useStickyOffset(ref));
    expect(observeSpy).not.toHaveBeenCalled();

    globalThis.ResizeObserver = OriginalRO;
  });
});

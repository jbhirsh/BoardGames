import { vi } from 'vitest';

/**
 * Stands in for ResizeObserver, which jsdom lacks: `resize(width)` tells the
 * last observed element's observer its content box is now `width` wide, as
 * `useNarrow` reads it. Undone by vi.unstubAllGlobals().
 */
export function stubResizeObserver(): { resize: (width: number) => void } {
  let resize: ((width: number) => void) | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        resize = (width) =>
          this.cb(
            [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  return {
    resize: (width) => {
      if (!resize) throw new Error('Nothing is observed yet');
      resize(width);
    },
  };
}

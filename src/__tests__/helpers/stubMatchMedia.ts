import { vi } from 'vitest';

type Answer = boolean | ((query: string) => boolean);

/**
 * Stands in for window.matchMedia, which jsdom lacks: each query matches as
 * `answer` says, the same for every query or by the query. `set` changes
 * the answer and tells every listener, as a resize or a changed setting
 * does. Undone by vi.unstubAllGlobals().
 */
export function stubMatchMedia(answer: Answer) {
  let matches = typeof answer === 'function' ? answer : () => answer;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() { return matches(query); },
    addEventListener: (_type: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_type: string, fn: () => void) => { listeners.delete(fn); },
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: Answer) {
      matches = typeof next === 'function' ? next : () => next;
      listeners.forEach((fn) => fn());
    },
  };
}

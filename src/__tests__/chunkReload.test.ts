import { describe, it, expect, vi } from 'vitest';
import { chunkLoaded, isChunkLoadError, mayReload, reloadOnce, RELOAD_KEY, type Session } from '../utils/chunkReload';

/** A sessionStorage stand-in. */
function store(): Session {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
  return () => storage;
}
const blocked: Session = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://game-room.example/assets/ScoreCalculatorPage-abc.js',
    'error loading dynamically imported module: https://game-room.example/assets/RulesPage-abc.js',
    'Importing a module script failed.',
  ])('knows each browser\'s word for a page\'s code that won\'t load: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('takes no other error for one', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x.js'))).toBe(false);
    expect(isChunkLoadError(new Response('', { status: 404 }))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadOnce', () => {
  it('reloads once a session, until a page\'s code loads', () => {
    const session = store();
    const reload = vi.fn();
    expect(mayReload(session)).toBe(true);
    expect(reloadOnce(session, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(session().getItem(RELOAD_KEY)).not.toBeNull();

    // The reloaded page fails too: no second reload.
    expect(mayReload(session)).toBe(false);
    expect(reloadOnce(session, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    // A page's code loaded: the next failure may reload again.
    chunkLoaded(session);
    expect(mayReload(session)).toBe(true);
    expect(reloadOnce(session, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never reloads without storage to count in', () => {
    const reload = vi.fn();
    expect(mayReload(blocked)).toBe(false);
    expect(reloadOnce(blocked, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(() => chunkLoaded(blocked)).not.toThrow();
  });
});

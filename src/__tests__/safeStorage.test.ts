import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSafeStorage, safeSessionStorage, safeStorage } from '../client/safeStorage';

const denied = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads, writes and removes in localStorage', () => {
    expect(safeStorage.get('k')).toBeNull();
    expect(safeStorage.set('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
    expect(safeStorage.get('k')).toBe('v');
    safeStorage.remove('k');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('keeps the session store apart from localStorage', () => {
    expect(safeSessionStorage.set('k', 'session')).toBe(true);
    expect(sessionStorage.getItem('k')).toBe('session');
    expect(localStorage.getItem('k')).toBeNull();
    expect(safeSessionStorage.get('k')).toBe('session');
    safeSessionStorage.remove('k');
    expect(sessionStorage.getItem('k')).toBeNull();
  });

  it('reads nothing and stores nothing where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
    expect(safeStorage.get('k')).toBeNull();
    expect(safeStorage.set('k', 'v')).toBe(false);
    expect(() => safeStorage.remove('k')).not.toThrow();
  });

  it('says a value was not stored when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(safeStorage.set('k', 'v')).toBe(false);
    expect(safeStorage.get('k')).toBeNull();
  });

  it('copes with a store that throws when reached, as some private modes do', () => {
    const store = createSafeStorage(denied);
    expect(store.get('k')).toBeNull();
    expect(store.set('k', 'v')).toBe(false);
    expect(() => store.remove('k')).not.toThrow();
  });

  it('copes with no store at all', () => {
    const store = createSafeStorage(() => undefined as unknown as Storage);
    expect(store.get('k')).toBeNull();
    expect(store.set('k', 'v')).toBe(false);
    expect(() => store.remove('k')).not.toThrow();
  });
});

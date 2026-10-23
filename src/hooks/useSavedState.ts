import { useEffect, useState } from 'react';
import { safeStorage } from '../client/safeStorage';

/**
 * State kept in localStorage as JSON under `key`, so a score pad's choice
 * for the whole table (the map played, the Kingdom) survives a reload with
 * the game. `read` turns what's stored into a value, or null for anything
 * it doesn't recognise, which falls back to `initial`. `chosen`, when
 * given, wins over what's stored (a link that opens the pad set for
 * something). Where storage is unavailable it's ordinary state.
 */
export function useSavedState<T>(
  key: string,
  initial: T,
  read: (stored: unknown) => T | null,
  chosen: T | null = null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (chosen !== null) return chosen;
    try {
      return read(JSON.parse(safeStorage.get(key) ?? 'null')) ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    safeStorage.set(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

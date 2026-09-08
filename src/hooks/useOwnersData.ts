import { useCallback, useEffect, useRef, useState } from 'react';
import { getAnonId } from './useWishlistVotes';

const NAME_KEY = 'gameroom:name';

/** The display name this browser has chosen for "I own this", if any. */
export function getDisplayName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode); the name just isn't remembered.
  }
}

export interface OwnersSnapshot {
  /** Display names of everyone who marked each item as owned, sorted. */
  owners: Record<string, string[]>;
  /** Items this browser has marked as owned. */
  mine: Set<string>;
  loaded: boolean;
}

export interface OwnersData extends OwnersSnapshot {
  /** Flip ownership of `itemId` for this browser, recorded under `name`. Resolves false if the server refused. */
  toggle: (itemId: string, name: string) => Promise<boolean>;
}

const EMPTY_SNAPSHOT: OwnersSnapshot = { owners: {}, mine: new Set(), loaded: true };

/** /api/owners accepts at most this many ids per request (MAX_IDS in api/_lib/ids.ts). */
export const OWNERS_BATCH = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Loads ownership for any number of ids, one request per batch, merged. */
async function fetchOwners(ids: readonly string[], anonId: string, signal: AbortSignal): Promise<OwnersSnapshot> {
  const owners: Record<string, string[]> = {};
  const mine = new Set<string>();
  for (const batch of chunk(ids, OWNERS_BATCH)) {
    const url = `/api/owners?ids=${encodeURIComponent(batch.join(','))}&anonId=${encodeURIComponent(anonId)}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`owners request failed (${r.status})`);
    const data: { owners?: Record<string, string[]>; mine?: string[] } = await r.json();
    Object.assign(owners, data.owners ?? {});
    for (const id of data.mine ?? []) mine.add(id);
  }
  return { owners, mine, loaded: true };
}

/**
 * Loads who owns each of `itemIds` and exposes an optimistic `toggle`. Same
 * contract as useWishlistVotes: `itemIds` is stable for the hook's lifetime.
 */
export function useOwnersData(itemIds: readonly string[]): OwnersData {
  const [snapshot, setSnapshot] = useState<OwnersSnapshot>({
    owners: {},
    mine: new Set(),
    loaded: false,
  });
  const idsKey = itemIds.join(',');
  const inFlight = useRef<Set<string>>(new Set());
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    fetchOwners(idsKey.split(','), getAnonId(), controller.signal)
      .then(setSnapshot)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        // Ownership is decorative: the page still works, but say why it's empty.
        console.error('owners: could not load ownership', err);
        setSnapshot((s) => ({ ...s, loaded: true }));
      });
    return () => controller.abort();
  }, [idsKey]);

  const toggle = useCallback(async (itemId: string, name: string) => {
    if (inFlight.current.has(itemId)) return true;
    inFlight.current.add(itemId);

    const anonId = getAnonId();
    const wasMine = snapshotRef.current.mine.has(itemId);
    const own: 0 | 1 = wasMine ? 0 : 1;

    // Optimistic edit: add or remove exactly one occurrence of this name so
    // a friend who shares the name isn't dropped. The server's reply is the
    // authoritative list and replaces this on success.
    const apply = (s: OwnersSnapshot, owned: boolean): OwnersSnapshot => {
      const mine = new Set(s.mine);
      const names = [...(s.owners[itemId] ?? [])];
      if (owned) {
        mine.add(itemId);
        if (name) names.push(name);
      } else {
        mine.delete(itemId);
        const i = names.indexOf(name);
        if (i >= 0) names.splice(i, 1);
      }
      names.sort((a, b) => a.localeCompare(b));
      return { ...s, mine, owners: { ...s.owners, [itemId]: names } };
    };
    setSnapshot((s) => apply(s, own === 1));

    try {
      const r = await fetch('/api/owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, anonId, name, own }),
      });
      if (!r.ok) throw new Error('owners request failed');
      try {
        const data: { owners?: string[] } = await r.json();
        if (Array.isArray(data.owners)) {
          setSnapshot((s) => ({ ...s, owners: { ...s.owners, [itemId]: data.owners as string[] } }));
        }
      } catch {
        // Committed server-side; keep the optimistic state.
      }
      return true;
    } catch {
      setSnapshot((s) => apply(s, wasMine));
      return false;
    } finally {
      inFlight.current.delete(itemId);
    }
  }, []);

  return { ...(idsKey ? snapshot : EMPTY_SNAPSHOT), toggle };
}

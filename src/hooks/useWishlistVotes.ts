import { useCallback, useEffect, useRef, useState } from 'react';

const ANON_KEY = 'wishlist:anonId';

export function getAnonId(): string {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export interface VotesSnapshot {
  counts: Record<string, number>;
  myVotes: Set<string>;
  loaded: boolean;
}

interface UseWishlistVotesReturn extends VotesSnapshot {
  toggle: (itemId: string) => Promise<void>;
}

// With no ids there is nothing to fetch, so this fixed empty-but-loaded view is
// returned directly rather than written into state from the effect (which would
// trip react-hooks/set-state-in-effect).
const EMPTY_SNAPSHOT: VotesSnapshot = {
  counts: {},
  myVotes: new Set(),
  loaded: true,
};

/**
 * Loads vote counts for `itemIds` and exposes an optimistic `toggle`.
 *
 * `itemIds` is assumed to be stable for the hook's lifetime — the wishlist
 * renders a fixed `WISHLIST_IDS` set — so transitions between id sets are not a
 * supported use case. With no ids the hook returns an already-loaded empty
 * snapshot; the internal snapshot state is otherwise only replaced by a
 * completed fetch, never reset when `itemIds` changes.
 */
export function useWishlistVotes(itemIds: readonly string[]): UseWishlistVotesReturn {
  const [snapshot, setSnapshot] = useState<VotesSnapshot>({
    counts: {},
    myVotes: new Set(),
    loaded: false,
  });

  const idsKey = itemIds.join(',');
  const inFlight = useRef<Set<string>>(new Set());
  const snapshotRef = useRef(snapshot);

  // Keep the ref pointing at the latest committed snapshot so `toggle` (a stable
  // callback) always reads current vote state. Ref writes belong in an effect,
  // not the render body (react-hooks/refs).
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  useEffect(() => {
    if (!idsKey) return;
    const anonId = getAnonId();
    const controller = new AbortController();
    const url = `/api/votes?ids=${encodeURIComponent(idsKey)}&anonId=${encodeURIComponent(anonId)}`;

    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
      .then((data: { counts?: Record<string, number>; myVotes?: string[] }) => {
        setSnapshot({
          counts: data.counts ?? {},
          myVotes: new Set(data.myVotes ?? []),
          loaded: true,
        });
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setSnapshot((s) => ({ ...s, loaded: true }));
      });

    return () => controller.abort();
  }, [idsKey]);

  // `toggle` optimistically mutates the internal `snapshot`, which is only
  // returned while `itemIds` is non-empty (see the return below — the empty-ids
  // case yields the fixed EMPTY_SNAPSHOT). That is sound because an empty id set
  // renders no wishlist items, so there is no control from which to invoke
  // `toggle`; it is never called with no ids.
  const toggle = useCallback(async (itemId: string) => {
    if (inFlight.current.has(itemId)) return;
    inFlight.current.add(itemId);

    const anonId = getAnonId();
    const wasVoted = snapshotRef.current.myVotes.has(itemId);
    const nextVote: 0 | 1 = wasVoted ? 0 : 1;
    const delta = wasVoted ? -1 : 1;

    setSnapshot((s) => {
      const nextMy = new Set(s.myVotes);
      if (wasVoted) nextMy.delete(itemId); else nextMy.add(itemId);
      const nextCounts = { ...s.counts };
      nextCounts[itemId] = Math.max(0, (nextCounts[itemId] ?? 0) + delta);
      return { ...s, myVotes: nextMy, counts: nextCounts };
    });

    try {
      const r = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, anonId, vote: nextVote }),
      });
      if (!r.ok) throw new Error('vote request failed');
      try {
        const data: { count?: number } = await r.json();
        if (typeof data.count === 'number') {
          setSnapshot((s) => ({ ...s, counts: { ...s.counts, [itemId]: data.count as number } }));
        }
      } catch {
        // Body parse failed but the vote was committed server-side. Keep the optimistic state.
      }
    } catch {
      setSnapshot((s) => {
        const revMy = new Set(s.myVotes);
        if (wasVoted) revMy.add(itemId); else revMy.delete(itemId);
        const revCounts = { ...s.counts };
        revCounts[itemId] = Math.max(0, (revCounts[itemId] ?? 0) - delta);
        return { ...s, myVotes: revMy, counts: revCounts };
      });
    } finally {
      inFlight.current.delete(itemId);
    }
  }, []);

  return { ...(idsKey ? snapshot : EMPTY_SNAPSHOT), toggle };
}

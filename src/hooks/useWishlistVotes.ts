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

export function useWishlistVotes(itemIds: readonly string[]): UseWishlistVotesReturn {
  const [snapshot, setSnapshot] = useState<VotesSnapshot>({
    counts: {},
    myVotes: new Set(),
    loaded: false,
  });

  const idsKey = itemIds.join(',');
  const inFlight = useRef<Set<string>>(new Set());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (!idsKey) {
      setSnapshot({ counts: {}, myVotes: new Set(), loaded: true });
      return;
    }
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

  return { ...snapshot, toggle };
}

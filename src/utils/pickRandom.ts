// Falls back to pool[0] when all candidates equal `exclude` (including the pool-of-one case).
// `random` is the caller's Math.random, passed in so this stays pure.
export function pickRandom<T>(pool: readonly T[], exclude: T | undefined, random: () => number): T {
  if (pool.length === 0) throw new Error('pool empty');
  if (pool.length === 1) return pool[0];
  if (exclude === undefined) {
    return pool[Math.floor(random() * pool.length)];
  }
  const candidates = pool.filter((x) => x !== exclude);
  if (candidates.length === 0) return pool[0];
  return candidates[Math.floor(random() * candidates.length)];
}

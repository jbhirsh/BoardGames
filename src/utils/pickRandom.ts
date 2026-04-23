// When every item in the pool equals `exclude` (including the pool-of-one
// case), falls back to pool[0] rather than returning undefined.
export function pickRandom<T>(pool: readonly T[], exclude?: T): T {
  if (pool.length === 0) throw new Error('pool empty');
  if (pool.length === 1) return pool[0];
  if (exclude === undefined) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const candidates = pool.filter((x) => x !== exclude);
  if (candidates.length === 0) return pool[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

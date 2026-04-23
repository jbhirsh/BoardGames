export function pickRandom<T>(pool: readonly T[], exclude?: T): T {
  if (pool.length === 0) throw new Error('pool empty');
  if (pool.length === 1) return pool[0];
  if (exclude === undefined) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const candidates = pool.filter((x) => x !== exclude);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

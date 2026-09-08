import { Redis } from '@upstash/redis';

let cached: Redis | null = null;

/** The shared Upstash client, built once per function instance from the KV env vars. */
export function getRedis(): Redis {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  }
  cached = new Redis({ url, token });
  return cached;
}

/** Test seam: forget the cached client so env changes take effect. */
export function resetRedisForTests(): void {
  cached = null;
}

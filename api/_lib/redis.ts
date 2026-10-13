import { Redis } from '@upstash/redis';

let cached: Redis | null = null;
let cachedRaw: Redis | null = null;

function build(automaticDeserialization: boolean): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN must be set');
  }
  return new Redis({ url, token, automaticDeserialization });
}

/** The shared Upstash client, built once per function instance from the KV env vars. */
export function getRedis(): Redis {
  return (cached ??= build(true));
}

/**
 * A client that hands every value back exactly as stored. The default one
 * JSON-parses replies, so free text that happens to read as JSON (a game
 * called "null" or "true") comes back as something else. Without that step
 * HGETALL answers a flat [field, value, ...] list of strings, [] when the key
 * is missing.
 */
export function getRawRedis(): Redis {
  return (cachedRaw ??= build(false));
}

/** Test seam: forget the cached clients so env changes take effect. */
export function resetRedisForTests(): void {
  cached = null;
  cachedRaw = null;
}

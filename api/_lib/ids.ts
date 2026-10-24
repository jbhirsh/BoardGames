// Input-shape helpers for the votes (api/_resolvers/votes.ts), kept beside
// SLUG_RE so the anonymous browser id and the id list have one definition.
import { SLUG_RE } from './slug.js';

/** Anonymous browser id minted client-side (crypto.randomUUID or similar). */
export const ANON_RE = /^[a-zA-Z0-9-]{8,64}$/;

export const MAX_IDS = 100;

/** The ids asked for, or why they were refused. */
export type ParsedIds = { ok: true; ids: string[] } | { ok: false; error: string };

/** The ids asked for, as GraphQL hands them over: malformed ones dropped, at least one, at most MAX_IDS. */
export function parseIdList(raw: readonly string[]): ParsedIds {
  if (raw.length === 0) return { ok: false, error: 'ids is required' };
  const ids = raw.map((s) => s.trim()).filter((s) => SLUG_RE.test(s));
  if (ids.length === 0)
    return { ok: false, error: 'ids must contain at least one valid slug (lowercase alphanumeric + hyphens)' };
  if (ids.length > MAX_IDS) return { ok: false, error: `too many ids (max ${MAX_IDS})` };
  return { ok: true, ids };
}

/** The anon id, or null when absent or malformed. */
export function optionalAnonId(raw: unknown): string | null {
  return typeof raw === 'string' && ANON_RE.test(raw) ? raw : null;
}

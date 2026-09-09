// Request-shape helpers for the votes endpoint, kept beside SLUG_RE so the
// anonymous browser id and the comma-separated id list have one definition.
import { SLUG_RE } from './slug.js';

/** Anonymous browser id minted client-side (crypto.randomUUID or similar). */
export const ANON_RE = /^[a-zA-Z0-9-]{8,64}$/;

export const MAX_IDS = 100;

/** Parses `?ids=a,b,c`, dropping malformed slugs. Returns an error message or the ids. */
export type ParsedIds = { ok: true; ids: string[] } | { ok: false; error: string };

export function parseIds(raw: unknown): ParsedIds {
  const idsRaw = typeof raw === 'string' ? raw : '';
  if (idsRaw.length === 0) return { ok: false, error: 'ids query parameter is required' };
  const ids = idsRaw.split(',').map((s) => s.trim()).filter((s) => SLUG_RE.test(s));
  if (ids.length === 0) return { ok: false, error: 'ids must contain at least one valid slug (lowercase alphanumeric + hyphens)' };
  if (ids.length > MAX_IDS) return { ok: false, error: `too many ids (max ${MAX_IDS})` };
  return { ok: true, ids };
}

/** The anon id from a query string, or null when absent or malformed. */
export function optionalAnonId(raw: unknown): string | null {
  return typeof raw === 'string' && ANON_RE.test(raw) ? raw : null;
}

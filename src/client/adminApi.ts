// The owner's calls to the API. Every mutation is JSON, which is what the
// server's CSRF check requires, and every failure resolves to a message the
// form can show rather than throwing into React.

import type { LookupOutcome, PreviewDetails } from '../utils/lookupNotice';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
export const GENERIC_ERROR = 'Something went wrong. Try again in a minute.';

export type Outcome<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** One JSON request; a non-2xx answer or a network failure becomes a readable error. */
export async function callJson<T>(url: string, method: string, body: unknown): Promise<Outcome<T>> {
  try {
    const r = await fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) return { ok: false, error: data.error ?? GENERIC_ERROR };
    return { ok: true, data };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

const call = <T,>(method: string, body: unknown) => callJson<T>('/api/suggestions', method, body);

export interface PendingSuggestion {
  id: string;
  game: string;
  name: string;
  note: string;
}

export async function fetchPending(signal?: AbortSignal): Promise<PendingSuggestion[]> {
  const r = await fetch('/api/suggestions?action=pending', { signal });
  if (!r.ok) throw new Error('fetch failed');
  const data = (await r.json()) as { items?: PendingSuggestion[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** What an approval answers besides the item: how its BoardGameGeek lookup went. */
export interface LookedUp {
  lookup?: LookupOutcome;
}

export const decideSuggestion = (id: string, decision: 'approve' | 'deny') =>
  call<LookedUp>('POST', { decision, id });

export interface Preview {
  outcome: LookupOutcome;
  details?: PreviewDetails;
}

/** Looks a game up on BoardGameGeek without storing anything, for the add form to show. */
export const previewGame = (game: string) => call<Preview>('POST', { action: 'preview', game });

export interface AddGameInput {
  game: string;
  name: string;
  note: string;
  type: string | null;
  /** What the preview found, or null to add it without details. */
  details: PreviewDetails | null;
}

export const addGame = ({ game, name, note, type, details }: AddGameInput) => {
  // BGG's name for the match was for the owner to see; the entry keeps the typed one.
  const stored = details && {
    bggId: details.bggId, year: details.year, min: details.min, max: details.max,
    mins: details.mins, desc: details.desc, kw: details.kw, img: details.img,
  };
  return call('POST', { action: 'add', game, name, note, ...(type ? { type } : {}), details: stored });
};

export interface EditGameInput {
  id: string;
  game: string;
  details: { min: number; max: number; mins: number; desc: string; kw: string[]; type: string | null };
}

export const editGame = ({ id, game, details }: EditGameInput) => call('PATCH', { id, game, details });

export const removeGame = (id: string) => call('DELETE', { id });

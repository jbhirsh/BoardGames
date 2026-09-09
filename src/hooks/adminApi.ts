// The owner's calls to the API. Every mutation is JSON, which is what the
// server's CSRF check requires, and every failure resolves to a message the
// form can show rather than throwing into React.

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

export const decideSuggestion = (id: string, decision: 'approve' | 'deny') =>
  call('POST', { decision, id });

export interface AddGameInput {
  game: string;
  name: string;
  note: string;
  type: string | null;
}

export const addGame = ({ game, name, note, type }: AddGameInput) =>
  call('POST', { action: 'add', game, name, note, ...(type ? { type } : {}) });

export interface EditGameInput {
  id: string;
  game: string;
  details: { min: number; max: number; mins: number; desc: string; kw: string[]; type: string | null };
}

export const editGame = ({ id, game, details }: EditGameInput) => call('PATCH', { id, game, details });

export const removeGame = (id: string) => call('DELETE', { id });

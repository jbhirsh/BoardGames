import { useEffect, useId, useState, type FormEvent } from 'react';
import { WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { getDisplayName, setDisplayName } from '../hooks/useOwnersData';
import { useWishlistItems } from '../context/useWishlistItems';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';
import { addGame, decideSuggestion, fetchPending, type PendingSuggestion } from '../hooks/adminApi';

type Queue = { kind: 'loading' } | { kind: 'ready'; items: PendingSuggestion[] } | { kind: 'error' };

/** The pending suggestions, each with the same approve/deny choice the email offers. */
function PendingQueue() {
  const { reload } = useWishlistItems();
  const [queue, setQueue] = useState<Queue>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPending(controller.signal)
      .then((items) => setQueue({ kind: 'ready', items }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setQueue({ kind: 'error' });
      });
    return () => controller.abort();
  }, []);

  const decide = async (item: PendingSuggestion, decision: 'approve' | 'deny') => {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    const result = await decideSuggestion(item.id, decision);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQueue((q) => (q.kind === 'ready' ? { kind: 'ready', items: q.items.filter((i) => i.id !== item.id) } : q));
    if (decision === 'approve') reload();
  };

  return (
    <div className="admin-queue" aria-live="polite">
      <h4 className="admin-subtitle">Waiting for a decision</h4>
      {queue.kind === 'loading' && <p className="admin-muted">Loading…</p>}
      {queue.kind === 'error' && <p className="admin-muted">Couldn't load the queue. Reload the page to try again.</p>}
      {queue.kind === 'ready' && queue.items.length === 0 && <p className="admin-muted">Nothing waiting.</p>}
      {queue.kind === 'ready' && queue.items.length > 0 && (
        <ul className="admin-list">
          {queue.items.map((item) => (
            <li key={item.id} className="admin-item">
              <div className="admin-item-main">
                <span className="admin-item-game">{item.game}</span>
                <span className="admin-muted"> from {item.name}{item.note ? `: “${item.note}”` : ''}</span>
              </div>
              <div className="admin-actions">
                <button type="button" className="admin-btn" disabled={busy !== null} onClick={() => void decide(item, 'approve')}>
                  Approve {item.game}
                </button>
                <button type="button" className="admin-btn admin-btn--ghost" disabled={busy !== null} onClick={() => void decide(item, 'deny')}>
                  Deny {item.game}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}

type AddStatus = { kind: 'idle' } | { kind: 'sending' } | { kind: 'added'; game: string } | { kind: 'error'; message: string };

/** Adds a game straight to the wishlist, enriched from BoardGameGeek like an approved suggestion. */
function AddGameForm() {
  const { reload } = useWishlistItems();
  const [game, setGame] = useState('');
  const [name, setName] = useState(() => getDisplayName() ?? 'Jess');
  const [note, setNote] = useState('');
  const [type, setType] = useState<string>('strategy');
  const [status, setStatus] = useState<AddStatus>({ kind: 'idle' });
  const uid = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.kind === 'sending') return;
    const trimmedName = name.trim();
    if (!isValidDisplayName(trimmedName)) {
      setStatus({ kind: 'error', message: NAME_HINT });
      return;
    }
    setStatus({ kind: 'sending' });
    const result = await addGame({ game: game.trim(), name: trimmedName, note: note.trim(), type: type || null });
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setDisplayName(trimmedName);
    setStatus({ kind: 'added', game: game.trim() });
    setGame('');
    setNote('');
    reload();
  };

  return (
    <form className="admin-add" onSubmit={onSubmit} aria-labelledby={`${uid}-title`}>
      <h4 id={`${uid}-title`} className="admin-subtitle">Add a game</h4>
      <div className="suggest-fields">
        <label className="suggest-label" htmlFor={`${uid}-game`}>Game</label>
        <input id={`${uid}-game`} className="suggest-input" value={game} onChange={(e) => setGame(e.target.value)} required minLength={2} maxLength={80} placeholder="Ark Nova" />
        <label className="suggest-label" htmlFor={`${uid}-type`}>Section</label>
        <select id={`${uid}-type`} className="suggest-input" value={type} onChange={(e) => setType(e.target.value)}>
          {WISHLIST_SECTIONS.map((t) => <option key={t} value={t}>{WISHLIST_TYPES[t]}</option>)}
          <option value="">{WISHLIST_TYPES.suggested}</option>
        </select>
        <label className="suggest-label" htmlFor={`${uid}-name`}>Added by</label>
        <input id={`${uid}-name`} className="suggest-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
        <label className="suggest-label" htmlFor={`${uid}-note`}>Note <span className="suggest-opt">(optional)</span></label>
        <input id={`${uid}-note`} className="suggest-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Shows on the card in quotes" />
      </div>
      <div className="suggest-actions">
        <button type="submit" className="suggest-btn" disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Adding…' : 'Add to wishlist'}
        </button>
        <span className="suggest-status" role="status" aria-live="polite">
          {status.kind === 'added' && `${status.game} is on the wishlist.`}
          {status.kind === 'error' && status.message}
        </span>
      </div>
    </form>
  );
}

/** Everything the signed-in owner can do that isn't tied to one card. */
export default function AdminPanel() {
  return (
    <section className="admin-panel" aria-label="Owner tools">
      <h3 className="admin-title">Owner tools</h3>
      <PendingQueue />
      <AddGameForm />
    </section>
  );
}

import { useEffect, useId, useState, type FormEvent } from 'react';
import { KW, WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { GAME_MAX, GAME_MIN, NAME_MAX, NOTE_MAX } from '../data/suggestionLimits';
import { getDisplayName, setDisplayName } from '../client/displayName';
import { useWishlistItems } from '../context/useWishlistItems';
import { alreadyListed } from '../utils/alreadyListed';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';
import { lookupNotice, type LookupOutcome, type PreviewDetails } from '../utils/lookupNotice';
import { addGame, decideSuggestion, fetchPending, previewGame, type PendingSuggestion } from '../client/adminApi';
import AdminItemControls from './AdminItemControls';
import Notice from './Notice';

type Queue = { kind: 'loading' } | { kind: 'ready'; items: PendingSuggestion[] } | { kind: 'error' };

/** The pending suggestions, each with the same approve/deny choice the email offers. */
function PendingQueue() {
  const { reload } = useWishlistItems();
  const [queue, setQueue] = useState<Queue>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An approval whose BoardGameGeek lookup filled nothing in, said here
  // since the row it came from is gone.
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    const result = await decideSuggestion(item.id, decision);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQueue((q) => (q.kind === 'ready' ? { kind: 'ready', items: q.items.filter((i) => i.id !== item.id) } : q));
    if (decision === 'approve') {
      setNotice(lookupNotice(result.data.lookup, item.game, 'approved'));
      reload();
    }
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
      {/* The queue is a live region already, so the notice doesn't announce itself too. */}
      {notice && <Notice tone="warning" live={false}>{notice}</Notice>}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}

type AddStatus = { kind: 'idle' } | { kind: 'busy' } | { kind: 'added'; game: string } | { kind: 'error'; message: string };

/** A lookup's answer, kept for the name it was made for: typing another name sets it aside. */
interface Looked {
  game: string;
  outcome: LookupOutcome;
  details?: PreviewDetails;
}

const playersText = (min: number, max: number) => (min === max ? `${min}` : max >= 99 ? `${min}+` : `${min}–${max}`);

/** What BoardGameGeek has for the typed name, shown before anything is stored. */
function PreviewCard({ details }: { details: PreviewDetails }) {
  const facts = [`${playersText(details.min, details.max)} ${details.max === 1 ? 'player' : 'players'}`];
  if (details.mins > 0) facts.push(`${details.mins} min`);
  return (
    <div className="admin-preview">
      {details.img && <img className="admin-preview-art" src={details.img} alt="" width={64} height={64} />}
      <div className="admin-preview-main">
        <p className="admin-preview-name">
          {details.name}{details.year !== undefined && <span className="admin-muted"> ({details.year})</span>}
        </p>
        <p className="admin-muted">{facts.join(' · ')}</p>
        {details.desc && <p className="admin-preview-desc">{details.desc}</p>}
        {details.kw.length > 0 && (
          <ul className="admin-preview-kw" aria-label="Keywords">
            {details.kw.map((k) => <li key={k}>{KW[k as keyof typeof KW] ?? k}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Adds a game straight to the wishlist. The first press looks the name up
 * on BoardGameGeek and shows what it found (or a notice saying why it found
 * nothing) before anything is stored; the next adds it with those details,
 * or without any, to fill in with Edit.
 */
function AddGameForm() {
  const { reload } = useWishlistItems();
  const [game, setGame] = useState('');
  const [name, setName] = useState(() => getDisplayName() ?? 'Jess');
  const [note, setNote] = useState('');
  const [type, setType] = useState<string>('strategy');
  const [status, setStatus] = useState<AddStatus>({ kind: 'idle' });
  const [looked, setLooked] = useState<Looked | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const uid = useId();

  const typed = game.trim();
  const current = looked?.game === typed ? looked : null;
  const busy = status.kind === 'busy';

  const lookUp = async () => {
    setStatus({ kind: 'busy' });
    setLookingUp(true);
    const result = await previewGame(typed);
    setLookingUp(false);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setLooked({ game: typed, outcome: result.data.outcome, details: result.data.details });
    setStatus({ kind: 'idle' });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (!isValidDisplayName(trimmedName)) {
      setStatus({ kind: 'error', message: NAME_HINT });
      return;
    }
    // The server only compares against stored suggestions, so without this a
    // compiled-in game would be stored, hidden, and need removing again.
    const known = alreadyListed(game);
    if (known) {
      setStatus({ kind: 'error', message: known });
      return;
    }
    if (!current) {
      await lookUp();
      return;
    }
    setStatus({ kind: 'busy' });
    const result = await addGame({ game: typed, name: trimmedName, note: note.trim(), type: type || null, details: current.details ?? null });
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    setDisplayName(trimmedName);
    setStatus({ kind: 'added', game: typed });
    setGame('');
    setNote('');
    setLooked(null);
    reload();
  };

  const found = current?.details;
  const notice = current && !found ? lookupNotice(current.outcome, current.game, 'preview') : null;
  let label = 'Look up';
  if (busy) label = lookingUp ? 'Looking up…' : 'Adding…';
  else if (current) label = found ? 'Add to wishlist' : 'Add anyway';

  return (
    <form className="admin-add" onSubmit={onSubmit} aria-labelledby={`${uid}-title`}>
      <h4 id={`${uid}-title`} className="admin-subtitle">Add a game</h4>
      <div className="suggest-fields">
        <label className="suggest-label" htmlFor={`${uid}-game`}>Game</label>
        <input id={`${uid}-game`} className="suggest-input" value={game} onChange={(e) => setGame(e.target.value)} required minLength={GAME_MIN} maxLength={GAME_MAX} placeholder="Ark Nova" />
        <label className="suggest-label" htmlFor={`${uid}-type`}>Section</label>
        <select id={`${uid}-type`} className="suggest-input" value={type} onChange={(e) => setType(e.target.value)}>
          {WISHLIST_SECTIONS.map((t) => <option key={t} value={t}>{WISHLIST_TYPES[t]}</option>)}
          <option value="">{WISHLIST_TYPES.suggested}</option>
        </select>
        <label className="suggest-label" htmlFor={`${uid}-name`}>Added by</label>
        <input id={`${uid}-name`} className="suggest-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={NAME_MAX} />
        <label className="suggest-label" htmlFor={`${uid}-note`}>Note <span className="suggest-opt">(optional)</span></label>
        <input id={`${uid}-note`} className="suggest-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} placeholder="Shows on the card in quotes" />
      </div>
      {/* One live region for the lookup's answer, so the notice in it doesn't announce itself twice. */}
      <div aria-live="polite">
        {found && <PreviewCard details={found} />}
        {notice && <Notice tone="warning" live={false}>{notice}</Notice>}
      </div>
      <div className="suggest-actions">
        <button type="submit" className="suggest-btn" disabled={busy}>{label}</button>
        {current && !found && (
          <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => void lookUp()}>Look up again</button>
        )}
        <span className="suggest-status" role="status" aria-live="polite">
          {status.kind === 'added' && `${status.game} is on the wishlist.`}
          {status.kind === 'error' && status.message}
        </span>
      </div>
    </form>
  );
}

/**
 * Stored entries the wishlist leaves out because a compiled-in entry already
 * covers that game. Without this they would have no card, and so no controls:
 * invisible on the page but still returned by the API on every load.
 */
function HiddenDuplicates() {
  const { hidden } = useWishlistItems();
  if (hidden.length === 0) return null;
  return (
    <div className="admin-queue" aria-live="polite">
      <h4 className="admin-subtitle">Already on the wishlist</h4>
      <p className="admin-muted">
        {hidden.length === 1
          ? 'Stored entry for a game the wishlist already lists, so it is hidden from the page. Remove it to clear the record, or rename it if it is really a different game.'
          : 'Stored entries for games the wishlist already lists, so they are hidden from the page. Remove them to clear the records, or rename one if it is really a different game.'}
      </p>
      <ul className="admin-list">
        {hidden.map((item) => (
          <li key={item.id} className="admin-item">
            <div className="admin-item-main">
              <span className="admin-item-game">{item.name}</span>
              {item.suggestedBy && <span className="admin-muted"> from {item.suggestedBy}</span>}
            </div>
            <AdminItemControls item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everything the signed-in owner can do that isn't tied to one card. */
export default function AdminPanel() {
  return (
    <section className="admin-panel" aria-label="Owner tools">
      <h3 className="admin-title">Owner tools</h3>
      <PendingQueue />
      <HiddenDuplicates />
      <AddGameForm />
    </section>
  );
}

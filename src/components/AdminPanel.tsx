import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { GAME_MAX, GAME_MIN, NAME_MAX, NOTE_MAX } from '../data/suggestionLimits';
import { getDisplayName, setDisplayName } from '../client/displayName';
import { useWishlistItems } from '../context/useWishlistItems';
import { alreadyListed } from '../utils/alreadyListed';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';
import { lookupNotice, type LookupOutcome, type PreviewDetails } from '../utils/lookupNotice';
import {
  addGame,
  decideSuggestion,
  fetchPending,
  previewGame,
  type ApprovalChoice,
  type PendingSuggestion,
} from '../client/adminApi';
import AdminItemControls from './AdminItemControls';
import Notice from './Notice';
import PreviewCard from './PreviewCard';

type Queue = { kind: 'loading' } | { kind: 'ready'; items: PendingSuggestion[] } | { kind: 'error' };

type Decide = (item: PendingSuggestion, decision: 'approve' | 'deny', choice?: ApprovalChoice) => void;
/** Runs a task once the ones queued before it have settled. */
type InTurn = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * One pending suggestion: its name, editable so a misspelling can be put
 * right, what BoardGameGeek has for that name, and the approve/deny choice
 * the email offers. The friend's spelling is looked up as the row appears,
 * in turn with the other rows so a long queue doesn't fire a burst of
 * lookups; another name at once on request, or by Approve before it
 * approves, so an approval stores the details shown for the name it
 * stores. An approval sent while the lookup is still out, or after BGG
 * didn't answer, goes without details, and the server looks the game up
 * itself. Previews aren't announced: they arrive for every row on load.
 */
function QueueRow({
  item,
  busy,
  onDecide,
  inTurn,
}: {
  item: PendingSuggestion;
  busy: boolean;
  onDecide: Decide;
  inTurn: InTurn;
}) {
  const [game, setGame] = useState(item.game);
  const [looked, setLooked] = useState<Looked | null>(null);
  // The name a lookup is out for; the friend's from the start.
  const [lookingFor, setLookingFor] = useState<string | null>(item.game);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Sends a lookup (`queued`: once the rows before it have had theirs),
  // setting aside any still out or waiting, and keeps its answer unless a
  // newer one or unmounting has aborted it.
  const fetchPreview = useCallback(
    (name: string, queued = false) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const send = () => (controller.signal.aborted ? Promise.resolve(null) : previewGame(name, controller.signal));
      void (queued ? inTurn(send) : send()).then((result) => {
        if (!result || controller.signal.aborted) return;
        setLookingFor(null);
        if (result.ok) setLooked({ game: name, outcome: result.data.outcome, details: result.data.details });
        else setError(result.error);
      });
    },
    [inTurn],
  );

  useEffect(() => {
    fetchPreview(item.game, true);
    return () => inFlight.current?.abort();
  }, [item.game, fetchPreview]);

  const lookUp = (name: string) => {
    setLookingFor(name);
    setError(null);
    fetchPreview(name);
  };

  const typed = game.trim();
  const renamed = typed !== item.game;
  // A lookup only counts for the name it was made for, as on the add form.
  const current = looked?.game === typed ? looked : null;
  const lookingUp = lookingFor === typed;

  const approve = () => {
    if (renamed) {
      // The server only checks stored entries, as for an add.
      const known = alreadyListed(typed);
      if (known) {
        setError(known);
        return;
      }
    }
    const rename = renamed ? { game: typed } : {};
    // After an outage the server tries the lookup again; any other miss is
    // approved without details, as the row showed it.
    if (current?.outcome === 'unavailable') onDecide(item, 'approve', rename);
    else if (current) onDecide(item, 'approve', { ...rename, details: current.details ?? null });
    else if (renamed && !lookingUp) lookUp(typed);
    else onDecide(item, 'approve', rename);
  };

  const notice = current && !current.details ? lookupNotice(current.outcome, current.game, 'queue') : null;
  return (
    <li className="admin-item admin-item--pending">
      <div className="admin-item-head">
        <form
          className="admin-rename"
          onSubmit={(e) => {
            e.preventDefault();
            lookUp(typed);
          }}
        >
          <input
            className="suggest-input admin-rename-input"
            aria-label={`Game name for ${item.name}'s suggestion “${item.game}”`}
            value={game}
            onChange={(e) => {
              setGame(e.target.value);
              setError(null);
            }}
            required
            minLength={GAME_MIN}
            maxLength={GAME_MAX}
          />
          <button
            type="submit"
            className="admin-btn admin-btn--ghost"
            aria-label={`Look up the name for ${item.name}'s suggestion “${item.game}”`}
          >
            Look up
          </button>
        </form>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn"
            aria-label={`Approve ${typed || item.game}`}
            disabled={busy}
            onClick={approve}
          >
            Approve
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            aria-label={`Deny ${typed || item.game}`}
            disabled={busy}
            onClick={() => onDecide(item, 'deny')}
          >
            Deny
          </button>
        </div>
      </div>
      <p className="admin-muted">
        from {item.name}
        {renamed && ` as “${item.game}”`}
        {item.note ? `: “${item.note}”` : ''}
      </p>
      <div className="admin-item-preview">
        {lookingUp && <p className="admin-muted">Looking up “{typed}” on BoardGameGeek…</p>}
        {!lookingUp && current?.details && <PreviewCard details={current.details} />}
        {!lookingUp && notice && (
          <Notice tone="warning" live={false}>
            {notice}
          </Notice>
        )}
        {!lookingUp && !current && renamed && !error && (
          <p className="admin-muted">Look the corrected name up to check its details; Approve does that first.</p>
        )}
        {error && <p className="admin-error">{error}</p>}
      </div>
    </li>
  );
}

/** The pending suggestions, each with what BoardGameGeek has for it and the same approve/deny choice the email offers. */
function PendingQueue() {
  const { reload } = useWishlistItems();
  const [queue, setQueue] = useState<Queue>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An approval whose BoardGameGeek lookup filled nothing in, said here
  // since the row it came from is gone.
  const [notice, setNotice] = useState<string | null>(null);
  // The rows' first lookups, one at a time in row order.
  const line = useRef<Promise<unknown>>(Promise.resolve());
  const inTurn = useCallback<InTurn>((task) => {
    const run = line.current.then(task);
    line.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPending(controller.signal)
      .then((items) => setQueue({ kind: 'ready', items }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setQueue({ kind: 'error' });
      });
    return () => controller.abort();
  }, []);

  const decide: Decide = async (item, decision, choice) => {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    setNotice(null);
    const result = await decideSuggestion(item.id, decision, choice);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQueue((q) => (q.kind === 'ready' ? { kind: 'ready', items: q.items.filter((i) => i.id !== item.id) } : q));
    if (decision === 'approve') {
      setNotice(lookupNotice(result.data.lookup, choice?.game ?? item.game, 'approved'));
      reload();
    }
  };

  return (
    <div className="admin-queue">
      <h4 className="admin-subtitle">Waiting for a decision</h4>
      {queue.kind === 'loading' && <p className="admin-muted">Loading…</p>}
      {queue.kind === 'error' && <p className="admin-muted">Couldn't load the queue. Reload the page to try again.</p>}
      {queue.kind === 'ready' && queue.items.length === 0 && <p className="admin-muted">Nothing waiting.</p>}
      {queue.kind === 'ready' && queue.items.length > 0 && (
        <ul className="admin-list">
          {queue.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              busy={busy !== null}
              onDecide={(i, d, c) => void decide(i, d, c)}
              inTurn={inTurn}
            />
          ))}
        </ul>
      )}
      {/* Only a decision's outcome is announced, not the rows' previews; this
          region does it, so the notice doesn't announce itself too. */}
      <div aria-live="polite">
        {notice && (
          <Notice tone="warning" live={false}>
            {notice}
          </Notice>
        )}
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

type AddStatus =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'added'; game: string } | { kind: 'error'; message: string };

/** A lookup's answer, kept for the name it was made for: typing another name sets it aside. */
interface Looked {
  game: string;
  outcome: LookupOutcome;
  details?: PreviewDetails;
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
    const result = await addGame({
      game: typed,
      name: trimmedName,
      note: note.trim(),
      type: type || null,
      details: current.details ?? null,
    });
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
      <h4 id={`${uid}-title`} className="admin-subtitle">
        Add a game
      </h4>
      <div className="suggest-fields">
        <label className="suggest-label" htmlFor={`${uid}-game`}>
          Game
        </label>
        <input
          id={`${uid}-game`}
          className="suggest-input"
          value={game}
          onChange={(e) => setGame(e.target.value)}
          required
          minLength={GAME_MIN}
          maxLength={GAME_MAX}
          placeholder="Ark Nova"
        />
        <label className="suggest-label" htmlFor={`${uid}-type`}>
          Section
        </label>
        <select id={`${uid}-type`} className="suggest-input" value={type} onChange={(e) => setType(e.target.value)}>
          {WISHLIST_SECTIONS.map((t) => (
            <option key={t} value={t}>
              {WISHLIST_TYPES[t]}
            </option>
          ))}
          <option value="">{WISHLIST_TYPES.suggested}</option>
        </select>
        <label className="suggest-label" htmlFor={`${uid}-name`}>
          Added by
        </label>
        <input
          id={`${uid}-name`}
          className="suggest-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={NAME_MAX}
        />
        <label className="suggest-label" htmlFor={`${uid}-note`}>
          Note <span className="suggest-opt">(optional)</span>
        </label>
        <input
          id={`${uid}-note`}
          className="suggest-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="Shows on the card in quotes"
        />
      </div>
      {/* One live region for the lookup's answer, so the notice in it doesn't announce itself twice. */}
      <div aria-live="polite">
        {found && <PreviewCard details={found} />}
        {notice && (
          <Notice tone="warning" live={false}>
            {notice}
          </Notice>
        )}
      </div>
      <div className="suggest-actions">
        <button type="submit" className="suggest-btn" disabled={busy}>
          {label}
        </button>
        {current && !found && (
          <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => void lookUp()}>
            Look up again
          </button>
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

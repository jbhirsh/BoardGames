import { useId, useState, type FormEvent } from 'react';
import { getDisplayName, setDisplayName } from '../hooks/displayName';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';
import { normalizeName } from '../utils/normalizeName';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

/** Games already owned or already on the wishlist don't need suggesting. */
function alreadyListed(game: string): string | null {
  const key = normalizeName(game);
  if (!key) return null;
  const owned = GAMES.find((g) => normalizeName(g.name) === key);
  if (owned) return `We already own ${owned.name}.`;
  const wanted = WISHLIST.find((w) => normalizeName(w.name) === key);
  if (wanted) return `${wanted.name} is already on the wishlist.`;
  return null;
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; game: string } | { kind: 'error'; message: string };

/**
 * "Suggest a game": posts to /api/suggestions, which emails the owner an
 * approve/deny link. Approved games show up on the wishlist on next load.
 */
export default function SuggestForm() {
  const [game, setGame] = useState('');
  const [name, setName] = useState(() => getDisplayName() ?? '');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const uid = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.kind === 'sending') return;
    const trimmedName = name.trim();
    if (!isValidDisplayName(trimmedName)) {
      setStatus({ kind: 'error', message: NAME_HINT });
      return;
    }
    const known = alreadyListed(game);
    if (known) {
      setStatus({ kind: 'error', message: known });
      return;
    }
    setStatus({ kind: 'sending' });
    try {
      const r = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: game.trim(), name: trimmedName, note: note.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setStatus({ kind: 'error', message: data.error ?? 'Something went wrong. Try again in a minute.' });
        return;
      }
      if (trimmedName) setDisplayName(trimmedName);
      setStatus({ kind: 'sent', game: game.trim() });
      setGame('');
      setNote('');
    } catch {
      setStatus({ kind: 'error', message: 'Something went wrong. Try again in a minute.' });
    }
  };

  return (
    <form className="suggest" onSubmit={onSubmit} aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="suggest-title">Suggest a game</h3>
      <p className="suggest-sub">Know something we'd love? Jess gets an email and can add it with one click.</p>
      <div className="suggest-fields">
        <label className="suggest-label" htmlFor={`${uid}-game`}>Game</label>
        <input id={`${uid}-game`} className="suggest-input" value={game} onChange={(e) => setGame(e.target.value)} required minLength={2} maxLength={80} placeholder="Wingspan" />
        <label className="suggest-label" htmlFor={`${uid}-name`}>Your name</label>
        <input id={`${uid}-name`} className="suggest-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} autoComplete="given-name" placeholder="Alex" />
        <label className="suggest-label" htmlFor={`${uid}-note`}>Why? <span className="suggest-opt">(optional)</span></label>
        <input id={`${uid}-note`} className="suggest-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Great with six people" />
      </div>
      <div className="suggest-actions">
        <button type="submit" className="suggest-btn" disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Sending…' : 'Send suggestion'}
        </button>
        <span className="suggest-status" role="status" aria-live="polite">
          {status.kind === 'sent' && `Thanks! ${status.game} is waiting for Jess's approval.`}
          {status.kind === 'error' && status.message}
        </span>
      </div>
    </form>
  );
}

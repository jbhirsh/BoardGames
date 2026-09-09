import { useId, useState, type FormEvent } from 'react';
import type { KeywordId, WishlistItem } from '../data/types';
import { KW, WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { useAuth } from '../context/useAuth';
import { useWishlistItems } from '../context/useWishlistItems';
import { editGame, removeGame } from '../hooks/adminApi';

interface Props {
  item: WishlistItem;
}

/**
 * Edit and remove for one stored wishlist entry. Renders nothing for the
 * compiled-in list (those are edited in the source) or when not signed in,
 * and holds no state until it does.
 */
export default function AdminItemControls({ item }: Props) {
  const { admin } = useAuth();
  if (!admin || !item.source) return null;
  return <Controls item={item} />;
}

type Mode = 'idle' | 'editing' | 'confirming';

function Controls({ item }: Props) {
  const { reload } = useWishlistItems();
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await removeGame(item.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reload();
  };

  return (
    <div className="admin-controls">
      {mode === 'idle' && (
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { setError(null); setMode('editing'); }}>Edit {item.name}</button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { setError(null); setMode('confirming'); }}>Remove {item.name}</button>
        </div>
      )}
      {mode === 'confirming' && (
        <div className="admin-actions" role="group" aria-label={`Remove ${item.name}?`}>
          <span className="admin-muted">Remove {item.name} from the wishlist?</span>
          <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => void remove()}>Yes, remove</button>
          <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => setMode('idle')}>Keep it</button>
        </div>
      )}
      {/* Mounted only while open, so every Edit starts from the entry as it is now. */}
      {mode === 'editing' && <EditForm item={item} onDone={() => setMode('idle')} />}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}

function EditForm({ item, onDone }: Props & { onDone: () => void }) {
  const { reload } = useWishlistItems();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState(item.name);
  const [type, setType] = useState<string>(item.type === 'suggested' ? '' : item.type);
  const [min, setMin] = useState(String(item.min));
  const [max, setMax] = useState(String(item.max));
  const [mins, setMins] = useState(String(item.mins));
  const [desc, setDesc] = useState(item.blurb ?? '');
  const [kw, setKw] = useState<Set<KeywordId>>(() => new Set(item.kw));
  const uid = useId();

  const toggleKw = (id: KeywordId) => setKw((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await editGame({
      id: item.id,
      game: game.trim(),
      details: { min: Number(min), max: Number(max), mins: Number(mins), desc: desc.trim(), kw: [...kw], type: type || null },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
    reload();
  };

  return (
    <form className="admin-edit" onSubmit={save} aria-label={`Edit ${item.name}`}>
      <div className="suggest-fields">
        <label className="suggest-label" htmlFor={`${uid}-game`}>Name</label>
        <input id={`${uid}-game`} className="suggest-input" value={game} onChange={(e) => setGame(e.target.value)} required minLength={2} maxLength={80} />
        <label className="suggest-label" htmlFor={`${uid}-type`}>Section</label>
        <select id={`${uid}-type`} className="suggest-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{WISHLIST_TYPES.suggested}</option>
          {WISHLIST_SECTIONS.map((t) => <option key={t} value={t}>{WISHLIST_TYPES[t]}</option>)}
        </select>
        <label className="suggest-label" htmlFor={`${uid}-min`}>Players</label>
        <div className="admin-range">
          <input id={`${uid}-min`} className="suggest-input admin-num" type="number" min={1} max={99} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum players" required />
          <span className="admin-muted">to</span>
          <input className="suggest-input admin-num" type="number" min={1} max={99} value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum players" required />
        </div>
        <label className="suggest-label" htmlFor={`${uid}-mins`}>Minutes</label>
        <input id={`${uid}-mins`} className="suggest-input admin-num" type="number" min={0} max={600} value={mins} onChange={(e) => setMins(e.target.value)} required />
        <label className="suggest-label" htmlFor={`${uid}-desc`}>Description</label>
        <textarea id={`${uid}-desc`} className="suggest-input admin-desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} rows={3} />
      </div>
      <fieldset className="admin-kw">
        <legend className="suggest-label">Keywords</legend>
        {(Object.entries(KW) as [KeywordId, string][]).map(([id, label]) => (
          <label key={id} className="admin-kw-opt">
            <input type="checkbox" checked={kw.has(id)} onChange={() => toggleKw(id)} /> {label}
          </label>
        ))}
      </fieldset>
      <div className="admin-actions">
        <button type="submit" className="admin-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </form>
  );
}

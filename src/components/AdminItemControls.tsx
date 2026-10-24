import { useId, useState, type FormEvent } from 'react';
import type { KeywordId, StoredWishlistItem, WishlistItem } from '../data/types';
import { KW, WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { DESC_MAX, GAME_MAX, GAME_MIN, MINS_MAX, PLAYERS_MAX } from '../data/suggestionLimits';
import { useAuth } from '../context/useAuth';
import { useWishlistItems } from '../context/useWishlistItems';
import { editGame, removeGame } from '../client/adminApi';
import {
  adminActionsClass,
  adminButtonClass,
  adminDangerClass,
  adminErrorClass,
  adminGhostClass,
  adminMutedClass,
  fieldClass,
  fieldLabelClass,
  fieldsClass,
} from './formClasses';

interface Props {
  item: WishlistItem;
  /** In the owner's list of hidden duplicates, beside the entry's name (a full line while editing). */
  inQueue?: boolean;
}

interface StoredProps {
  item: StoredWishlistItem;
}

/**
 * Edit and remove for one stored wishlist entry. Renders nothing for the
 * compiled-in list (those are edited in the source) or when not signed in,
 * and holds no state until it does.
 */
export default function AdminItemControls({ item, inQueue = false }: Props) {
  const { admin } = useAuth();
  if (!admin || !item.source) return null;
  return <Controls item={item} inQueue={inQueue} />;
}

type Mode = 'idle' | 'editing' | 'confirming';

function Controls({ item, inQueue }: StoredProps & { inQueue: boolean }) {
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
    <div className={inQueue ? (mode === 'editing' ? 'basis-full' : '') : 'mt-2.5'}>
      {mode === 'idle' && (
        <div className={adminActionsClass}>
          <button
            type="button"
            className={adminGhostClass}
            onClick={() => {
              setError(null);
              setMode('editing');
            }}
          >
            Edit {item.name}
          </button>
          <button
            type="button"
            className={adminGhostClass}
            onClick={() => {
              setError(null);
              setMode('confirming');
            }}
          >
            Remove {item.name}
          </button>
        </div>
      )}
      {mode === 'confirming' && (
        <div className={adminActionsClass} role="group" aria-label={`Remove ${item.name}?`}>
          <span className={adminMutedClass}>Remove {item.name} from the wishlist?</span>
          <button type="button" className={adminDangerClass} disabled={busy} onClick={() => void remove()}>
            Yes, remove
          </button>
          <button type="button" className={adminGhostClass} disabled={busy} onClick={() => setMode('idle')}>
            Keep it
          </button>
        </div>
      )}
      {/* Mounted only while open, so every Edit starts from the entry as it is now. */}
      {mode === 'editing' && <EditForm item={item} onDone={() => setMode('idle')} />}
      {error && (
        <p className={adminErrorClass} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({ item, onDone }: StoredProps & { onDone: () => void }) {
  const { reload } = useWishlistItems();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState(item.name);
  const [type, setType] = useState<string>(item.type === 'suggested' ? '' : item.type);
  const [min, setMin] = useState(String(item.min));
  const [max, setMax] = useState(String(item.max));
  const [mins, setMins] = useState(String(item.mins));
  const [desc, setDesc] = useState(item.blurb);
  const [kw, setKw] = useState<Set<KeywordId>>(() => new Set(item.kw));
  const uid = useId();

  const toggleKw = (id: KeywordId) =>
    setKw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      details: {
        min: Number(min),
        max: Number(max),
        mins: Number(mins),
        desc: desc.trim(),
        kw: [...kw],
        type: type || null,
      },
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
    <form
      className="mt-2 rounded-lg border border-border bg-bg2 p-3.5"
      onSubmit={save}
      aria-label={`Edit ${item.name}`}
    >
      <div className={fieldsClass}>
        <label className={fieldLabelClass} htmlFor={`${uid}-game`}>
          Name
        </label>
        <input
          id={`${uid}-game`}
          className={`${fieldClass} h-8.5`}
          value={game}
          onChange={(e) => setGame(e.target.value)}
          required
          minLength={GAME_MIN}
          maxLength={GAME_MAX}
        />
        <label className={fieldLabelClass} htmlFor={`${uid}-type`}>
          Section
        </label>
        <select
          id={`${uid}-type`}
          className={`${fieldClass} h-8.5 appearance-auto`}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">{WISHLIST_TYPES.suggested}</option>
          {WISHLIST_SECTIONS.map((t) => (
            <option key={t} value={t}>
              {WISHLIST_TYPES[t]}
            </option>
          ))}
        </select>
        <label className={fieldLabelClass} htmlFor={`${uid}-min`}>
          Players
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${uid}-min`}
            className={`${fieldClass} h-8.5 w-20`}
            type="number"
            min={1}
            max={PLAYERS_MAX}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            aria-label="Minimum players"
            required
          />
          <span className={adminMutedClass}>to</span>
          <input
            className={`${fieldClass} h-8.5 w-20`}
            type="number"
            min={1}
            max={PLAYERS_MAX}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            aria-label="Maximum players"
            required
          />
        </div>
        <label className={fieldLabelClass} htmlFor={`${uid}-mins`}>
          Minutes
        </label>
        <input
          id={`${uid}-mins`}
          className={`${fieldClass} h-8.5 w-20`}
          type="number"
          min={0}
          max={MINS_MAX}
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          required
        />
        <label className={fieldLabelClass} htmlFor={`${uid}-desc`}>
          Description
        </label>
        <textarea
          id={`${uid}-desc`}
          className={`${fieldClass} h-auto resize-y py-2`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          maxLength={DESC_MAX}
          rows={3}
        />
      </div>
      <fieldset className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        <legend className={`${fieldLabelClass} mb-1.5 p-0`}>Keywords</legend>
        {(Object.entries(KW) as [KeywordId, string][]).map(([id, label]) => (
          <label key={id} className="inline-flex items-center gap-1 text-[12px] text-text2">
            <input type="checkbox" checked={kw.has(id)} onChange={() => toggleKw(id)} /> {label}
          </label>
        ))}
      </fieldset>
      <div className={adminActionsClass}>
        <button type="submit" className={adminButtonClass} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={adminGhostClass} disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && (
        <p className={adminErrorClass} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

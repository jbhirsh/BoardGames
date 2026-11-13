import { useId, useState, type FormEvent } from 'react';
import type { KeywordId, WishlistItem } from '../data/types';
import { KW, WISHLIST_SECTIONS, WISHLIST_TYPES } from '../data/keywords';
import { DESC_MAX, GAME_MAX, GAME_MIN, MINS_MAX, PLAYERS_MAX } from '../data/suggestionLimits';
import { useAuth } from '../context/useAuth';
import { useWishlistItems } from '../context/useWishlistItems';
import { editGame, removeGame } from '../client/adminApi';
import { BinIcon, PencilIcon } from './Icons';
import { outlineIconClass } from './sharedClasses';
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
}

// The owner's buttons match the cart and YouTube buttons they share a line
// with: 32px drawn, 44px to tap (outlineIconClass). The bin turns red while
// Remove asks to confirm.
const ownerIconClass = `${outlineIconClass} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue can-hover:hover:border-border-hover can-hover:hover:bg-bg2 can-hover:hover:text-text`;
const binOpenClass = `${outlineIconClass} cursor-pointer border-danger-border bg-danger-bg text-danger-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue`;

/**
 * Edit and Remove for one wishlist game, whichever way it got there, as a
 * pencil and a bin, each named in full ("Edit SETI: Search for
 * Extraterrestrial Intelligence"). Rendered into a footer that wraps: the
 * two buttons sit in its line, and Remove's question or the Edit form takes
 * a full-width line of its own below it. Renders nothing unless the owner
 * is signed in, and holds no state until then.
 */
export default function AdminItemControls({ item }: Props) {
  const { admin } = useAuth();
  if (!admin) return null;
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

  const open = (next: Mode) => {
    setError(null);
    setMode((m) => (m === next ? 'idle' : next));
  };

  return (
    <>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          className={ownerIconClass}
          aria-label={`Edit ${item.name}`}
          title={`Edit ${item.name}`}
          aria-expanded={mode === 'editing'}
          onClick={() => open('editing')}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className={mode === 'confirming' ? binOpenClass : ownerIconClass}
          aria-label={`Remove ${item.name}`}
          title={`Remove ${item.name}`}
          aria-expanded={mode === 'confirming'}
          onClick={() => open('confirming')}
        >
          <BinIcon />
        </button>
      </span>
      {(mode !== 'idle' || error) && (
        <div className="order-last basis-full">
          {mode === 'confirming' && (
            <div
              className={`${adminActionsClass} rounded-lg border border-danger-border bg-danger-bg px-3 py-2`}
              role="group"
              aria-label={`Remove ${item.name}?`}
            >
              <span className="mr-auto text-[12.5px] text-danger-fg">Remove {item.name} from the wishlist?</span>
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
      )}
    </>
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

import { useId, useState, type FormEvent } from 'react';
import { useOwners } from '../context/useOwners';
import { getDisplayName, setDisplayName } from '../hooks/useOwnersData';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';

interface Props {
  itemId: string;
  itemName: string;
}

/**
 * "I own this" toggle plus the list of friends who own the item. The first
 * time a browser toggles, it asks for a display name and remembers it.
 */
export default function OwnButton({ itemId, itemName }: Props) {
  const { owners, mine, loaded, toggle } = useOwners();
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputId = useId();

  const owned = mine.has(itemId);
  const names = owners[itemId] ?? [];

  // The name is remembered only once the server has accepted it, so a name
  // it would refuse never gets stuck in storage and silently fails forever.
  // The button is disabled while its own request is in flight, so a second
  // click can't be silently dropped by the hook's in-flight guard.
  const submit = async (name: string) => {
    setError(null);
    setPending(true);
    try {
      const ok = await toggle(itemId, name);
      if (!ok) {
        setError("Couldn't save that just now. Try again in a moment.");
        return;
      }
      if (name) setDisplayName(name);
    } finally {
      setPending(false);
    }
  };

  const onToggle = () => {
    const name = getDisplayName() ?? '';
    if (!owned && !isValidDisplayName(name)) {
      setDraft(name);
      setAsking(true);
      return;
    }
    void submit(name);
  };

  const onSubmitName = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!isValidDisplayName(name)) {
      setError(NAME_HINT);
      return;
    }
    setAsking(false);
    void submit(name);
  };

  return (
    <div className="own">
      <button
        type="button"
        className={`own-btn${owned ? ' own-btn--on' : ''}`}
        aria-pressed={owned}
        aria-label={owned ? `You own ${itemName}; click to unmark` : `Mark that you own ${itemName}`}
        onClick={onToggle}
        disabled={!loaded || pending}
      >
        {owned ? '✓ I own this' : 'I own this'}
      </button>
      {names.length > 0 && (
        <span className="own-list">Owned by {names.join(', ')}</span>
      )}
      {asking && (
        <form className="own-form" onSubmit={onSubmitName}>
          <label htmlFor={inputId} className="own-form-label">Your name</label>
          <input
            id={inputId}
            className="own-form-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={30}
            autoComplete="given-name"
            placeholder="Your name"
          />
          <button type="submit" className="own-form-save">Save</button>
          <button type="button" className="own-form-cancel" onClick={() => { setAsking(false); setError(null); }}>Cancel</button>
        </form>
      )}
      {error && <span className="own-error" role="alert">{error}</span>}
    </div>
  );
}

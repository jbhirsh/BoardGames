import { useId, useState, type FormEvent } from 'react';
import { getDisplayName, setDisplayName } from '../client/displayName';
import { isValidDisplayName, NAME_HINT } from '../utils/displayName';
import { alreadyListed } from '../utils/alreadyListed';
import { GAME_MAX, GAME_MIN, NAME_MAX, NOTE_MAX } from '../data/suggestionLimits';
import { request } from '../client/graphql';
import { SuggestGameDocument } from '../gql/graphql';
import {
  fieldClass,
  fieldLabelClass,
  fieldsClass,
  formActionsClass,
  formStatusClass,
  optionalClass,
  submitClass,
} from './formClasses';

type Status =
  { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; game: string } | { kind: 'error'; message: string };

/**
 * "Suggest a game": sends suggestGame to the API, which emails the owner an
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
    const result = await request(SuggestGameDocument, {
      game: game.trim(),
      name: trimmedName,
      note: note.trim(),
    });
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    if (trimmedName) setDisplayName(trimmedName);
    setStatus({ kind: 'sent', game: game.trim() });
    setGame('');
    setNote('');
  };

  return (
    <form
      id="suggest"
      className="mt-9 scroll-mt-[calc(var(--thead-top,91px)+16px)] rounded-panel border border-border bg-surface px-4 py-4.5 shadow-(--shadow-sm) sm:p-6"
      onSubmit={onSubmit}
      aria-labelledby={`${uid}-title`}
    >
      <h3 id={`${uid}-title`} className="mb-1.5 font-display text-[19px] font-bold text-dark">
        Suggest a game
      </h3>
      <p className="mb-4 text-[12.5px] text-text2">
        Know something we'd love? Jess gets an email and can add it with one click.
      </p>
      <div className={fieldsClass}>
        <label className={fieldLabelClass} htmlFor={`${uid}-game`}>
          Game
        </label>
        <input
          id={`${uid}-game`}
          className={`${fieldClass} h-8.5`}
          data-focus-target="field"
          value={game}
          onChange={(e) => setGame(e.target.value)}
          required
          minLength={GAME_MIN}
          maxLength={GAME_MAX}
          placeholder="e.g. Kingdomino"
        />
        <label className={fieldLabelClass} htmlFor={`${uid}-name`}>
          Your name
        </label>
        <input
          id={`${uid}-name`}
          className={`${fieldClass} h-8.5`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={NAME_MAX}
          autoComplete="given-name"
          placeholder="e.g. Alex"
        />
        <label className={fieldLabelClass} htmlFor={`${uid}-note`}>
          Why? <span className={optionalClass}>(optional)</span>
        </label>
        <input
          id={`${uid}-note`}
          className={`${fieldClass} h-8.5`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="e.g. Great with six people"
        />
      </div>
      <div className={formActionsClass}>
        <button type="submit" className={submitClass} disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Sending…' : 'Send suggestion'}
        </button>
        <span className={formStatusClass} role="status" aria-live="polite">
          {status.kind === 'sent' && `Thanks! ${status.game} is waiting for Jess's approval.`}
          {status.kind === 'error' && status.message}
        </span>
      </div>
    </form>
  );
}

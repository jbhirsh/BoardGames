import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { decideByLink, openEmailed, type Emailed, type LinkOutcome } from '../client/adminApi';
import { GAME_MAX, GAME_MIN } from '../data/suggestionLimits';
import { approvalDetails, approvedText, linkProblem, missText } from '../utils/emailedLinks';
import EmailedLinkPage from './EmailedLinkPage';
import PreviewCard from './PreviewCard';
import { useLinkToken } from '../hooks/useLinkToken';

type Decision = 'approve' | 'deny';

/** What the page says once the button is pressed, or why it couldn't be. */
type Result = { kind: 'sending' } | { kind: 'done'; title: string; text: string };

type Refusal = Extract<LinkOutcome<unknown>, { ok: false }>;

/** Why the link can't be read, as the page words it: a heading and what to do. */
function linkRefused(refusal: Refusal): { title: string; text: string } {
  const text = refusal.code === 'BAD_NAME' ? `${refusal.error} Go back and try again.` : refusal.error;
  return { title: linkProblem(refusal.code), text };
}

/**
 * Why a decision didn't go through. The link was just read with the same
 * token, so a bad request now is about the name or details sent with it.
 */
function decisionRefused(refusal: Refusal, game: string): { title: string; text: string } {
  if (refusal.code === 'ALREADY_DECIDED' && refusal.status) {
    return { title: `Already ${refusal.status}`, text: `${game} was ${refusal.status} earlier. Nothing changed.` };
  }
  if (refusal.code === 'CONFLICT') return { title: 'Already on the list', text: `${refusal.error}. Nothing changed.` };
  if (refusal.code === 'BAD_REQUEST') {
    return {
      title: 'Not approved',
      text: `Nothing changed: the ${refusal.error}. Open the link from the email again.`,
    };
  }
  return linkRefused(refusal);
}

/**
 * /approve and /deny: where the approve and deny links in the owner's
 * suggestion emails lead (`?id=…&token=…`). Opening one only reads the
 * suggestion, with the token, and for an approval what BoardGameGeek has
 * for it: mail scanners follow every link, so nothing changes until the
 * page's button is pressed. A misspelt name can be corrected and looked up
 * again (`&game=`), still changing nothing; Approve then sends the name and
 * the details the page showed (none when BoardGameGeek found nothing, so
 * the game goes on without them; left out after an outage, so the approval
 * tries the lookup again). A link already used, mistyped or no longer
 * matching says so. The token leaves the address at once (useLinkToken), and
 * the page asks not to be indexed and sends no referrer (vercel.json sends
 * Referrer-Policy before the page's code has loaded).
 */
export default function EmailedDecisionPage() {
  const decision: Decision = useLocation().pathname === '/deny' ? 'deny' : 'approve';
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? '';
  const token = useLinkToken();
  const game = params.get('game') ?? undefined;
  const key = JSON.stringify([decision, id, token, game]);
  const [loaded, setLoaded] = useState<{ key: string; outcome: LinkOutcome<Emailed> } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const uid = useId();

  useEffect(() => {
    const controller = new AbortController();
    void openEmailed({ id, token, game, decision }, controller.signal).then((outcome) => {
      if (!controller.signal.aborted) setLoaded({ key, outcome });
    });
    return () => controller.abort();
  }, [key, id, token, game, decision]);

  const outcome = loaded?.key === key ? loaded.outcome : null;
  const item = outcome?.ok ? outcome.data : null;
  const shown = game ?? item?.game ?? '';

  const decide = async () => {
    if (!item || result?.kind === 'sending') return;
    setResult({ kind: 'sending' });
    const details = decision === 'approve' ? approvalDetails(item.preview) : undefined;
    const sent = await decideByLink({
      id,
      token,
      decision,
      ...(decision === 'approve' ? { game: shown, details } : {}),
    });
    if (!sent.ok) {
      setResult({ kind: 'done', ...decisionRefused(sent, item.game) });
      return;
    }
    setResult(
      decision === 'approve'
        ? { kind: 'done', title: 'Approved', text: approvedText(shown, item.name, sent.data.lookup, details) }
        : { kind: 'done', title: 'Denied', text: `${item.game} won't appear on the wishlist.` },
    );
  };

  // A page that only says something: the outcome, why the link can't be
  // used, or that it was used already.
  let said: { title: string; text: string } | null = null;
  if (result?.kind === 'done') said = result;
  else if (!outcome)
    said = { title: decision === 'approve' ? 'Approve a suggestion' : 'Deny a suggestion', text: 'Loading…' };
  else if (!outcome.ok) said = linkRefused(outcome);
  else if (!outcome.data.open)
    said = {
      title: `Already ${outcome.data.status}`,
      text: `${outcome.data.game} was ${outcome.data.status} earlier. Nothing changed.`,
    };

  const waiting = outcome?.ok && outcome.data.open ? outcome.data : null;
  let title = said?.title ?? '';
  let body: ReactNode = said && (
    <p className="signin-status" role="status">
      {said.text}
    </p>
  );
  if (!said && waiting) {
    const data = waiting;
    const renamed = shown !== data.game;
    title = decision === 'approve' ? `Approve ${shown}?` : `Deny ${data.game}?`;
    const sending = result?.kind === 'sending';
    body = (
      <>
        <p className="signin-status">
          Suggested by {data.name}
          {decision === 'approve' && renamed && ` as “${data.game}”`}
          {data.note && `: “${data.note}”`}
        </p>
        {decision === 'approve' &&
          data.preview &&
          (data.preview.outcome === 'found' && data.preview.details ? (
            <PreviewCard details={data.preview.details} />
          ) : (
            data.preview.outcome !== 'found' && <p className="signin-status">{missText(shown, data.preview.outcome)}</p>
          ))}
        <div className="signin-actions">
          <button
            type="button"
            className={decision === 'approve' ? 'signin-btn' : 'signin-btn signin-btn--ghost'}
            disabled={sending}
            onClick={() => void decide()}
          >
            {decision === 'approve' ? 'Approve' : 'Deny'}
          </button>
        </div>
        {decision === 'approve' && (
          <RenameForm
            key={shown}
            uid={uid}
            game={shown}
            onLookUp={(name) => setParams({ id, game: name }, { state: { token } })}
          />
        )}
      </>
    );
  }

  return <EmailedLinkPage title={title}>{body}</EmailedLinkPage>;
}

/** Corrects a misspelt name: only looks it up again, through the page's address. */
function RenameForm({ uid, game, onLookUp }: { uid: string; game: string; onLookUp: (name: string) => void }) {
  const [name, setName] = useState(game);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onLookUp(name.trim().replace(/\s+/g, ' '));
  };
  return (
    <form className="signin-form emailed-rename" onSubmit={onSubmit} aria-label="Correct the name">
      <label className="signin-label" htmlFor={`${uid}-game`}>
        Wrong game? Correct the name and look it up again.
      </label>
      <input
        id={`${uid}-game`}
        className="signin-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={GAME_MIN}
        maxLength={GAME_MAX}
        autoComplete="off"
      />
      <div className="signin-actions">
        <button type="submit" className="signin-btn signin-btn--ghost">
          Look up
        </button>
      </div>
    </form>
  );
}

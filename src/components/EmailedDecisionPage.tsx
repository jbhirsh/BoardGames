import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { decideByLink, openEmailed, type Emailed, type LinkOutcome } from '../client/adminApi';
import { GAME_MAX, GAME_MIN } from '../data/suggestionLimits';
import { approvalDetails, approvedText, linkProblem, missText } from '../utils/emailedLinks';
import EmailedLinkPage from './EmailedLinkPage';
import PreviewCard from './PreviewCard';
import {
  signInActionsClass,
  signInButtonClass,
  signInGhostClass,
  signInInputClass,
  signInLabelClass,
  signInPrimaryClass,
  signInStatusClass,
} from './signInClasses';

// A decision is the page's one action, as wide as the panel and a thumb's
// height. Deny is as wide and as plain, in Notice's danger tones (4.5:1 or
// better in both themes).
const decideClass = `h-11 w-full ${signInButtonClass}`;
const approveClass = `${decideClass} ${signInPrimaryClass}`;
const denyClass = `${decideClass} border border-danger-border bg-danger-bg text-danger-fg`;
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
 * suggestion, with the token, and what BoardGameGeek has for it (so a
 * denial shows what's turned down too): mail scanners follow every link, so nothing changes until the
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
  const key = JSON.stringify([id, token, game]);
  const [loaded, setLoaded] = useState<{ key: string; outcome: LinkOutcome<Emailed> } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const uid = useId();

  useEffect(() => {
    const controller = new AbortController();
    void openEmailed({ id, token, game }, controller.signal).then((outcome) => {
      if (!controller.signal.aborted) setLoaded({ key, outcome });
    });
    return () => controller.abort();
  }, [key, id, token, game]);

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
    <p className={signInStatusClass} role="status">
      {said.text}
    </p>
  );
  if (!said && waiting) {
    const data = waiting;
    const renamed = shown !== data.game;
    title = decision === 'approve' ? `Approve ${shown}?` : `Deny ${data.game}?`;
    const sending = result?.kind === 'sending';
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-[1.4] text-text">
          Suggested by <strong className="font-semibold text-dark">{data.name}</strong>
          {decision === 'approve' && renamed && ` as “${data.game}”`}
        </p>
        {data.note && (
          <blockquote className="rounded-r-control border-l-3 border-blue bg-bg2 px-3.5 py-2.5 text-[15px] leading-[1.45] text-text italic">
            “{data.note}”
          </blockquote>
        )}
        {data.preview &&
          (data.preview.outcome === 'found' && data.preview.details ? (
            <PreviewCard details={data.preview.details} className="mt-0" />
          ) : (
            decision === 'approve' &&
            data.preview.outcome !== 'found' && (
              <p className={signInStatusClass}>{missText(shown, data.preview.outcome)}</p>
            )
          ))}
        <div className={signInActionsClass}>
          <button
            type="button"
            className={decision === 'approve' ? approveClass : denyClass}
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
      </div>
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
    <form className="flex flex-col gap-2 border-t border-border pt-4" onSubmit={onSubmit} aria-label="Correct the name">
      <label className={signInLabelClass} htmlFor={`${uid}-game`}>
        Wrong game? Correct the name and look it up again.
      </label>
      <div className="flex gap-2">
        <input
          id={`${uid}-game`}
          className={`h-11 min-w-0 flex-1 ${signInInputClass}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={GAME_MIN}
          maxLength={GAME_MAX}
          autoComplete="off"
        />
        <button type="submit" className={`h-11 flex-none ${signInButtonClass} ${signInGhostClass}`}>
          Look up
        </button>
      </div>
    </form>
  );
}

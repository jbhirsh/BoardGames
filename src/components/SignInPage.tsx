import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/useAuth';
import BackLink from './BackLink';
import { SIGN_IN_INTRO, SIGN_IN_TITLE } from '../data/signIn';
import { pageClass, pageDescClass, pageHeaderClass, pageTitleClass, tapTargetClass } from './sharedClasses';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * /sign-in: the owner's way into admin mode. An email address, a magic
 * link in the inbox, and this browser is signed in for 30 days. Nothing on
 * the home page points here; the owner knows the address.
 */
const panelClass = 'max-w-110 rounded-panel border border-border bg-surface p-6 shadow-(--shadow-md)';
const statusClass = 'min-h-[1.5em] text-[13px] leading-normal text-text2';
const buttonClass = `h-10 cursor-pointer rounded-control px-4.5 text-[14px] font-semibold [transition:background_0.15s] disabled:cursor-wait disabled:opacity-60 ${tapTargetClass}`;
const primaryClass = 'bg-blue-fill text-on-fill hover:not-disabled:bg-blue-fill-hover';
const ghostClass = 'border border-border2 bg-surface text-text hover:not-disabled:bg-bg2';

export default function SignInPage() {
  const { admin, loaded, requestLink, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const uid = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.kind === 'sending') return;
    setStatus({ kind: 'sending' });
    const result = await requestLink(email.trim());
    setStatus(result.ok ? { kind: 'sent' } : { kind: 'error', message: result.error });
  };

  return (
    <div className={pageClass}>
      <title>Sign in · The Game Room</title>
      <header className={pageHeaderClass}>
        <BackLink />
        <h1 className={pageTitleClass}>{SIGN_IN_TITLE}</h1>
        <p className={pageDescClass}>{SIGN_IN_INTRO}</p>
      </header>
      {loaded && admin && (
        <div className={panelClass}>
          <p className={statusClass} role="status">
            You're signed in as the owner on this browser.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <Link to="/?c=want" className={`${buttonClass} ${primaryClass} inline-flex items-center`}>
              Go to the wishlist
            </Link>
            <button type="button" className={`${buttonClass} ${ghostClass}`} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      )}
      {loaded && !admin && (
        <div className={panelClass}>
          <form className="flex flex-col gap-2.5" onSubmit={onSubmit} aria-label="Owner sign-in">
            <label className="text-[12px] font-medium text-text2" htmlFor={`${uid}-email`}>
              Email
            </label>
            <input
              id={`${uid}-email`}
              className="h-10 rounded-control border border-border2 bg-bg px-3.5 text-[16px] text-text outline-none [transition:border-color_0.15s,box-shadow_0.15s] focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-bg2)]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <button type="submit" className={`${buttonClass} ${primaryClass}`} disabled={status.kind === 'sending'}>
                {status.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </div>
            <p className={statusClass} role="status" aria-live="polite">
              {status.kind === 'sent' &&
                "If that's the owner's address, a link is on its way. It works once and expires in 15 minutes."}
              {status.kind === 'error' && status.message}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

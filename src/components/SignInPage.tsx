import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../context/useAuth';
import {
  addPasskey,
  signedInEmail,
  signInWithGoogle,
  signInWithPasskey,
  signOut,
  type AuthOutcome,
} from '../client/auth';
import { addPasskeyProblem, signInProblem, signOutProblem } from '../utils/signInErrors';
import { GoogleIcon, KeyIcon } from './Icons';
import Notice from './Notice';
import { SIGN_IN_INTRO, SIGN_IN_TITLE } from '../data/signIn';
import { pageDescClass, pageHeaderClass, pageTitleClass } from './sharedClasses';
import {
  signInButtonClass,
  signInGhostClass,
  signInPanelClass,
  signInPrimaryClass,
  signInStatusClass,
} from './signInClasses';

/** A full-width button of the panel's, a thumb's height, its icon beside its label. */
const buttonClass = `flex h-11 w-full items-center justify-center gap-2.5 ${signInButtonClass}`;
const ghostClass = `${buttonClass} ${signInGhostClass}`;
/** The panel's buttons, one under another. */
const stackClass = 'flex flex-col gap-3';

/** Which action is under way, its button saying so and the rest waiting. */
type Busy = 'google' | 'passkey' | 'add' | 'out' | null;

/** A message at the top of the panel: why something failed, or the passkey added. */
type Message = { tone: 'error'; text: string } | { tone: 'added' } | { tone: 'stale' } | null;

/** What to say when each action fails. */
const PROBLEMS = { google: signInProblem, passkey: signInProblem, add: addPasskeyProblem, out: signOutProblem };

/**
 * /sign-in: the owner's way into admin mode (api/_auth.ts). Signed out, it
 * offers Google and a passkey; a Google sign-in leaves for Google and comes
 * back here (with ?error=<code> when it failed, which the page reads once,
 * in its own words, and takes out of the address). Signed in with another
 * Google account, it says whose and that the site works as it does for
 * everyone. Signed in as the owner, it offers the wishlist, a passkey on
 * this device (once; on a session over a day old, a Notice asks for Google
 * again first) and signing out. Nothing on the site links here: the owner
 * keeps it bookmarked.
 */
export default function SignInPage() {
  const { admin, loaded, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState<Message>(() => {
    const code = params.get('error');
    return code ? { tone: 'error', text: signInProblem(code) } : null;
  });
  const [busy, setBusy] = useState<Busy>(null);
  // Whose account is signed in, read for a session that isn't the owner's;
  // `asked` counts the actions that could have changed it.
  const [asked, setAsked] = useState(0);
  const [account, setAccount] = useState<{ asked: number; email: string | null } | null>(null);

  // The error code has been read: take it (and anything with it) out of the address.
  useEffect(() => {
    if (!params.has('error')) return;
    setParams(
      (now) => {
        now.delete('error');
        now.delete('error_description');
        return now;
      },
      { replace: true },
    );
  }, [params, setParams]);

  // Back from Google's page, a browser may show this page as it was left,
  // from its cache: the Google button would still say it's opening Google.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener('pageshow', shown);
    return () => window.removeEventListener('pageshow', shown);
  }, []);

  useEffect(() => {
    if (!loaded || admin) return;
    let live = true;
    void signedInEmail().then((email) => {
      if (live) setAccount({ asked, email });
    });
    return () => {
      live = false;
    };
  }, [loaded, admin, asked]);

  /** Runs one action, then shows its failure, or what follows it. */
  const run = async (which: Exclude<Busy, null>, action: () => Promise<AuthOutcome>, after: () => Promise<void>) => {
    setBusy(which);
    setMessage(null);
    const outcome = await action();
    if (outcome.ok) await after();
    else if (which === 'add' && outcome.code === 'SESSION_NOT_FRESH') setMessage({ tone: 'stale' });
    else
      setMessage({
        tone: 'error',
        text: PROBLEMS[which](outcome.code),
      });
    // A Google sign-in that started has left for Google: its button stays busy.
    if (!(which === 'google' && outcome.ok)) setBusy(null);
  };

  /** After a sign-in or out that stays on the page: ask again who this is. */
  const reread = async () => {
    await refresh();
    setAsked((n) => n + 1);
  };

  const google = () => void run('google', signInWithGoogle, async () => {});
  const passkey = () => void run('passkey', signInWithPasskey, reread);
  const add = () =>
    void run('add', addPasskey, async () => {
      setMessage({ tone: 'added' });
      await refresh();
    });
  const out = () => void run('out', signOut, reread);

  const email = account?.asked === asked ? account.email : undefined;
  const error = message?.tone === 'error' && (
    <Notice tone="error" className="mb-4">
      {message.text}
    </Notice>
  );

  let panel: ReactNode = null;
  if (loaded && admin) {
    panel = (
      <>
        {error}
        <p className={signInStatusClass} role="status">
          You're signed in as the owner on this browser.
        </p>
        <div className={`mt-3 ${stackClass}`}>
          {message?.tone === 'added' && <Notice tone="info">Passkey added. Next time, sign in with Face ID.</Notice>}
          {message?.tone === 'stale' && (
            <Notice tone="warning" action={{ label: 'Sign in with Google', onClick: google }}>
              Adding a passkey needs a sign-in from today: sign in with Google again first.
            </Notice>
          )}
          <Link to="/?c=want" className={`${buttonClass} ${signInPrimaryClass}`}>
            Go to the wishlist
          </Link>
          {message?.tone !== 'added' && (
            <button type="button" className={ghostClass} disabled={busy !== null} onClick={add}>
              <KeyIcon />
              {busy === 'add' ? 'Adding a passkey…' : 'Add a passkey on this device'}
            </button>
          )}
          <button type="button" className={ghostClass} disabled={busy !== null} onClick={out}>
            {busy === 'out' ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </>
    );
  } else if (loaded && typeof email === 'string') {
    panel = (
      <>
        {error}
        <p className={signInStatusClass} role="status">
          You're signed in as {email}, which isn't the owner's account, so the site works as it does for everyone. To
          sign in as the owner, sign out and choose the owner's Google account.
        </p>
        <button type="button" className={`mt-3 ${ghostClass}`} disabled={busy !== null} onClick={out}>
          {busy === 'out' ? 'Signing out…' : 'Sign out'}
        </button>
      </>
    );
  } else if (loaded && email === null) {
    panel = (
      <>
        {error}
        <div className={stackClass}>
          <button type="button" className={ghostClass} disabled={busy !== null} onClick={google}>
            <GoogleIcon />
            {busy === 'google' ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          <button type="button" className={ghostClass} disabled={busy !== null} onClick={passkey}>
            <KeyIcon />
            {busy === 'passkey' ? 'Signing in…' : 'Sign in with a passkey'}
          </button>
        </div>
        <p className={`mt-3 ${signInStatusClass}`}>
          These controls are the owner's: any other account signs in to nothing extra. A passkey works once you've added
          one on this device.
        </p>
      </>
    );
  }

  return (
    <>
      <title>Sign in · The Game Room</title>
      <header className={pageHeaderClass}>
        <div className="mx-auto max-w-110">
          <h1 className={pageTitleClass}>{SIGN_IN_TITLE}</h1>
          <p className={pageDescClass}>{SIGN_IN_INTRO}</p>
        </div>
      </header>
      {panel && <div className={`${signInPanelClass} mx-auto`}>{panel}</div>}
    </>
  );
}

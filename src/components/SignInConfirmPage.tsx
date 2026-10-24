import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLinkToken } from '../hooks/useLinkToken';
import { request } from '../client/graphql';
import { SignInLinkLiveDocument, VerifySignInDocument } from '../gql/graphql';
import { linkProblem } from '../utils/emailedLinks';
import EmailedLinkPage from './EmailedLinkPage';
import { signInActionsClass, signInButtonClass, signInPrimaryClass, signInStatusClass } from './signInClasses';

const EXPIRED = 'This sign-in link has expired or was already used. Ask for a new one from the wishlist.';

type State = { kind: 'loading' } | { kind: 'live'; sending: boolean } | { kind: 'said'; title: string; text: string };

/**
 * /sign-in/confirm: where the owner's emailed sign-in link leads
 * (`?token=…`). Opening it only asks whether the link is still live; mail
 * scanners follow every link, so the token is used, and this browser
 * signed in for 30 days, only when Sign in is pressed. Then it goes to the
 * wishlist, where admin mode is on. A used, expired or mistyped link says
 * so. The token leaves the address at once (useLinkToken), and the page asks
 * not to be indexed and sends no referrer (vercel.json's Referrer-Policy
 * covers the moment before its code has loaded).
 */
export default function SignInConfirmPage() {
  const token = useLinkToken();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ token: string; state: State } | null>(null);
  const [pressed, setPressed] = useState<State | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void request(SignInLinkLiveDocument, { token }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      let state: State;
      if (!result.ok) state = { kind: 'said', title: linkProblem(result.code), text: result.error };
      else if (result.data.signInLinkLive) state = { kind: 'live', sending: false };
      else state = { kind: 'said', title: 'Link expired', text: EXPIRED };
      setLoaded({ token, state });
    });
    return () => controller.abort();
  }, [token]);

  const state: State = pressed ?? (loaded?.token === token ? loaded.state : { kind: 'loading' });

  const signIn = async () => {
    setPressed({ kind: 'live', sending: true });
    const result = await request(VerifySignInDocument, { token });
    if (result.ok) {
      navigate('/?c=want', { replace: true });
      return;
    }
    setPressed(
      result.code === 'FORBIDDEN'
        ? { kind: 'said', title: 'Link expired', text: result.error }
        : { kind: 'said', title: linkProblem(result.code), text: result.error },
    );
  };

  let title = 'Sign in to The Game Room?';
  if (state.kind === 'said') title = state.title;
  return (
    <EmailedLinkPage title={title}>
      {state.kind === 'loading' && <p className={signInStatusClass}>Loading…</p>}
      {state.kind === 'said' && (
        <p className={signInStatusClass} role="status">
          {state.text}
        </p>
      )}
      {state.kind === 'live' && (
        <>
          <p className={signInStatusClass}>This signs this browser in as the owner for 30 days.</p>
          <div className={`mt-1.5 ${signInActionsClass}`}>
            <button
              type="button"
              className={`h-10 ${signInButtonClass} ${signInPrimaryClass}`}
              disabled={state.sending}
              onClick={() => void signIn()}
            >
              {state.sending ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </>
      )}
    </EmailedLinkPage>
  );
}

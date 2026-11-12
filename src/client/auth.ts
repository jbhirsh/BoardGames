import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';

// The browser's side of the owner's sign-in (api/_auth.ts): Better Auth's
// client and its passkey plugin, talking to this site's own /api/auth,
// which sets the session cookie every API request then carries. Whether
// that session is the owner's is the API's to say (Query.session,
// hooks/useAuth.ts); this only signs in and out, adds a passkey, and reads
// whose account is signed in, which /sign-in shows to anyone who isn't the
// owner. Only the pages that sign in import it (components/SignInPage.tsx,
// and EmailedDecisionPage.tsx for an owner who opens an emailed link signed
// out), so it stays out of the home page's bundle.

const client = createAuthClient({ plugins: [passkeyClient()] });

/** How an action went: done, or Better Auth's (or WebAuthn's) code for why not. */
export type AuthOutcome = { ok: true } | { ok: false; code: string };

/** The code for a request that never got an answer. */
export const NETWORK = 'NETWORK';

/** An answer from Better Auth's client, as an outcome. */
function outcome(result: { error: { code?: string; status?: number } | null }): AuthOutcome {
  if (!result.error) return { ok: true };
  return { ok: false, code: result.error.code ?? (result.error.status ? `HTTP_${result.error.status}` : NETWORK) };
}

/** Runs one of the client's calls, a call that throws (no network) counting as NETWORK. */
async function attempt(call: () => Promise<{ error: { code?: string; status?: number } | null }>) {
  try {
    return outcome(await call());
  } catch {
    return { ok: false as const, code: NETWORK };
  }
}

/**
 * Sends the browser to Google to choose an account; it comes back to
 * `returnTo` (a path on this site, /sign-in by default; an emailed link's
 * page comes back to itself), or to /sign-in?error=<code> when Google or the
 * sign-in fails. Both are this deployment's own address in full: a
 * preview's sign-in returns through production (api/_auth.ts), whose
 * callback would read a bare path as its own page. Resolves only when it
 * couldn't start.
 */
export function signInWithGoogle(returnTo = '/sign-in'): Promise<AuthOutcome> {
  const origin = window.location.origin;
  return attempt(() =>
    client.signIn.social({
      provider: 'google',
      callbackURL: `${origin}${returnTo}`,
      errorCallbackURL: `${origin}/sign-in`,
    }),
  );
}

/** Signs in with a passkey this device holds (Face ID, Touch ID, a security key). */
export function signInWithPasskey(): Promise<AuthOutcome> {
  return attempt(() => client.signIn.passkey());
}

/**
 * Adds a passkey on this device to the signed-in account. The session must
 * have signed in within the day, or the answer is SESSION_NOT_FRESH.
 */
export function addPasskey(): Promise<AuthOutcome> {
  return attempt(() => client.passkey.addPasskey());
}

/** Ends this browser's session, on the server too. */
export function signOut(): Promise<AuthOutcome> {
  return attempt(() => client.signOut());
}

/** The signed-in account's email, or null when signed out (or the session can't be read). */
export async function signedInEmail(): Promise<string | null> {
  try {
    const { data } = await client.getSession();
    return data?.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * What /sign-in (components/SignInPage.tsx) says when signing in or out,
 * or adding a passkey, fails, by the code it failed with: Better Auth's, on
 * a Google sign-in that lands back on /sign-in?error=<code>, or the passkey
 * client's
 * (WebAuthn's codes among them). Always the page's own words: a code it
 * doesn't know gets a general line, and nothing from the address
 * (error_description included) is ever shown.
 */

/** A passkey prompt the person closed, or that timed out (the browser's NotAllowedError) or was replaced. */
const PASSKEY_CANCELLED = new Set(['AUTH_CANCELLED', 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'ERROR_CEREMONY_ABORTED']);

/** The request never got an answer (client/auth.ts's NETWORK). */
const OFFLINE = "Couldn't reach The Game Room. Check the connection and try again.";

const SIGN_IN: Record<string, string> = {
  access_denied: 'Signing in with Google was cancelled.',
  PASSKEY_NOT_FOUND: "This site doesn't know that passkey. Sign in with Google, then add a passkey on this device.",
  email_not_found: "Google didn't share an email address for that account, so it can't sign in here.",
  email_not_verified: "Google hasn't verified that account's email address, so it can't sign in here.",
  NETWORK: OFFLINE,
};

/** A sign-in that took too long, or whose start this browser no longer holds. */
const EXPIRED = new Set([
  'state_mismatch',
  'state_not_found',
  'please_restart_the_process',
  'invalid_state',
  'payload_expired',
  'missing_profile',
  'invalid_profile',
  'invalid_payload',
  'provider_mismatch',
  'CHALLENGE_NOT_FOUND',
]);

/** Google not answering as it should. */
const GOOGLE_UNAVAILABLE = new Set([
  'invalid_code',
  'no_code',
  'unable_to_get_user_info',
  'oauth_provider_not_found',
  'temporarily_unavailable',
  'server_error',
  'internal_server_error',
]);

/** What to say when signing in failed with `code`. */
export function signInProblem(code: string): string {
  if (Object.hasOwn(SIGN_IN, code)) return SIGN_IN[code];
  if (PASSKEY_CANCELLED.has(code)) return 'Signing in with a passkey was cancelled or timed out.';
  if (EXPIRED.has(code)) return 'That sign-in expired before it finished. Try again.';
  if (GOOGLE_UNAVAILABLE.has(code)) return "Google couldn't sign you in just now. Try again in a minute.";
  return "Signing in didn't work. Try again.";
}

/** What to say when adding a passkey failed with `code` (an old session's SESSION_NOT_FRESH is the page's own Notice). */
export function addPasskeyProblem(code: string): string {
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
    return 'This device already has a passkey for this account.';
  if (PASSKEY_CANCELLED.has(code)) return 'Adding the passkey was cancelled or timed out.';
  if (code === 'NETWORK') return OFFLINE;
  return 'No passkey was added. Try again.';
}

/** What to say when signing out failed with `code`. */
export function signOutProblem(code: string): string {
  return code === 'NETWORK' ? OFFLINE : "Signing out didn't work. Try again.";
}

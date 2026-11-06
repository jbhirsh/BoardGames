import { describe, it, expect } from 'vitest';
import { addPasskeyProblem, signInProblem, signOutProblem } from '../utils/signInErrors';

// Every code /sign-in has its own words for (utils/signInErrors.ts), and
// what it says for one it doesn't know.

const CANCELLED_PASSKEY = ['AUTH_CANCELLED', 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'ERROR_CEREMONY_ABORTED'];
const OFFLINE = "Couldn't reach The Game Room. Check the connection and try again.";

const SIGN_IN: Array<[string, string]> = [
  ['access_denied', 'Signing in with Google was cancelled.'],
  ['PASSKEY_NOT_FOUND', "This site doesn't know that passkey. Sign in with Google, then add a passkey on this device."],
  ['email_not_found', "Google didn't share an email address for that account, so it can't sign in here."],
  ['email_not_verified', "Google hasn't verified that account's email address, so it can't sign in here."],
  ['NETWORK', OFFLINE],
  ...CANCELLED_PASSKEY.map((code): [string, string] => [code, 'Signing in with a passkey was cancelled or timed out.']),
  ...[
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
  ].map((code): [string, string] => [code, 'That sign-in expired before it finished. Try again.']),
  ...[
    'invalid_code',
    'no_code',
    'unable_to_get_user_info',
    'oauth_provider_not_found',
    'temporarily_unavailable',
    'server_error',
    'internal_server_error',
  ].map((code): [string, string] => [code, "Google couldn't sign you in just now. Try again in a minute."]),
  // Codes it doesn't know, a property every object has among them.
  ['something_new', "Signing in didn't work. Try again."],
  ['toString', "Signing in didn't work. Try again."],
  ['', "Signing in didn't work. Try again."],
];

const ADD_PASSKEY: Array<[string, string]> = [
  ['ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', 'This device already has a passkey for this account.'],
  ...CANCELLED_PASSKEY.map((code): [string, string] => [code, 'Adding the passkey was cancelled or timed out.']),
  ['NETWORK', OFFLINE],
  ['FAILED_TO_VERIFY_REGISTRATION', 'No passkey was added. Try again.'],
  ['access_denied', 'No passkey was added. Try again.'],
];

describe('signInErrors', () => {
  it.each(SIGN_IN)('says signing in failed with %s in its own words', (code, text) => {
    expect(signInProblem(code)).toBe(text);
  });

  it.each(ADD_PASSKEY)('says adding a passkey failed with %s in its own words', (code, text) => {
    expect(addPasskeyProblem(code)).toBe(text);
  });

  it.each([
    ['NETWORK', OFFLINE],
    ['HTTP_500', "Signing out didn't work. Try again."],
  ])('says signing out failed with %s in its own words', (code, text) => {
    expect(signOutProblem(code)).toBe(text);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import SignInPage from '../components/SignInPage';
import { AuthContext } from '../context/authContextValue';
import type { Auth } from '../hooks/useAuth';
import { useAuth } from '../context/useAuth';
import type { AuthOutcome } from '../client/auth';
import { renderRouted } from './routed';

// The page's own words for each state and failure; Better Auth's client
// (client/auth.ts) is the test's.
const client = vi.hoisted(() => ({
  signInWithGoogle: vi.fn<() => Promise<AuthOutcome>>(),
  signInWithPasskey: vi.fn<() => Promise<AuthOutcome>>(),
  addPasskey: vi.fn<() => Promise<AuthOutcome>>(),
  signOut: vi.fn<() => Promise<AuthOutcome>>(),
  signedInEmail: vi.fn<() => Promise<string | null>>(),
}));
vi.mock('../client/auth', () => client);

const OK: AuthOutcome = { ok: true };
const failed = (code: string): AuthOutcome => ({ ok: false, code });

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset();
  client.signedInEmail.mockResolvedValue(null);
});

/** The page at `entry`, under an owner session state of the test's own. */
function renderPage(over: Partial<Auth> = {}, entry = '/sign-in') {
  const auth: Auth = { admin: false, loaded: true, refresh: vi.fn(async () => {}), ...over };
  const router = renderRouted(
    <AuthContext.Provider value={auth}>
      <SignInPage />
    </AuthContext.Provider>,
    [entry],
    '/sign-in',
  );
  return { auth, router };
}

const googleButton = () => screen.findByRole('button', { name: 'Sign in with Google' });

describe('SignInPage', () => {
  it('is signed out outside the provider, which never refreshes anything', async () => {
    renderRouted(<SignInPage />, ['/sign-in'], '/sign-in');
    expect(await googleButton()).toBeInTheDocument();
    const { result } = renderHook(() => useAuth());
    expect(result.current).toMatchObject({ admin: false, loaded: true });
    await expect(result.current.refresh()).resolves.toBeUndefined();
  });

  it('shows only the heading until the session check settles', () => {
    renderPage({ loaded: false });
    expect(screen.getByRole('heading', { name: 'Owner sign-in' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(client.signedInEmail).not.toHaveBeenCalled();
  });

  it('offers Google and a passkey when signed out, and says whose controls they are', async () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Back to The Game Room/ })).toHaveAttribute('href', '/');
    expect(await googleButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeEnabled();
    expect(
      screen.getByText(
        "These controls are the owner's: any other account signs in to nothing extra. A passkey works once you've added one on this device.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves for Google, its button busy while it goes', async () => {
    client.signInWithGoogle.mockResolvedValue(OK);
    renderPage();
    fireEvent.click(await googleButton());
    expect(await screen.findByRole('button', { name: 'Opening Google…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled();
    expect(client.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("comes back from Google's page (the browser's cached copy) ready to try again", async () => {
    client.signInWithGoogle.mockResolvedValue(OK);
    renderPage();
    fireEvent.click(await googleButton());
    expect(await screen.findByRole('button', { name: 'Opening Google…' })).toBeDisabled();
    // A fresh load of the page isn't the cached copy, and changes nothing.
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
    expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeEnabled();
  });

  it("says why Google couldn't start", async () => {
    client.signInWithGoogle.mockResolvedValue(failed('NETWORK'));
    renderPage();
    fireEvent.click(await googleButton());
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach The Game Room.");
    expect(await googleButton()).toBeEnabled();
  });

  it.each([
    ['access_denied', 'Signing in with Google was cancelled.'],
    ['state_mismatch', 'That sign-in expired before it finished. Try again.'],
    ['unable_to_get_user_info', "Google couldn't sign you in just now. Try again in a minute."],
    ['email_not_found', "Google didn't share an email address for that account"],
    ['something_new', "Signing in didn't work. Try again."],
  ])(
    "shows Google's %s in its own words at the top of the panel, and takes it out of the address",
    async (code, text) => {
      const { router } = renderPage({}, `/sign-in?error=${code}&error_description=%3Cb%3EEvil%20words%3C%2Fb%3E`);
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(screen.queryByText(/Evil words/)).not.toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe(''));
      expect(router.state.historyAction).toBe('REPLACE');
      expect(screen.getByRole('alert')).toHaveTextContent(text);
    },
  );

  it('signs in with a passkey, then asks who this is', async () => {
    client.signInWithPasskey.mockResolvedValue(OK);
    const { auth } = renderPage();
    client.signedInEmail.mockResolvedValue('sam.rivera@gmail.com');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/You're signed in as sam\.rivera@gmail\.com/)).toBeInTheDocument();
  });

  it.each([
    ['AUTH_CANCELLED', 'Signing in with a passkey was cancelled or timed out.'],
    ['ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'Signing in with a passkey was cancelled or timed out.'],
    ['PASSKEY_NOT_FOUND', "This site doesn't know that passkey."],
    ['CHALLENGE_NOT_FOUND', 'That sign-in expired before it finished.'],
  ])('says why a passkey sign-in failed (%s)', async (code, text) => {
    client.signInWithPasskey.mockResolvedValue(failed(code));
    const { auth } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeEnabled();
  });

  it("says whose account another Google sign-in is, and that it's no one special", async () => {
    client.signedInEmail.mockResolvedValue('sam.rivera@gmail.com');
    client.signOut.mockResolvedValue(OK);
    const { auth } = renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(
      "You're signed in as sam.rivera@gmail.com, which isn't the owner's account, so the site works as it does for everyone. To sign in as the owner, sign out and choose the owner's Google account.",
    );
    expect(screen.queryByRole('link', { name: 'Go to the wishlist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /passkey/ })).not.toBeInTheDocument();

    client.signedInEmail.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await googleButton()).toBeInTheDocument();
    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('offers the owner the wishlist, a passkey and a sign-out', async () => {
    renderPage({ admin: true });
    expect(screen.getByRole('status')).toHaveTextContent("You're signed in as the owner on this browser.");
    expect(screen.getByRole('link', { name: 'Go to the wishlist' })).toHaveAttribute('href', '/?c=want');
    expect(screen.getByRole('button', { name: 'Add a passkey on this device' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(client.signedInEmail).not.toHaveBeenCalled();
  });

  it('adds a passkey, then says Face ID is next and offers no second one', async () => {
    let resolve: (o: AuthOutcome) => void = () => {};
    client.addPasskey.mockReturnValue(new Promise((r) => (resolve = r)));
    const { auth } = renderPage({ admin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }));
    expect(screen.getByRole('button', { name: 'Adding a passkey…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    await act(async () => resolve(OK));
    expect(await screen.findByText('Passkey added. Next time, sign in with Face ID.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a passkey/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the wishlist' })).toBeInTheDocument();
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('asks for Google again first on a session over a day old, which comes back here', async () => {
    client.addPasskey.mockResolvedValue(failed('SESSION_NOT_FRESH'));
    client.signInWithGoogle.mockResolvedValue(OK);
    renderPage({ admin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }));
    const notice = await screen.findByText(/Adding a passkey needs a sign-in from today/);
    expect(notice).toHaveTextContent('Adding a passkey needs a sign-in from today: sign in with Google again first.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => expect(client.signInWithGoogle).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', 'This device already has a passkey for this account.'],
    ['ERROR_CEREMONY_ABORTED', 'Adding the passkey was cancelled or timed out.'],
    ['NETWORK', "Couldn't reach The Game Room."],
    ['FAILED_TO_VERIFY_REGISTRATION', 'No passkey was added. Try again.'],
  ])('says why adding a passkey failed (%s)', async (code, text) => {
    client.addPasskey.mockResolvedValue(failed(code));
    renderPage({ admin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Add a passkey on this device' })).toBeEnabled();
  });

  it("signs the owner out on the server, and says so if it couldn't", async () => {
    client.signOut.mockResolvedValue(failed('NETWORK'));
    const { auth } = renderPage({ admin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach The Game Room.");
    expect(auth.refresh).not.toHaveBeenCalled();

    client.signOut.mockResolvedValue(failed('HTTP_500'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Signing out didn't work. Try again."));

    client.signOut.mockResolvedValue(OK);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

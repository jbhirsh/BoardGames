import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import SignInConfirmPage from '../components/SignInConfirmPage';
import { renderRouted } from './routed';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';

const TOKEN = 'test-token-' + 'a'.repeat(21);
const open = (token = TOKEN) =>
  renderRouted(<SignInConfirmPage />, [`/sign-in/confirm?token=${token}`], '/sign-in/confirm');

describe('SignInConfirmPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('only reads the link on opening, and signs in when the button is pressed', async () => {
    const spy = stubGraphql({
      SignInLinkLive: () => ({ signInLinkLive: true }),
      VerifySignIn: () => ({ verifySignIn: { admin: true } }),
    });
    const router = open();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sign in to The Game Room?' })).toBeInTheDocument();
    expect(screen.getByText('This signs this browser in as the owner for 30 days.')).toBeInTheDocument();
    expect(operations(spy)).toEqual([
      { operationName: 'SignInLinkLive', query: expect.any(String) as unknown, variables: { token: TOKEN } },
    ]);
    expect(router.state.location).toMatchObject({ search: '', state: { token: TOKEN } });
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?c=want');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(operations(spy).at(-1)).toMatchObject({ operationName: 'VerifySignIn', variables: { token: TOKEN } });
  });

  it('says when the link has expired or was used', async () => {
    stubGraphql({ SignInLinkLive: () => ({ signInLinkLive: false }) });
    open();
    expect(await screen.findByRole('heading', { name: 'Link expired' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'This sign-in link has expired or was already used. Ask for a new one from the wishlist.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when the link is mistyped', async () => {
    stubGraphql({
      SignInLinkLive: () =>
        gqlError(
          'This sign-in link is incomplete or mistyped. Ask for a new one from the wishlist.',
          'BAD_REQUEST',
          400,
        ),
    });
    open('nope');
    expect(await screen.findByRole('heading', { name: 'Link not recognised' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/incomplete or mistyped/);
  });

  it('says so when the link is used up between opening and pressing, or the press fails', async () => {
    stubGraphql({
      SignInLinkLive: () => ({ signInLinkLive: true }),
      VerifySignIn: () =>
        gqlError(
          'This sign-in link has expired or was already used. Ask for a new one from the wishlist.',
          'FORBIDDEN',
          403,
        ),
    });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Link expired' })).toBeInTheDocument();

    stubGraphql({
      SignInLinkLive: () => ({ signInLinkLive: true }),
      VerifySignIn: () => gqlError('Server error', 'INTERNAL_SERVER_ERROR', 500),
    });
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sign in' })).at(-1)!);
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
  });
});

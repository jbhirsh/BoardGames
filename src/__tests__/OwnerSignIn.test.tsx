import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import OwnerSignIn from '../components/OwnerSignIn';
import { AuthContext } from '../context/authContextValue';
import type { Auth } from '../hooks/useAuth';
import { useAuth } from '../context/useAuth';

function renderWith(over: Partial<Auth> = {}) {
  const auth: Auth = {
    admin: false,
    loaded: true,
    requestLink: vi.fn(async () => ({ ok: true as const })),
    logout: vi.fn(async () => {}),
    ...over,
  };
  render(<AuthContext.Provider value={auth}><OwnerSignIn /></AuthContext.Provider>);
  return auth;
}

describe('OwnerSignIn', () => {
  it('is signed out and unavailable outside the provider', async () => {
    render(<OwnerSignIn />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Owner sign-in' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sign-in is not available here'));
    const { result } = renderHook(() => useAuth());
    expect(result.current.admin).toBe(false);
    await expect(result.current.logout()).resolves.toBeUndefined();
  });

  it('renders nothing until the session check settles', () => {
    const { container } = render(<AuthContext.Provider value={{ admin: false, loaded: false, requestLink: vi.fn(), logout: vi.fn() }}><OwnerSignIn /></AuthContext.Provider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a sign-out when signed in', () => {
    const auth = renderWith({ admin: true });
    expect(screen.getByRole('status')).toHaveTextContent('Signed in as the owner');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('asks for a link with the trimmed address and never confirms whether it was the owner', async () => {
    const auth = renderWith();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  jess@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("If that's the owner's address, a link is on its way."));
    expect(auth.requestLink).toHaveBeenCalledWith('jess@example.com');
  });

  it('shows the reason when the request fails and ignores a second submit while sending', async () => {
    let resolve: (v: { ok: false; error: string }) => void = () => {};
    const requestLink = vi.fn(() => new Promise<{ ok: false; error: string }>((r) => { resolve = r; }));
    renderWith({ requestLink });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    const form = screen.getByRole('form', { name: 'Owner sign-in' });
    fireEvent.submit(form);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    fireEvent.submit(form);
    expect(requestLink).toHaveBeenCalledTimes(1);
    resolve({ ok: false, error: 'Sign-in is not set up yet' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sign-in is not set up yet'));
  });
});

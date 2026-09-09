import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../context/useAuth';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * The owner's way into admin mode: an email address, a magic link in the
 * inbox, and this browser is signed in for 30 days. Signed in, it shows the
 * way out.
 */
export default function OwnerSignIn() {
  const { admin, loaded, requestLink, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const uid = useId();

  if (!loaded) return null;

  if (admin) {
    return (
      <p className="owner-bar" role="status">
        Signed in as the owner: pending suggestions, edit and remove controls are showing.{' '}
        <button type="button" className="owner-link" onClick={() => void logout()}>Sign out</button>
      </p>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.kind === 'sending') return;
    setStatus({ kind: 'sending' });
    const result = await requestLink(email.trim());
    setStatus(result.ok ? { kind: 'sent' } : { kind: 'error', message: result.error });
  };

  return (
    <details className="owner-signin">
      <summary className="owner-summary">Jess? Sign in to manage the wishlist</summary>
      <form className="owner-form" onSubmit={onSubmit} aria-label="Owner sign-in">
        <label className="suggest-label" htmlFor={`${uid}-email`}>Email</label>
        <input
          id={`${uid}-email`}
          className="suggest-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <button type="submit" className="suggest-btn" disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        <span className="suggest-status" role="status" aria-live="polite">
          {status.kind === 'sent' && "If that's the owner's address, a link is on its way. It works once and expires in 15 minutes."}
          {status.kind === 'error' && status.message}
        </span>
      </form>
    </details>
  );
}

import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/useAuth';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * /sign-in: the owner's way into admin mode. An email address, a magic
 * link in the inbox, and this browser is signed in for 30 days. Nothing on
 * the home page points here; the owner knows the address.
 */
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
    <div className="rules-page">
      <header className="rules-header">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <h1 className="rules-game-name">Owner sign-in</h1>
        <p className="rules-game-desc">Signed in, the wishlist shows the suggestions waiting for a decision, a form to add games directly, and edit and remove controls on every stored entry.</p>
      </header>
      {loaded && admin && (
        <div className="signin-panel">
          <p className="signin-status" role="status">You're signed in as the owner on this browser.</p>
          <div className="signin-actions">
            <Link to="/?c=want" className="signin-btn signin-link-btn">Go to the wishlist</Link>
            <button type="button" className="signin-btn signin-btn--ghost" onClick={() => void logout()}>Sign out</button>
          </div>
        </div>
      )}
      {loaded && !admin && (
        <div className="signin-panel">
          <form className="signin-form" onSubmit={onSubmit} aria-label="Owner sign-in">
            <label className="signin-label" htmlFor={`${uid}-email`}>Email</label>
            <input
              id={`${uid}-email`}
              className="signin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            <div className="signin-actions">
              <button type="submit" className="signin-btn" disabled={status.kind === 'sending'}>
                {status.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </div>
            <p className="signin-status" role="status" aria-live="polite">
              {status.kind === 'sent' && "If that's the owner's address, a link is on its way. It works once and expires in 15 minutes."}
              {status.kind === 'error' && status.message}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLinkToken } from '../hooks/useLinkToken';
import { renderRouted } from './routed';

function Shows() {
  return <p>token: {useLinkToken() || '(none)'}</p>;
}

describe('useLinkToken', () => {
  it('moves the token from the address into the state, keeping the rest of the address', async () => {
    const router = renderRouted(<Shows />, ['/approve?id=sug-1&token=abc&game=Root#x'], '/approve');
    expect(screen.getByText('token: abc')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe('?id=sug-1&game=Root'));
    expect(router.state.location).toMatchObject({ pathname: '/approve', hash: '#x', state: { token: 'abc' } });
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText('token: abc')).toBeInTheDocument();
  });

  it('reads the state on a reload, and is empty with neither', () => {
    renderRouted(<Shows />, [{ pathname: '/deny', search: '?id=sug-1', state: { token: 'abc' } }], '/deny');
    expect(screen.getByText('token: abc')).toBeInTheDocument();
    document.body.innerHTML = '';
    for (const state of [null, { token: 7 }, 'abc']) {
      renderRouted(<Shows />, [{ pathname: '/deny', state }], '/deny');
      expect(screen.getByText('token: (none)')).toBeInTheDocument();
      document.body.innerHTML = '';
    }
  });

  it('leaves a bare address with no search behind', async () => {
    const router = renderRouted(<Shows />, ['/sign-in/confirm?token=abc'], '/sign-in/confirm');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

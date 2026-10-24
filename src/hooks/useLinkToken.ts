import { useEffect } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';

/** The token a history entry carries in its state, once taken out of the address. */
function tokenIn(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('token' in state)) return null;
  const { token }: { token?: unknown } = state;
  return typeof token === 'string' ? token : null;
}

/**
 * The token an emailed link carries (`?token=…`), taken out of the address
 * as soon as the page has it and kept in the history entry's state instead,
 * which survives a reload. So nothing that reads the address afterwards
 * (Sentry's session replay, a Referer, a copied link) carries it. Opened
 * again without either (a link copied from the address bar), it is empty,
 * and the page says the link is incomplete.
 */
export function useLinkToken(): string {
  const location: Location<unknown> = useLocation();
  const navigate = useNavigate();
  const inAddress = new URLSearchParams(location.search).get('token');
  const token = inAddress ?? tokenIn(location.state) ?? '';

  useEffect(() => {
    if (inAddress === null) return;
    const rest = new URLSearchParams(location.search);
    rest.delete('token');
    const search = rest.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: { token: inAddress } },
    );
  }, [inAddress, location.pathname, location.search, location.hash, navigate]);

  return token;
}

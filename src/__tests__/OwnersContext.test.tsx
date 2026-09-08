import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OwnersProvider } from '../context/OwnersContext';
import { useOwners } from '../context/useOwners';

function Probe() {
  const { owners, loaded } = useOwners();
  return <span>{loaded ? `loaded:${(owners.a ?? []).join('+')}` : 'loading'}</span>;
}

describe('OwnersProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads ownership for its ids and shares it with descendants', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, json: async () => ({ owners: { a: ['Alex'] }, mine: [] }) } as unknown as Response,
    );
    render(<OwnersProvider ids={['a']}><Probe /></OwnersProvider>);
    await waitFor(() => expect(screen.getByText('loaded:Alex')).toBeInTheDocument());
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GamesProvider } from '../context/GamesContext';
import { useGames } from '../context/useGames';
import { GAMES } from '../data/games';
import { stubGraphql, gqlError } from './helpers/graphqlFetch';
import { gamesAnswer, WISHLIST } from './helpers/wishlist';

function Probe() {
  const games = useGames();
  const catan = games.collection.find((g) => g.slug === 'catan')!;
  return (
    <>
      <p>
        {games.loaded ? 'loaded' : 'waiting'}
        {games.failed ? ' failed' : ''} {games.wishlist.length} wishlist, Catan {String(catan.weight)}
      </p>
      <button onClick={games.reload}>reload</button>
    </>
  );
}

describe('GamesProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it("asks the games query once, by GET, and gives the wishlist and the collection BGG's data", async () => {
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    const spy = stubGraphql({
      Games: () => gamesAnswer([], [{ bggId: catan.bgg!, summary: null, weight: 2.3, honours: [] }]),
    });
    render(
      <GamesProvider>
        <Probe />
      </GamesProvider>,
    );
    expect(screen.getByText(/^waiting 0 wishlist, Catan undefined$/)).toBeInTheDocument();
    expect(await screen.findByText(`loaded ${WISHLIST.length} wishlist, Catan 2.3`)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/^\/api\/graphql\?query=/);
  });

  it("asks a reload for the network's answer, past the service worker's saved copy, and the first ask not", async () => {
    const spy = stubGraphql({ Games: () => gamesAnswer() });
    render(
      <GamesProvider>
        <Probe />
      </GamesProvider>,
    );
    await screen.findByText(new RegExp(`^loaded ${WISHLIST.length} wishlist`));
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[0][1]).not.toHaveProperty('cache');
    expect(spy.mock.calls[1][1]).toHaveProperty('cache', 'reload');
  });

  it('settles on a failure with an empty wishlist, marked failed, and a failed reload keeps what it had, unmarked', async () => {
    let fail = true;
    stubGraphql({ Games: () => (fail ? gqlError('down', 'UNAVAILABLE', 503) : gamesAnswer()) });
    render(
      <GamesProvider>
        <Probe />
      </GamesProvider>,
    );
    // Failed, with nothing to show: the wishlist says so.
    expect(await screen.findByText(/^loaded failed 0 wishlist/)).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    expect(await screen.findByText(new RegExp(`^loaded ${WISHLIST.length} wishlist`))).toBeInTheDocument();
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`^loaded ${WISHLIST.length} wishlist`))).toBeInTheDocument(),
    );
  });
});

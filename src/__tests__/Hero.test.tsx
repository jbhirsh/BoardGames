import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Hero from '../components/Hero';
import { FilterProvider } from '../context/FilterContext';
import { WishlistProvider } from '../context/WishlistContext';
import { useFilter } from '../context/useFilter';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import { collectionSpan } from '../utils/collectionStats';

function ModeProbe() {
  const { state } = useFilter();
  return <output data-testid="mode">{state.collection}</output>;
}

function renderHero() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <Hero />
        <ModeProbe />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('Hero', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title', () => {
    renderHero();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain('Game');
    expect(heading.textContent).toContain('Room');
  });

  it('states the collection size and span from the data, not literals', () => {
    renderHero();
    const { shortest, longest } = collectionSpan(GAMES);
    expect(
      screen.getByText(`${GAMES.length} games, ${shortest} to ${longest}. What fits tonight?`)
    ).toBeInTheDocument();
  });

  it('offers the random picker above the fold', () => {
    renderHero();
    expect(screen.getByRole('button', { name: /Pick for us/i })).toBeInTheDocument();
  });

  it('links to the collection', () => {
    renderHero();
    const browse = screen.getByRole('link', { name: new RegExp(`Browse all ${GAMES.length}`) });
    expect(browse).toHaveAttribute('href', '#collection');
  });

  it('offers a way into the wishlist with its size', () => {
    renderHero();
    const want = screen.getByRole('link', { name: new RegExp(`See the ${WISHLIST.length} we want`) });
    expect(want).toHaveAttribute('href', '#collection');
  });

  it('counts approved friend suggestions in the wishlist link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'sug-abc123', game: 'Root', name: 'Alex', note: '' }] }),
    } as unknown as Response);
    render(
      <MemoryRouter>
        <FilterProvider>
          <WishlistProvider>
            <Hero />
          </WishlistProvider>
        </FilterProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: `See the ${WISHLIST.length + 1} we want` })).toBeInTheDocument();
  });

  it('switches between the owned collection and the wishlist', async () => {
    const user = userEvent.setup();
    renderHero();
    expect(screen.getByTestId('mode')).toHaveTextContent('own');
    await user.click(screen.getByRole('link', { name: new RegExp(`See the ${WISHLIST.length} we want`) }));
    expect(screen.getByTestId('mode')).toHaveTextContent('want');
    await user.click(screen.getByRole('link', { name: new RegExp(`Browse all ${GAMES.length}`) }));
    expect(screen.getByTestId('mode')).toHaveTextContent('own');
  });

  it('scrolls to whichever section carries the anchor after switching', async () => {
    // jsdom has no scrollIntoView; the section stands in for the one App
    // gives the id to after the mode switch.
    const scrollIntoView = vi.fn();
    // Let frames queued by earlier clicks in this file settle before the
    // probe section exists, so only this click's scroll is counted.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    render(
      <MemoryRouter>
        <FilterProvider>
          <Hero />
          <section id="collection" ref={(el) => { if (el) el.scrollIntoView = scrollIntoView; }} />
        </FilterProvider>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: new RegExp(`See the ${WISHLIST.length} we want`) });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    // The native fragment jump is suppressed; the scroll is ours.
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it('no longer renders the inert stat strip', () => {
    const { container } = renderHero();
    expect(container.querySelector('.hero-stats')).toBeNull();
    expect(container.querySelector('.hero-eyebrow')).toBeNull();
    expect(screen.queryByText('Player Range')).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import NoResults from '../components/NoResults';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';

function Probe() {
  const { state } = useFilter();
  return <output>{`${state.collection}|${state.players}|${state.duration}|${state.search}`}</output>;
}

function renderAt(url: string, kind: 'games' | 'wishlist' = 'games') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <section id="collection"><h2 className="sec-title" tabIndex={-1}>Our Collection</h2></section>
        <NoResults kind={kind} />
        <Probe />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('NoResults', () => {
  it('names the filters in play', () => {
    renderAt('/?p=10&d=quick');
    expect(screen.getByText('No games match your filters.')).toBeInTheDocument();
    expect(screen.getByText('Filtering for ≤ 15 min and 10 players.')).toBeInTheDocument();
  });

  it('offers to drop a filter that would bring games back, and drops it', () => {
    renderAt('/?p=10&d=quick');
    const options = screen.getAllByRole('button', { name: /^Drop / });
    expect(options.length).toBeGreaterThan(0);
    const drop = screen.getByRole('button', { name: /^Drop ≤ 15 min, \d+ games?$/ });
    // The arrow is decoration; the name reads "Drop ≤ 15 min, 3 games".
    expect(drop).toHaveTextContent(/^Drop ≤ 15 min → \d+ games?$/);
    fireEvent.click(drop);
    expect(screen.getByRole('status')).toHaveTextContent(/^own\|10\|all\|$/);
  });

  it('hands focus to the section heading once the list comes back', async () => {
    renderAt('/?p=10&d=quick');
    fireEvent.click(screen.getByRole('button', { name: /^Drop ≤ 15 min, / }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Our Collection' })).toHaveFocus());
  });

  it('lists keywords as alternatives in any-keyword mode', () => {
    renderAt('/?p=10&k=word,party');
    expect(screen.getByText(/^Filtering for 10 players and .+ or .+\.$/)).toBeInTheDocument();
  });

  it('points to the wishlist when it has games that fit', () => {
    renderAt('/?q=splendor');
    const other = screen.getByRole('button', { name: /^1 game on the wishlist fits$/ });
    fireEvent.click(other);
    expect(screen.getByRole('status')).toHaveTextContent(/^want\|/);
  });

  it('points back to the collection from an empty wishlist', () => {
    renderAt('/?c=want&q=azul', 'wishlist');
    expect(screen.getByText('No wishlist games match your filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /we own fits?$/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/^own\|/);
  });

  it('still clears everything', () => {
    renderAt('/?p=10&d=quick');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('status')).toHaveTextContent(/^own\|0\|all\|$/);
  });
});

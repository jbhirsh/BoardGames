import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CollectionToggle from '../components/CollectionToggle';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';

function Probe() {
  const { state } = useFilter();
  return <output>{state.collection}</output>;
}

function renderToggle(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <CollectionToggle />
        <Probe />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('CollectionToggle', () => {
  it('marks the owned games as selected by default', () => {
    renderToggle();
    expect(screen.getByRole('button', { name: 'We own' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'We want' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the filter state and reflects the URL mode', () => {
    renderToggle('/?c=want');
    expect(screen.getByRole('button', { name: 'We want' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'We own' }));
    expect(screen.getByRole('button', { name: 'We own' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('own');
  });

  it('hands focus to the twin button in the section now showing', async () => {
    // As on the home page: a toggle in each section, and only the one on
    // show carries the anchor.
    function Sections() {
      const { state } = useFilter();
      return (
        <>
          <section aria-label="own" id={state.collection === 'own' ? 'collection' : undefined}><CollectionToggle /></section>
          <section aria-label="want" id={state.collection === 'want' ? 'collection' : undefined}><CollectionToggle /></section>
        </>
      );
    }
    render(
      <MemoryRouter>
        <FilterProvider>
          <Sections />
        </FilterProvider>
      </MemoryRouter>,
    );
    fireEvent.click(within(screen.getByRole('region', { name: 'own' })).getByRole('button', { name: 'We want' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'want' })).getByRole('button', { name: 'We want' })).toHaveFocus());
  });
});

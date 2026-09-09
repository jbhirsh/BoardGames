import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});

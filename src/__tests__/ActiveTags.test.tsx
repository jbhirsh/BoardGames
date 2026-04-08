import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ActiveTags from '../components/ActiveTags';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

function renderActiveTags() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <FilterBar />
        <ActiveTags />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('ActiveTags', () => {
  it('is hidden when no filters are active', () => {
    const { container } = render(
      <FilterProvider>
        <ActiveTags />
      </FilterProvider>
    );
    const tags = container.querySelector('.atags');
    expect(tags).not.toHaveClass('show');
  });

  it('shows a duration tag when a duration filter is set and clears on click', () => {
    renderActiveTags();

    // Open the duration dropdown
    const durationBtn = screen.getByRole('button', { name: /Duration/ });
    fireEvent.click(durationBtn);
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    // The active tag should appear
    const tag = screen.getByText(/\u2264 15 min.*\u2715/);
    expect(tag).toHaveClass('atag');

    // Click to clear
    fireEvent.click(tag);
  });

  it('shows a players tag when a player filter is set and clears on click', () => {
    renderActiveTags();

    const playersBtn = screen.getByRole('button', { name: /Players/ });
    fireEvent.click(playersBtn);
    fireEvent.click(screen.getByText('4 players'));

    const tag = screen.getByRole('button', { name: /4 players.*\u2715/ });
    expect(tag).toHaveClass('atag');
    fireEvent.click(tag);
  });

  it('shows keyword tags when keywords are selected and removes on click', () => {
    renderActiveTags();

    const kwBtn = screen.getByRole('button', { name: /Keywords/ });
    fireEvent.click(kwBtn);

    // Click a keyword in the dropdown
    const ddOpt = screen.getByText('Bluffing').closest('.dd-opt');
    fireEvent.click(ddOpt!);

    // An atag for the keyword should exist
    const activeTag = screen.getByRole('button', { name: /Bluffing.*\u2715/ });
    expect(activeTag).toHaveClass('atag');
    fireEvent.click(activeTag);
  });

  it('shows a search tag and clears on click', () => {
    renderActiveTags();

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'test' } });

    const tag = screen.getByRole('button', { name: /test.*\u2715/ });
    expect(tag).toHaveClass('atag');

    fireEvent.click(tag);
    expect(input).toHaveValue('');
  });

  it('shows Clear all button and clears everything', () => {
    renderActiveTags();

    const durationBtn = screen.getByRole('button', { name: /Duration/ });
    fireEvent.click(durationBtn);
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    const clearAll = screen.getByText('Clear all');
    expect(clearAll).toBeInTheDocument();
    fireEvent.click(clearAll);
  });
});

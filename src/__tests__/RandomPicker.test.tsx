import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RandomPicker from '../components/RandomPicker';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

function renderPicker() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <FilterBar />
        <RandomPicker />
        <Routes>
          <Route path="/rules/:slug" element={<div>rules page</div>} />
          <Route path="*" element={null} />
        </Routes>
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('RandomPicker', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('renders enabled when games are available', () => {
    renderPicker();
    const btn = screen.getByRole('button', { name: /Pick a random game/ });
    expect(btn).toBeEnabled();
  });

  it('is disabled when no games match the active filter', () => {
    renderPicker();
    const searchInput = screen.getByPlaceholderText('Search games...');
    fireEvent.change(searchInput, { target: { value: '__no_such_game__' } });

    expect(screen.getByRole('button', { name: /Pick a random game/ })).toBeDisabled();
  });

  it('opens a modal showing a game when clicked, then resolves after spinning', () => {
    renderPicker();
    const btn = screen.getByRole('button', { name: /Pick a random game/ });

    act(() => {
      fireEvent.click(btn);
    });

    // Modal opens immediately with an initial pick while spinning
    expect(screen.getByRole('dialog', { name: /Random game pick/ })).toBeInTheDocument();
    expect(screen.getByText('Spinning…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View rules/ })).toBeNull();

    // Advance past the spin duration
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText('Spinning…')).toBeNull();
    expect(screen.getByText('Tonight, play')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View rules/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick again/ })).toBeInTheDocument();
  });

  it('closes the modal when the close button is clicked', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick a random game/ })));
    act(() => vi.advanceTimersByTime(2000));

    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    act(() => fireEvent.click(closeBtns[0]));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the modal when Escape is pressed', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick a random game/ })));
    act(() => vi.advanceTimersByTime(2000));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('navigates to the rules page for the picked game', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick a random game/ })));
    act(() => vi.advanceTimersByTime(2000));

    act(() => fireEvent.click(screen.getByRole('button', { name: /View rules/ })));

    expect(screen.getByText('rules page')).toBeInTheDocument();
  });

  it('respawns a new spin when Pick again is clicked', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick a random game/ })));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('Spinning…')).toBeNull();

    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick again/ })));
    expect(screen.getByText('Spinning…')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RandomPicker from '../components/RandomPicker';
import { pickRandom } from '../utils/pickRandom';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

describe('pickRandom', () => {
  it('throws on empty pool', () => {
    expect(() => pickRandom([])).toThrow('pool empty');
  });

  it('returns the only element when pool length is 1', () => {
    expect(pickRandom(['a'])).toBe('a');
    expect(pickRandom(['a'], 'a')).toBe('a');
  });

  it('never returns the excluded element, even at the last index', () => {
    const pool = ['a', 'b', 'c', 'd'];
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
      // Without exclude: uniform pick lands on the last element.
      expect(pickRandom(pool)).toBe('d');
      // With exclude='d': candidates = ['a','b','c'], uniform draw at 0.999 -> 'c'
      expect(pickRandom(pool, 'd')).toBe('c');
    } finally {
      random.mockRestore();
    }
  });

  it('draws uniformly from the non-excluded candidates', () => {
    const pool = ['a', 'b', 'c'];
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      // candidates excluding 'a' = ['b','c']; index 0 = 'b'
      expect(pickRandom(pool, 'a')).toBe('b');
    } finally {
      random.mockRestore();
    }
  });

  it('falls back to the first pool element when every item equals exclude', () => {
    const pool = ['a', 'a', 'a'];
    expect(pickRandom(pool, 'a')).toBe('a');
  });
});

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
    const btn = screen.getByRole('button', { name: /^Pick for us$/ });
    expect(btn).toBeEnabled();
  });

  it('is disabled when no games match the active filter', () => {
    renderPicker();
    const searchInput = screen.getByPlaceholderText('Search games...');
    fireEvent.change(searchInput, { target: { value: '__no_such_game__' } });

    expect(screen.getByRole('button', { name: /^Pick for us$/ })).toBeDisabled();
  });

  it('opens a modal showing a game when clicked, then resolves after spinning', () => {
    renderPicker();
    const btn = screen.getByRole('button', { name: /^Pick for us$/ });

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
    expect(screen.getByText(/^Tonight, play — /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View rules/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick again/ })).toBeInTheDocument();
  });

  it('closes the modal when the close button is clicked', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Pick for us$/ })));
    act(() => vi.advanceTimersByTime(2000));

    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    act(() => fireEvent.click(closeBtns[0]));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the modal when Escape is pressed', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Pick for us$/ })));
    act(() => vi.advanceTimersByTime(2000));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('navigates to the rules page for the picked game', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Pick for us$/ })));
    act(() => vi.advanceTimersByTime(2000));

    act(() => fireEvent.click(screen.getByRole('button', { name: /View rules/ })));

    expect(screen.getByText('rules page')).toBeInTheDocument();
  });

  it('respawns a new spin when Pick again is clicked', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Pick for us$/ })));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('Spinning…')).toBeNull();

    act(() => fireEvent.click(screen.getByRole('button', { name: /Pick again/ })));
    expect(screen.getByText('Spinning…')).toBeInTheDocument();
  });

  it('returns focus to the trigger button when closed', () => {
    renderPicker();
    const trigger = screen.getByRole('button', { name: /^Pick for us$/ });
    act(() => fireEvent.click(trigger));
    act(() => vi.advanceTimersByTime(2000));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab focus inside the dialog', () => {
    renderPicker();
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Pick for us$/ })));
    act(() => vi.advanceTimersByTime(2000));

    const pickAgain = screen.getByRole('button', { name: /Pick again/ });
    const viewRules = screen.getByRole('button', { name: /View rules/ });
    const closeBtns = screen.getAllByRole('button', { name: 'Close' });
    const closeBtn = closeBtns[closeBtns.length - 1];

    // Forward Tab from the last focusable should wrap to the first.
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(pickAgain);

    // Shift+Tab from the first focusable should wrap to the last.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(closeBtn);

    // Sanity: View rules sits between the two.
    expect(viewRules).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

function Probe() {
  const { state } = useFilter();
  return <output>{`${state.duration}|${state.players}|${[...state.keywords].join(',')}|${state.baseSort}|${state.keywordMode}|${state.search}`}</output>;
}

function renderBar(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <FilterBar />
        <section id="collection" />
        <Probe />
      </FilterProvider>
    </MemoryRouter>,
  );
}

const filtersButton = () => screen.getByRole('button', { name: /^Filters/ });
const sheet = () => screen.getByRole('dialog', { name: 'Filters' });

describe('the filter bar on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the search and one Filters button, with no pills', () => {
    renderBar();
    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
    expect(filtersButton()).toHaveTextContent(/^Filters$/);
    expect(filtersButton()).not.toHaveClass('active');
    expect(filtersButton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('button', { name: 'Duration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts the filters in play, but not the search, which has its own box', () => {
    renderBar('/?d=15&p=4&k=party,word&q=cat');
    expect(filtersButton()).toHaveTextContent('Filters · 4');
    // The dot is for the eye only.
    expect(filtersButton()).toHaveAccessibleName('Filters 4');
    expect(filtersButton()).toHaveClass('active');
  });

  it('opens a sheet with every choice, which applies picks and stays open', () => {
    renderBar();
    fireEvent.click(filtersButton());
    expect(sheet()).toHaveAttribute('aria-modal', 'true');
    expect(sheet()).toHaveFocus();
    expect(within(sheet()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['Time', 'Players', 'Keywords', 'Sort']);
    expect(within(sheet()).getByRole('button', { name: `Show ${GAMES.length} games` })).toBeInTheDocument();
    // Nothing to clear yet.
    expect(within(sheet()).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();

    fireEvent.click(within(sheet()).getByRole('radio', { name: 'Up to 15 min' }));
    fireEvent.click(within(sheet()).getByRole('radio', { name: '1 player' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: /Card Game/ }));
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'Quickest First' }));
    expect(screen.getByRole('status')).toHaveTextContent('15|1|card-game|quick|or|');
    // Klondike, in the Card Deck, is the one solo card game in 15 minutes.
    expect(within(sheet()).getByRole('button', { name: 'Show 1 game' })).toBeInTheDocument();
    expect(filtersButton()).toHaveTextContent('Filters · 3');
  });

  it('closes on Done, the close button, Escape or the backdrop, handing focus back', () => {
    renderBar();
    fireEvent.click(filtersButton());
    fireEvent.click(within(sheet()).getByRole('button', { name: /^Show / }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(filtersButton()).toHaveFocus();

    fireEvent.click(filtersButton());
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close filters' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(filtersButton());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(filtersButton()).toHaveFocus();

    fireEvent.click(filtersButton());
    fireEvent.click(document.querySelector('.pick-backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside the sheet', () => {
    renderBar('/?p=4');
    fireEvent.click(filtersButton());
    const close = within(sheet()).getByRole('button', { name: 'Close filters' });
    const done = within(sheet()).getByRole('button', { name: /^Show / });
    // From the sheet itself, Tab goes in at the top and Shift+Tab at the bottom.
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    sheet().focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
    // Past either end wraps around.
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
  });

  it('holds the page still while open and lets it go on close', () => {
    renderBar();
    fireEvent.click(filtersButton());
    expect(document.body.style.position).toBe('fixed');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.body.style.position).toBe('');
  });

  it('clears the filters it counts, leaving the search, sort and keyword mode, and keeps focus inside', () => {
    renderBar('/?d=30&p=4&k=party&m=and&s=quick&q=cat');
    fireEvent.click(filtersButton());
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('status')).toHaveTextContent('all|0||quick|and|cat');
    expect(within(sheet()).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: /^Show / })).toHaveFocus();
    expect(filtersButton()).toHaveTextContent(/^Filters$/);
  });

  it('marks which keyword mode is on', () => {
    renderBar('/?m=and');
    fireEvent.click(filtersButton());
    const any = within(sheet()).getByRole('button', { name: 'Any' });
    const all = within(sheet()).getByRole('button', { name: 'All' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveClass('active');
    expect(any).toHaveAttribute('aria-pressed', 'false');
    expect(any).not.toHaveClass('active');
    fireEvent.click(any);
    expect(any).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/\|or\|$/);
  });

  describe('closing after the list changed under it', () => {
    let top = 0;
    beforeEach(() => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return { top: this.id === 'collection' ? top : 0 } as DOMRect;
      });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 3000 });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    it('brings the section back up once the page is free to move', () => {
      top = -2500;
      renderBar();
      fireEvent.click(filtersButton());
      fireEvent.click(within(sheet()).getByRole('radio', { name: 'Up to 15 min' }));
      fireEvent.click(within(sheet()).getByRole('button', { name: /^Show / }));
      // First the lock puts the old offset back, then the section comes up.
      expect(vi.mocked(window.scrollTo).mock.calls).toEqual([
        [{ top: 3000, behavior: 'instant' }],
        [{ top: 500, behavior: 'instant' }],
      ]);
    });

    it('leaves the page where it was when nothing changed, or the section is in view', () => {
      top = -2500;
      renderBar();
      fireEvent.click(filtersButton());
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(vi.mocked(window.scrollTo).mock.calls).toEqual([[{ top: 3000, behavior: 'instant' }]]);

      vi.mocked(window.scrollTo).mockClear();
      top = 40;
      fireEvent.click(filtersButton());
      fireEvent.click(within(sheet()).getByRole('radio', { name: '2 players' }));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(vi.mocked(window.scrollTo).mock.calls).toEqual([[{ top: 3000, behavior: 'instant' }]]);
    });
  });

  it('counts the wishlist when it is the list in view', () => {
    renderBar('/?c=want');
    fireEvent.click(filtersButton());
    expect(within(sheet()).getByRole('button', { name: `Show ${WISHLIST.length} games` })).toBeInTheDocument();
  });
});

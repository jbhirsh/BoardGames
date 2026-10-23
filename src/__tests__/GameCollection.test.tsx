import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCollection from '../components/GameCollection';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import type { FilterAction } from '../context/filterReducer';
import { stubMatchMedia } from './helpers/stubMatchMedia';

function renderWithFilter(hidden = false) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <div data-sticky-header />
        <FilterBar />
        <GameCollection hidden={hidden} />
      </FilterProvider>
    </MemoryRouter>,
  );
}

function selectFirstKeyword() {
  fireEvent.click(screen.getByRole('button', { name: /Keywords/ }));
  const panel = document.querySelector('[data-dd="keywords"]')!;
  const option = panel.querySelector('.dd-opt')!;
  fireEvent.click(option);
}

function stubHeaderHeight(px: number) {
  const header = document.querySelector('[data-sticky-header]') as HTMLElement;
  Object.defineProperty(header, 'offsetHeight', { value: px, configurable: true });
}

function stubSectionTop(px: number) {
  const section = document.querySelector('section')!;
  section.getBoundingClientRect = () =>
    ({ top: px, bottom: 0, left: 0, right: 0, height: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('GameCollection scroll behavior', () => {
  const scrollToSpy = vi.fn();

  beforeEach(() => {
    scrollToSpy.mockReset();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true, configurable: true });
  });

  it('does not scroll on initial render', () => {
    renderWithFilter();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('scrolls up when a filter changes and the collection header is hidden above the viewport', () => {
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(-200);

    selectFirstKeyword();

    expect(scrollToSpy).toHaveBeenCalled();
    const call = scrollToSpy.mock.calls[0][0] as { top: number; behavior: string };
    expect(call.top).toBe(500 + -200 - 80);
    expect(call.behavior).toBe('instant');
  });

  it('does not scroll a hidden section, whose geometry is meaningless', () => {
    renderWithFilter(true);
    stubHeaderHeight(80);
    stubSectionTop(-200);

    selectFirstKeyword();

    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(document.querySelector('section')).toHaveAttribute('hidden');
    expect(document.querySelector('#collection')).toBeNull();
  });

  it('does not scroll when the collection header is already in view', () => {
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(200);

    selectFirstKeyword();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('does not scroll when only the view mode changes', () => {
    renderWithFilter();
    stubSectionTop(-200);

    fireEvent.click(screen.getByRole('button', { name: /Grid view/i }));

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('clamps scroll target to 0 when computed position is negative', () => {
    Object.defineProperty(window, 'scrollY', { value: 10, writable: true, configurable: true });
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(-5);

    selectFirstKeyword();

    expect(scrollToSpy).toHaveBeenCalled();
    const call = scrollToSpy.mock.calls[0][0] as { top: number };
    expect(call.top).toBe(0);
  });
});

describe('GameCollection scroll on a change of filters', () => {
  const scrollToSpy = vi.fn();
  let send: ReturnType<typeof useFilter>['dispatch'];

  function Dispatcher() {
    send = useFilter().dispatch;
    return null;
  }

  function renderScrolled() {
    render(
      <MemoryRouter>
        <FilterProvider>
          <div data-sticky-header />
          <Dispatcher />
          <GameCollection />
        </FilterProvider>
      </MemoryRouter>,
    );
    stubHeaderHeight(80);
    stubSectionTop(-200);
  }

  beforeEach(() => {
    scrollToSpy.mockReset();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true, configurable: true });
  });

  it.each<[string, FilterAction]>([
    ['players', { type: 'SET_PLAYERS', payload: 4 }],
    ['duration', { type: 'SET_DURATION', payload: 30 }],
    ['keyword mode', { type: 'SET_KEYWORD_MODE', payload: 'and' }],
    ['search', { type: 'SET_SEARCH', payload: 'cat' }],
    ['sort', { type: 'SET_SORT', payload: 'group' }],
    ['column sort', { type: 'SET_COLUMN_SORT', payload: 'players' }],
  ])('follows a change of %s', (_name, action) => {
    renderScrolled();
    act(() => send(action));
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it('follows each change once, and none that leaves the filters as they were', () => {
    renderScrolled();
    act(() => send({ type: 'SET_PLAYERS', payload: 4 }));
    // A new state object with the same filters: nothing to put back.
    act(() => send({ type: 'SET_PLAYERS', payload: 4 }));
    act(() => send({ type: 'CLEAR_FILTERS', payload: ['keywords'] }));
    act(() => send({ type: 'SET_VIEW', payload: 'grid' }));
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GameCollection view switch', () => {
  it('renders the list view by default and the grid view after toggling', () => {
    // `state.view === 'grid' ? <GridView /> : <ListView />` was never asserted:
    // ListView renders a <table>, GridView renders a `.games-grid` and no table.
    // Pins the conditional so it can't invert or collapse to a single branch.
    renderWithFilter();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(document.querySelector('.games-grid')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Grid view/i }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.querySelector('.games-grid')).not.toBeNull();
  });
});

describe('GameCollection count', () => {
  it('says "game" for one and "games" for more', () => {
    renderWithFilter();
    expect(screen.getByText(/^\d+ games$/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search games...'), { target: { value: 'Bananagrams' } });
    expect(screen.getByText('1 game')).toBeInTheDocument();
  });
});

describe('GameCollection on a phone', () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists a line a game for the list view, cards for the grid, and offers both', () => {
    renderWithFilter();
    expect(document.querySelector('table.games-list')).toBeNull();
    expect(document.querySelector('.games-grid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show details for Azul' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Azul' }).closest('.line')).not.toBeNull();

    // One switch, named for where it goes.
    expect(screen.queryByRole('button', { name: 'Grid view' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show as cards' }));
    expect(document.querySelector('.games-grid .game-card')).not.toBeNull();
    expect(document.querySelector('.lines')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show as rows' }));
    expect(document.querySelector('.lines')).not.toBeNull();
  });

  it('keeps the heading to its title, count and view toggle: Pick for us and Own/Want are in the bar along the bottom', () => {
    renderWithFilter();
    const header = document.querySelector('.sec-hd') as HTMLElement;
    expect(header).toHaveTextContent(/games/);
    expect(screen.queryByRole('button', { name: 'Pick for us' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'We want' })).not.toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Show as cards' })).toBeInTheDocument();
  });
});

describe('GameCollection header', () => {
  it('offers the random picker beside the count it picks from', () => {
    renderWithFilter();
    const header = document.querySelector('.sec-hd') as HTMLElement;
    expect(header).toHaveTextContent(/games/);
    expect(screen.getByRole('button', { name: 'Pick for us' }).closest('.sec-hd')).toBe(header);
  });
});

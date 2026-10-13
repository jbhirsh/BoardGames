import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import App, { HomePage } from '../App';
import CoverCarousel from '../components/CoverCarousel';
import { FilterProvider } from '../context/FilterContext';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import { FAVOURITES, SECONDS_PER_COVER, ownCovers, wantCovers } from '../utils/heroCovers';

function renderReel(want = false) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <CoverCarousel want={want} />
      </FilterProvider>
    </MemoryRouter>,
  );
}

function renderHome(entry = '/') {
  const router = createMemoryRouter([
    { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
  ], { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
  return router;
}

/** Reports `reduce` for prefers-reduced-motion, as a reader who asked for less motion. */
function preferLessMotion() {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({
    matches: q === '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  })));
}

const scrolled = vi.fn();
const scrolledHow = vi.fn();

beforeEach(() => {
  scrolled.mockClear();
  scrolledHow.mockClear();
  Element.prototype.scrollIntoView = function (this: Element, how?: boolean | ScrollIntoViewOptions) {
    scrolled(this);
    scrolledHow(how);
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CoverCarousel', () => {
  it('shows every game in the collection once to assistive tech, favourites first', () => {
    renderReel();
    const covers = within(screen.getByRole('list', { name: 'Collection covers' })).getAllByRole('button');
    expect(covers.map((b) => b.getAttribute('aria-label'))).toEqual(ownCovers(GAMES).map((c) => `Show ${c.name} in the list`));
    expect(covers[0]).toHaveAttribute('title', GAMES.find((g) => g.slug === FAVOURITES[0])!.name);
    expect(covers[0].querySelector('img')).toHaveAttribute('src', GAMES.find((g) => g.slug === 'catan')!.img);
    // The copy that closes the loop is there but hidden.
    expect(screen.getAllByRole('button', { name: 'Show Catan in the list' })).toHaveLength(1);
  });

  it('shows the wishlist\'s covers in Want mode', () => {
    renderReel(true);
    const covers = within(screen.getByRole('list', { name: 'Wishlist covers' })).getAllByRole('button');
    expect(covers.map((b) => b.getAttribute('aria-label'))).toEqual(wantCovers(WISHLIST).map((c) => `Show ${c.name} in the list`));
    expect(screen.queryByRole('list', { name: 'Collection covers' })).not.toBeInTheDocument();
  });

  it('turns to the other list when the Own/Want toggle does', () => {
    const { rerender } = renderReel();
    rerender(
      <MemoryRouter>
        <FilterProvider>
          <CoverCarousel want />
        </FilterProvider>
      </MemoryRouter>,
    );
    const covers = within(screen.getByRole('list', { name: 'Wishlist covers' })).getAllByRole('button');
    expect(covers[0]).toHaveAccessibleName(`Show ${wantCovers(WISHLIST)[0].name} in the list`);
  });

  it('hides the second copy of the row from screen readers and the Tab order', () => {
    const { container } = renderReel();
    const lists = container.querySelectorAll('.hero-reel-list');
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toHaveAttribute('aria-hidden');
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true');
    expect(lists[1].querySelectorAll('button')).toHaveLength(GAMES.length);
    for (const b of lists[1].querySelectorAll('button')) expect(b).toHaveAttribute('tabindex', '-1');
    for (const b of lists[0].querySelectorAll('button')) expect(b).not.toHaveAttribute('tabindex');
  });

  it('times a lap by the number of covers, so the speed is the same in both lists', () => {
    const { container } = renderReel();
    const reel = container.querySelector<HTMLElement>('.hero-reel')!;
    expect(reel.style.getPropertyValue('--reel-lap')).toBe(`${GAMES.length * SECONDS_PER_COVER}s`);
  });

  it('loads the first covers at once and the rest once the page has settled', () => {
    vi.useFakeTimers();
    const { container } = renderReel();
    const imgs = [...container.querySelectorAll('img')];
    expect(imgs.slice(0, 8).every((i) => !i.hasAttribute('loading'))).toBe(true);
    expect(imgs.slice(8).every((i) => i.getAttribute('loading') === 'lazy')).toBe(true);
    expect(imgs.every((i) => i.getAttribute('decoding') === 'async' && i.getAttribute('width') === '120' && i.getAttribute('height') === '120')).toBe(true);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(imgs.every((i) => !i.hasAttribute('loading'))).toBe(true);
  });

  it('pauses and plays from its toggle', () => {
    const { container } = renderReel();
    const reel = container.querySelector('.hero-reel')!;
    fireEvent.click(screen.getByRole('button', { name: 'Pause cover carousel' }));
    expect(reel).toHaveClass('is-paused');
    fireEvent.click(screen.getByRole('button', { name: 'Play cover carousel' }));
    expect(reel).not.toHaveClass('is-paused');
    expect(screen.getByRole('button', { name: 'Pause cover carousel' })).toBeInTheDocument();
  });

  it('holds still while off screen or in a hidden tab', () => {
    let report: IntersectionObserverCallback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { report = cb; }
      observe(el: Element) { observe(el); }
      disconnect() { disconnect(); }
    });
    const { container, unmount } = renderReel();
    const reel = container.querySelector('.hero-reel')!;
    expect(observe).toHaveBeenCalledWith(reel);
    expect(reel.className).toBe('hero-reel');
    // On screen until told otherwise.
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(reel).not.toHaveClass('is-idle');
    const seen = (isIntersecting: boolean) => act(() => report([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
    seen(false);
    expect(reel).toHaveClass('is-idle');
    seen(true);
    expect(reel).not.toHaveClass('is-idle');

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(reel).toHaveClass('is-idle');
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(reel).not.toHaveClass('is-idle');
    hidden.mockRestore();

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('stands still for people who ask for less motion: the favourites, no copy, no toggle', () => {
    preferLessMotion();
    const { container } = renderReel();
    expect(container.querySelector('.hero-reel')).toHaveClass('hero-reel--still');
    const covers = within(screen.getByRole('list', { name: 'Collection covers' })).getAllByRole('button');
    expect(covers.map((b) => b.getAttribute('aria-label'))).toEqual(
      FAVOURITES.map((slug) => `Show ${GAMES.find((g) => g.slug === slug)!.name} in the list`),
    );
    expect(container.querySelectorAll('.hero-reel-list')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /cover carousel/ })).not.toBeInTheDocument();
  });

  describe('a cover Tabbed to off the visible stretch', () => {
    function setUp(left: number, keyboard = true) {
      const { container } = renderReel();
      const view = container.querySelector<HTMLElement>('.hero-reel-view')!;
      const track = container.querySelector<HTMLElement>('.hero-reel-track')!;
      const anim = { currentTime: 0 as number | null, effect: { getComputedTiming: () => ({ duration: 72000 }) } };
      track.getAnimations = () => [anim as unknown as Animation];
      Object.defineProperty(track, 'scrollWidth', { value: 2000 });
      view.getBoundingClientRect = () => ({ left: 0, right: 800, width: 800 }) as DOMRect;
      const button = within(container).getByRole('button', { name: 'Show Azul in the list' });
      const li = button.parentElement!;
      li.getBoundingClientRect = () => ({ left, right: left + 100 }) as DOMRect;
      Object.defineProperty(li, 'offsetLeft', { value: 1900 });
      Object.defineProperty(li, 'offsetWidth', { value: 100 });
      // Focus from the keyboard, as :focus-visible tells it from a click's.
      vi.spyOn(button, 'matches').mockImplementation((selector: string) => keyboard && selector === ':focus-visible');
      fireEvent.focus(button);
      return anim;
    }

    // The ends fade over 12% of the row's width: 96px of 800, leaving
    // 96 to 704 in plain view.
    const middle = 0.55 * 72000;

    it('winds the row to put it in the middle', () => {
      // Its middle is 1950px along a 1000px-wide copy: centred, the row
      // has moved 1550px, which is 550px into the next lap of 1000px.
      expect(setUp(1200).currentTime).toBeCloseTo(middle);
    });

    it('winds it out from under a faded end too', () => {
      expect(setUp(50).currentTime).toBeCloseTo(middle);
      expect(setUp(95).currentTime).toBeCloseTo(middle);
      expect(setUp(605).currentTime).toBeCloseTo(middle);
    });

    it('leaves the row be when a click put focus there, so the cover stays under the pointer', () => {
      expect(setUp(1200, false).currentTime).toBe(0);
    });

    it('leaves the row be when the cover is in plain view, edge to edge', () => {
      expect(setUp(400).currentTime).toBe(0);
      expect(setUp(96).currentTime).toBe(0);
      expect(setUp(604).currentTime).toBe(0);
    });
  });

  it('leaves the row be when there is no animation to wind', () => {
    preferLessMotion();
    renderReel();
    expect(() => fireEvent.focus(screen.getByRole('button', { name: 'Show Azul in the list' }))).not.toThrow();
  });
});

describe('a cover in the home page', () => {
  it('brings its game\'s row into view and puts focus on its toggle', () => {
    renderHome();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'Show Azul in the list' }));
    const row = document.getElementById('game-azul')!;
    expect(row.tagName).toBe('TR');
    // To the top of the view (under the sticky bar, by its scroll margin),
    // the page's own scroll, not a second one from focus.
    expect(scrolled).toHaveBeenCalledWith(row);
    expect(scrolledHow).toHaveBeenCalledWith({ block: 'start' });
    expect(screen.getByRole('button', { name: 'Show details for Azul' })).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
    expect(row).toHaveClass('jump-arrive');
    fireEvent.animationEnd(row);
    expect(row).not.toHaveClass('jump-arrive');
    // The ring's listener goes with it.
    row.classList.add('jump-arrive');
    fireEvent.animationEnd(row);
    expect(row).toHaveClass('jump-arrive');
  });

  it('brings its game\'s card into view in the grid, with focus on its name', () => {
    renderHome('/?v=grid');
    fireEvent.click(screen.getByRole('button', { name: 'Show Codenames in the list' }));
    const card = document.getElementById('game-codenames')!;
    expect(card).toHaveClass('game-card');
    expect(scrolled).toHaveBeenCalledWith(card);
    expect(within(card).getByRole('heading', { name: 'Codenames' })).toHaveFocus();
  });

  it('clears the filters that hide its game, keeping the view, so there is a card to go to', () => {
    const router = renderHome('/?q=catan&v=grid');
    expect(document.getElementById('game-azul')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Azul in the list' }));
    expect(router.state.location.search).toBe('?v=grid');
    expect(scrolled).toHaveBeenCalledWith(document.getElementById('game-azul'));
    expect(screen.getByRole('heading', { name: 'Azul' })).toHaveFocus();
  });

  it('keeps the filters when its game is already listed', () => {
    const router = renderHome('/?p=2');
    fireEvent.click(screen.getByRole('button', { name: 'Show Azul in the list' }));
    expect(router.state.location.search).toBe('?p=2');
    expect(screen.getByRole('button', { name: 'Show details for Azul' })).toHaveFocus();
  });

  it('starts the ring over when the same cover is clicked again', () => {
    renderHome();
    const cover = screen.getByRole('button', { name: 'Show Azul in the list' });
    fireEvent.click(cover);
    fireEvent.click(cover);
    expect(document.getElementById('game-azul')).toHaveClass('jump-arrive');
  });

  it('brings a wishlist entry\'s card into view in Want mode, clearing a filter that hid it', async () => {
    const entry = wantCovers(WISHLIST)[0];
    const router = renderHome('/?c=want&q=zzzz');
    // The entries mount once the suggestions request settles (here, fails).
    await screen.findByRole('button', { name: 'Share wishlist' });
    fireEvent.click(screen.getByRole('button', { name: `Show ${entry.name} in the list` }));
    expect(router.state.location.search).toBe('?c=want');
    const row = document.getElementById(`wish-${entry.id}`)!;
    expect(row).not.toBeNull();
    expect(scrolled).toHaveBeenCalledWith(row);
    expect(screen.getByRole('button', { name: `Show details for ${entry.name}` })).toHaveFocus();
  });

  it('keeps a filter that still lists the wishlist entry', async () => {
    const [entry, other] = wantCovers(WISHLIST);
    const router = renderHome(`/?c=want&q=${encodeURIComponent(entry.name)}`);
    await screen.findByRole('button', { name: 'Share wishlist' });
    fireEvent.click(screen.getByRole('button', { name: `Show ${entry.name} in the list` }));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(entry.name);
    // Another entry, hidden by that search, clears it.
    fireEvent.click(screen.getByRole('button', { name: `Show ${other.name} in the list` }));
    expect(router.state.location.search).toBe('?c=want');
    expect(screen.getByRole('button', { name: `Show details for ${other.name}` })).toHaveFocus();
  });

  it('lands on the wishlist\'s heading while its entries are still loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderHome('/?c=want');
    const entry = wantCovers(WISHLIST)[0];
    fireEvent.click(screen.getByRole('button', { name: `Show ${entry.name} in the list` }));
    expect(scrolled).toHaveBeenCalledWith(document.getElementById('collection'));
    expect(screen.getByRole('heading', { level: 2, name: 'Wishlist' })).toHaveFocus();
  });
});

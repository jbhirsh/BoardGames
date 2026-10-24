import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within, fireEvent } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import App, { HomePage } from '../App';
import CoverCarousel from '../components/CoverCarousel';
import { FilterProvider } from '../context/FilterContext';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import { FAVOURITES, SECONDS_PER_COVER, ownCovers, wantCovers } from '../utils/heroCovers';
import { stubMatchMedia } from './helpers/stubMatchMedia';

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
  const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
    initialEntries: [entry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** Reports `reduce` for prefers-reduced-motion, as a reader who asked for less motion. */
function preferLessMotion() {
  stubMatchMedia((q) => q === '(prefers-reduced-motion: reduce)');
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
    expect(covers.map((b) => b.getAttribute('aria-label'))).toEqual(
      ownCovers(GAMES).map((c) => `Show ${c.name} in the list`),
    );
    expect(covers[0]).toHaveAttribute('title', GAMES.find((g) => g.slug === FAVOURITES[0])!.name);
    expect(covers[0].querySelector('img')).toHaveAttribute('src', GAMES.find((g) => g.slug === 'catan')!.img);
    // The copy that closes the loop is there but hidden.
    expect(screen.getAllByRole('button', { name: 'Show Catan in the list' })).toHaveLength(1);
  });

  it("shows the wishlist's covers in Want mode", () => {
    renderReel(true);
    const covers = within(screen.getByRole('list', { name: 'Wishlist covers' })).getAllByRole('button');
    expect(covers.map((b) => b.getAttribute('aria-label'))).toEqual(
      wantCovers(WISHLIST).map((c) => `Show ${c.name} in the list`),
    );
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
  });

  it('keeps a click on the hidden copy from putting focus inside it', () => {
    const { container } = renderReel();
    const [shown, copy] = [...container.querySelectorAll('.hero-reel-list')].map((l) => l.querySelector('button')!);
    expect(fireEvent.mouseDown(copy)).toBe(false);
    expect(fireEvent.mouseDown(shown)).toBe(true);
  });

  it('puts the pause button ahead of the covers in the Tab order', () => {
    const { container } = renderReel();
    const toggle = screen.getByRole('button', { name: 'Pause cover carousel' });
    const first = container.querySelector('.hero-reel-cover')!;
    expect(toggle.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('as one Tab stop', () => {
    const tabbable = (c: HTMLElement) =>
      [...c.querySelectorAll('.hero-reel-list:not([aria-hidden]) button')].filter(
        (b) => b.getAttribute('tabindex') === '0',
      );
    const covers = () => within(screen.getByRole('list', { name: 'Collection covers' })).getAllByRole('button');

    it('starts on the first cover, the rest out of the Tab order', () => {
      const { container } = renderReel();
      expect(tabbable(container)).toEqual([covers()[0]]);
      expect(
        covers()
          .slice(1)
          .every((b) => b.getAttribute('tabindex') === '-1'),
      ).toBe(true);
    });

    it('moves between covers with the arrow keys, Home and End, wrapping at the ends', () => {
      const { container } = renderReel();
      const all = covers();
      const last = all.length - 1;
      const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
      all[0].focus();
      press('ArrowRight');
      expect(document.activeElement).toBe(all[1]);
      expect(tabbable(container)).toEqual([all[1]]);
      press('ArrowLeft');
      expect(document.activeElement).toBe(all[0]);
      press('ArrowLeft');
      expect(document.activeElement).toBe(all[last]);
      press('ArrowRight');
      expect(document.activeElement).toBe(all[0]);
      press('End');
      expect(document.activeElement).toBe(all[last]);
      press('Home');
      expect(document.activeElement).toBe(all[0]);
    });

    it('leaves other keys to the browser', () => {
      renderReel();
      const first = covers()[0];
      first.focus();
      expect(fireEvent.keyDown(first, { key: 'Enter' })).toBe(true);
      expect(fireEvent.keyDown(first, { key: 'ArrowDown' })).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('keeps its stop on the last cover when the row turns to a shorter list', () => {
      const { container, rerender } = renderReel(true);
      const wish = within(screen.getByRole('list', { name: 'Wishlist covers' })).getAllByRole('button');
      expect(wish.length).toBeGreaterThan(GAMES.length);
      wish[0].focus();
      fireEvent.keyDown(wish[0], { key: 'End' });
      rerender(
        <MemoryRouter>
          <FilterProvider>
            <CoverCarousel want={false} />
          </FilterProvider>
        </MemoryRouter>,
      );
      expect(tabbable(container)).toEqual([covers().at(-1)]);
    });
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
    const list = screen.getByRole('list', { name: 'Collection covers' });
    expect(list).not.toHaveAttribute('data-warm');
    expect(imgs.slice(0, 8).every((i) => !i.hasAttribute('loading'))).toBe(true);
    expect(imgs.slice(8).every((i) => i.getAttribute('loading') === 'lazy')).toBe(true);
    expect(
      imgs.every(
        (i) =>
          i.getAttribute('decoding') === 'async' &&
          i.getAttribute('width') === '120' &&
          i.getAttribute('height') === '120',
      ),
    ).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(imgs.every((i) => !i.hasAttribute('loading'))).toBe(true);
    // Said on the row's list, for the screenshot tests to wait on; the
    // hidden copy says nothing.
    expect(list).toHaveAttribute('data-warm', 'true');
    expect(container.querySelectorAll('[data-warm]')).toHaveLength(1);
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
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          report = cb;
        }
        observe(el: Element) {
          observe(el);
        }
        disconnect() {
          disconnect();
        }
      },
    );
    const { container, unmount } = renderReel();
    const reel = container.querySelector('.hero-reel')!;
    expect(observe).toHaveBeenCalledWith(reel);
    expect(reel.className).toBe('hero-reel');
    // On screen until told otherwise.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(reel).not.toHaveClass('is-idle');
    const seen = (isIntersecting: boolean) =>
      act(() => report([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
    seen(false);
    expect(reel).toHaveClass('is-idle');
    seen(true);
    expect(reel).not.toHaveClass('is-idle');

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(reel).toHaveClass('is-idle');
    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
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
    function setUp(left: number, keyboard = true, offsetLeft = 1900) {
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
      Object.defineProperty(li, 'offsetLeft', { value: offsetLeft });
      Object.defineProperty(li, 'offsetWidth', { value: 100 });
      // Focus from the keyboard, as :focus-visible tells it from a click's.
      vi.spyOn(button, 'matches').mockImplementation((selector: string) => keyboard && selector === ':focus-visible');
      fireEvent.focus(button);
      return anim;
    }

    // Azul's twin in the hidden copy, and every cover wearing a ring it hasn't focus for.
    const twin = () => document.querySelector('[aria-hidden="true"] [aria-label="Show Azul in the list"]')!;
    const ringed = () => document.querySelectorAll('[data-twin-focused]');

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

    it("rings the twin on screen when the cover itself can't be brought there", () => {
      // 150px along: centring it would slide the row 250px right, which it
      // can't, so its twin, a copy further on, comes to the middle instead.
      const anim = setUp(1200, true, 100);
      expect(anim.currentTime).toBeCloseTo(0.75 * 72000);
      expect(ringed()).toHaveLength(1);
      expect(twin()).toHaveAttribute('data-twin-focused');
      // By its label: a query by role reads matches(), which setUp stubbed.
      fireEvent.blur(document.querySelector('ul:not([aria-hidden]) [aria-label="Show Azul in the list"]')!);
      expect(ringed()).toHaveLength(0);
    });

    it('rings no twin when the cover itself comes to the middle, is in plain view, or was clicked', () => {
      setUp(1200);
      expect(ringed()).toHaveLength(0);
      cleanup();
      // Exactly in the middle of the row's start: the cover itself can be centred.
      expect(setUp(1200, true, 350).currentTime).toBe(0);
      expect(ringed()).toHaveLength(0);
      cleanup();
      setUp(400, true, 100);
      expect(ringed()).toHaveLength(0);
      cleanup();
      setUp(1200, false, 100);
      expect(ringed()).toHaveLength(0);
    });

    it('leaves the row be when the cover is in plain view, edge to edge', () => {
      expect(setUp(400).currentTime).toBe(0);
      expect(setUp(96).currentTime).toBe(0);
      expect(setUp(604).currentTime).toBe(0);
    });
  });

  describe('dragged sideways', () => {
    // A lap of 72 s over a copy 1000px wide: 72 ms a pixel.
    function setUp(time = 10000, renderIt = () => renderReel()) {
      const { container } = renderIt();
      const reel = container.querySelector<HTMLElement>('.hero-reel')!;
      const view = container.querySelector<HTMLElement>('.hero-reel-view')!;
      const track = container.querySelector<HTMLElement>('.hero-reel-track')!;
      const anim = { currentTime: time as number | null, effect: { getComputedTiming: () => ({ duration: 72000 }) } };
      track.getAnimations = () => [anim as unknown as Animation];
      Object.defineProperty(track, 'scrollWidth', { value: 2000 });
      const capture = vi.fn();
      view.setPointerCapture = capture;
      const cover = within(container).getByRole('button', { name: 'Show Azul in the list' });
      const down = (clientX: number, init: PointerEventInit = {}) =>
        fireEvent.pointerDown(cover, { pointerId: 1, isPrimary: true, button: 0, clientX, ...init });
      const to = (clientX: number) => fireEvent.pointerMove(cover, { pointerId: 1, clientX });
      const up = () => fireEvent.pointerUp(cover, { pointerId: 1 });
      return { reel, view, anim, capture, cover, down, to, up };
    }

    it('winds the row with the pointer, a pixel right setting it a pixel right', () => {
      const { anim, down, to } = setUp();
      down(500);
      to(600);
      expect(anim.currentTime).toBeCloseTo(10000 - 100 * 72);
      to(400);
      expect(anim.currentTime).toBeCloseTo(10000 + 100 * 72);
    });

    it('comes round the loop past either end of a lap rather than jumping', () => {
      const back = setUp(1000);
      back.down(500);
      back.to(550);
      expect(back.anim.currentTime).toBeCloseTo(72000 - 2600);
      cleanup();
      const on = setUp(70000);
      on.down(500);
      on.to(450);
      expect(on.anim.currentTime).toBeCloseTo(1600);
    });

    it('holds the row still from the press, and lets it glide on when let go', () => {
      const { reel, capture, down, to, up } = setUp();
      down(500);
      expect(reel).toHaveClass('is-held');
      expect(reel).not.toHaveClass('is-dragging');
      to(503);
      expect(capture).not.toHaveBeenCalled();
      to(510);
      expect(reel).toHaveClass('is-held');
      expect(reel).toHaveClass('is-dragging');
      expect(capture).toHaveBeenCalledWith(1);
      up();
      expect(reel).not.toHaveClass('is-held');
      expect(reel).not.toHaveClass('is-dragging');
    });

    it('stays paused after a drag when its pause button is on', () => {
      const { reel, anim, down, to, up } = setUp();
      fireEvent.click(screen.getByRole('button', { name: 'Pause cover carousel' }));
      down(500);
      to(600);
      up();
      expect(anim.currentTime).toBeCloseTo(10000 - 100 * 72);
      expect(reel).toHaveClass('is-paused');
      expect(screen.getByRole('button', { name: 'Play cover carousel' })).toBeInTheDocument();
    });

    it('glides on the way it was last pulled: right turns it round, left turns it back', () => {
      const { anim, down, to, up } = setUp();
      const played = anim as typeof anim & { playbackRate?: number };
      down(500);
      to(600);
      up();
      expect(played.playbackRate).toBe(-1);
      down(600);
      to(650);
      to(560);
      up();
      expect(played.playbackRate).toBe(1);
    });

    it('turns with a drag a scroll takes over, and not with a press that hardly moves', () => {
      const { anim, cover, down, to, up } = setUp();
      const played = anim as typeof anim & { playbackRate?: number };
      down(500);
      to(600);
      fireEvent.pointerCancel(cover, { pointerId: 1 });
      expect(played.playbackRate).toBe(-1);
      down(500);
      to(497);
      up();
      expect(played.playbackRate).toBe(-1);
      // Pulled out and back to where it began: no way to go, so no turn.
      down(500);
      to(400);
      to(500);
      up();
      expect(played.playbackRate).toBe(-1);
    });

    it('comes round to the end of the lap, rather than stopping, when played backwards to its start', () => {
      const { anim, down, to, up } = setUp();
      const played = anim as typeof anim & { onfinish?: () => void };
      down(500);
      to(600);
      up();
      anim.currentTime = 0;
      played.onfinish!();
      expect(anim.currentTime).toBe(72000);
    });

    it('starts the drag on the next move when the row is between laps, with no animation', () => {
      const { reel, anim, view, down, to } = setUp();
      const track = view.querySelector<HTMLElement>('.hero-reel-track')!;
      const between = track.getAnimations;
      track.getAnimations = () => [];
      down(500);
      expect(() => to(600)).not.toThrow();
      expect(reel).not.toHaveClass('is-dragging');
      track.getAnimations = between;
      to(600);
      expect(reel).toHaveClass('is-dragging');
      expect(anim.currentTime).toBeCloseTo(10000 - 100 * 72);
    });

    it('leaves a press that hardly moves alone', () => {
      const { anim, down, to } = setUp();
      down(500);
      to(504);
      to(496);
      expect(anim.currentTime).toBe(10000);
    });

    it('ignores another pointer, another button, and moves with nothing pressed', () => {
      const { reel, anim, down, to, cover } = setUp();
      to(600);
      expect(anim.currentTime).toBe(10000);
      down(500, { button: 2 });
      expect(reel).not.toHaveClass('is-held');
      down(500, { ctrlKey: true });
      expect(reel).not.toHaveClass('is-held');
      down(500, { isPrimary: false });
      expect(reel).not.toHaveClass('is-held');
      down(500);
      fireEvent.pointerMove(cover, { pointerId: 2, clientX: 600 });
      fireEvent.pointerUp(cover, { pointerId: 2 });
      expect(anim.currentTime).toBe(10000);
      expect(reel).toHaveClass('is-held');
    });

    it('lets go of the focus the press gave its cover, which would hold the row', () => {
      const { cover, down, to } = setUp();
      down(500);
      cover.focus();
      to(520);
      expect(cover).not.toHaveFocus();
    });

    it('lets go of the row when a press leaves it before dragging, or is taken by a scroll', () => {
      const { reel, view, down, cover } = setUp();
      down(500);
      fireEvent.pointerLeave(view, { pointerId: 1 });
      expect(reel).not.toHaveClass('is-held');
      down(500);
      fireEvent.pointerCancel(cover, { pointerId: 1 });
      expect(reel).not.toHaveClass('is-held');
    });

    it('keeps a drag that strays off the row', () => {
      const { reel, view, down, to } = setUp();
      down(500);
      to(600);
      fireEvent.pointerLeave(view, { pointerId: 1 });
      expect(reel).toHaveClass('is-dragging');
    });

    it('does nothing for people who ask for less motion', () => {
      preferLessMotion();
      const { reel, anim, down, to } = setUp();
      down(500);
      to(600);
      expect(reel).not.toHaveClass('is-held');
      expect(anim.currentTime).toBe(10000);
    });
  });

  it('leaves the row be when there is no animation to wind', () => {
    preferLessMotion();
    renderReel();
    expect(() => fireEvent.focus(screen.getByRole('button', { name: 'Show Azul in the list' }))).not.toThrow();
  });
});

describe('a cover in the home page', () => {
  it("brings its game's row into view and puts focus on its toggle", () => {
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

  it("brings its game's card into view in the grid, with focus on its name", () => {
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

  describe('dragged', () => {
    function setUp() {
      renderHome();
      const view = document.querySelector<HTMLElement>('.hero-reel-view')!;
      const track = document.querySelector<HTMLElement>('.hero-reel-track')!;
      const anim = { currentTime: 0, effect: { getComputedTiming: () => ({ duration: 72000 }) } };
      track.getAnimations = () => [anim as unknown as Animation];
      Object.defineProperty(track, 'scrollWidth', { value: 2000 });
      view.setPointerCapture = vi.fn();
      const cover = screen.getByRole('button', { name: 'Show Azul in the list' });
      fireEvent.pointerDown(cover, { pointerId: 1, isPrimary: true, button: 0, clientX: 500 });
      return cover;
    }

    it("doesn't open the game the drag let go over", () => {
      const cover = setUp();
      fireEvent.pointerMove(cover, { pointerId: 1, clientX: 540 });
      fireEvent.pointerUp(cover, { pointerId: 1 });
      expect(fireEvent.click(cover)).toBe(false);
      expect(scrolled).not.toHaveBeenCalled();
      // Only that click: the next one opens it.
      fireEvent.click(cover);
      expect(scrolled).toHaveBeenCalledWith(document.getElementById('game-azul'));
    });

    it('forgets the drag once its click has had its chance, so a later click from the keyboard opens', () => {
      vi.useFakeTimers();
      const cover = setUp();
      fireEvent.pointerMove(cover, { pointerId: 1, clientX: 540 });
      fireEvent.pointerUp(cover, { pointerId: 1 });
      act(() => {
        vi.runOnlyPendingTimers();
      });
      fireEvent.click(cover);
      expect(scrolled).toHaveBeenCalledWith(document.getElementById('game-azul'));
    });

    it('still opens the game on a press that hardly moved', () => {
      const cover = setUp();
      fireEvent.pointerMove(cover, { pointerId: 1, clientX: 503 });
      fireEvent.pointerUp(cover, { pointerId: 1 });
      fireEvent.click(cover);
      expect(scrolled).toHaveBeenCalledWith(document.getElementById('game-azul'));
    });

    it("opens it after a drag taken over by the page's scroll", () => {
      const cover = setUp();
      fireEvent.pointerMove(cover, { pointerId: 1, clientX: 540 });
      fireEvent.pointerCancel(cover, { pointerId: 1 });
      fireEvent.click(cover);
      expect(scrolled).toHaveBeenCalledWith(document.getElementById('game-azul'));
    });
  });

  it('starts the ring over when the same cover is clicked again', () => {
    renderHome();
    const cover = screen.getByRole('button', { name: 'Show Azul in the list' });
    fireEvent.click(cover);
    fireEvent.click(cover);
    expect(document.getElementById('game-azul')).toHaveClass('jump-arrive');
  });

  it("brings a wishlist entry's card into view in Want mode, clearing a filter that hid it", async () => {
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

  it("lands on the wishlist's heading while its entries are still loading", () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderHome('/?c=want');
    const entry = wantCovers(WISHLIST)[0];
    fireEvent.click(screen.getByRole('button', { name: `Show ${entry.name} in the list` }));
    expect(scrolled).toHaveBeenCalledWith(document.getElementById('collection'));
    expect(screen.getByRole('heading', { level: 2, name: 'Wishlist' })).toHaveFocus();
  });
});

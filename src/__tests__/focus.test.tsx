import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App, { HomePage } from '../App';
import { focusSection, focusTarget } from '../client/focus';
import { GAMES } from '../data/games';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Markup built by hand, with the classes the lookups used to go by and no markers. */
function page(html: string) {
  document.body.innerHTML = html;
}

describe('focusTarget', () => {
  it('focuses the element marked with the target, whatever its classes', () => {
    page(`
      <div id="box">
        <h3 class="card-name" tabindex="-1">Styled, unmarked</h3>
        <button class="row-toggle">Styled, unmarked</button>
        <span tabindex="-1" data-focus-target="item">Marked</span>
      </div>`);
    focusTarget(document.getElementById('box')!, 'item');
    expect(document.activeElement).toHaveTextContent('Marked');
  });

  it('passes the focus options on', () => {
    page('<button data-focus-target="field">Go</button>');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    focusTarget(document, 'field', { preventScroll: true });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('leaves focus be when the container has no such target', () => {
    page('<h2 class="sec-title" tabindex="-1">Unmarked</h2><button data-focus-target="item">Other target</button>');
    expect(() => focusTarget(document, 'title')).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('focusSection', () => {
  it('focuses the target in the section on show once the next frame comes', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    // Both halves of the Own/Want toggle are on the page; only the one on
    // show carries the anchor.
    page(`
      <section hidden><h2 tabindex="-1" data-focus-target="title">Hidden</h2></section>
      <section id="collection"><h2 tabindex="-1" data-focus-target="title">Shown</h2></section>`);
    focusSection();
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toHaveTextContent('Shown');
  });

  it('takes another target in that section by name', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    page(`
      <section id="collection">
        <h2 tabindex="-1" data-focus-target="title">Shown</h2>
        <button data-focus-target="want-toggle">We want</button>
      </section>`);
    focusSection('want-toggle');
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toHaveTextContent('We want');
  });

  it('does nothing with no section on the page', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    page('<h2 tabindex="-1" data-focus-target="title">Elsewhere</h2>');
    focusSection();
    expect(() => vi.advanceTimersToNextFrame()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('the home page\'s focus targets', () => {
  function renderHome(entry: string) {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: [entry] });
    render(<RouterProvider router={router} />);
  }
  const marked = (el: Element, target: string) => expect(el).toHaveAttribute('data-focus-target', target);

  it('marks the section headings, the Own/Want buttons and every row\'s landing spot', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    renderHome('/');
    marked(screen.getByRole('heading', { level: 2, name: 'Our Collection' }), 'title');
    const section = document.getElementById('collection')!;
    marked(within(section).getByRole('button', { name: 'We own' }), 'own-toggle');
    marked(within(section).getByRole('button', { name: 'We want' }), 'want-toggle');
    for (const game of GAMES) {
      marked(screen.getByRole('button', { name: `Show details for ${game.name}` }), 'item');
    }
  });

  it('marks every card\'s name in the grid', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    renderHome('/?v=grid');
    for (const game of GAMES) {
      marked(within(document.getElementById(`game-${game.slug}`)!).getByRole('heading', { name: game.name }), 'item');
    }
  });
});

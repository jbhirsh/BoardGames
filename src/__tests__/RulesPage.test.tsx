import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RulesPage from '../components/RulesPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rules/:slug/:part?" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RulesPage', () => {
  it('shows a not-found message when the slug matches no game', () => {
    // Guards the `if (!game)` branch and the GAMES.find lookup: an unknown slug
    // must render the not-found view, and only an unknown slug.
    renderAt('/rules/does-not-exist');
    expect(screen.getByText('Game not found')).toBeInTheDocument();
  });

  it('renders the game for a known slug and no Word Checker button for non-word games', () => {
    // Kills the inverse of the not-found branch (a real game must NOT be treated
    // as missing) and the `game.slug === 'bananagrams'` guard on the Word Checker
    // button (7 Wonders is not a word game, so the button must be absent).
    renderAt('/rules/7-wonders');
    expect(screen.getByRole('heading', { name: '7 Wonders' })).toBeInTheDocument();
    expect(screen.queryByText('Game not found')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Word Checker' })).not.toBeInTheDocument();
  });

  it('links to the score calculator from a game that has one, and only there', () => {
    const { unmount } = renderAt('/rules/7-wonders');
    expect(screen.getByRole('link', { name: 'Score calculator' })).toHaveAttribute('href', '/score/7-wonders');
    unmount();
    renderAt('/rules/catan');
    expect(screen.queryByRole('link', { name: 'Score calculator' })).toBeNull();
  });

  it('offers starter questions shaped by the tab on screen', () => {
    renderAt('/rules/catan/5-6-player-extension');
    fireEvent.click(screen.getByRole('button', { name: /AI Rules Assistant/i }));
    expect(screen.getByRole('button', { name: 'What does 5–6 Player Extension change?' })).toBeInTheDocument();
  });

  it('toggles the Word Checker panel on and off for bananagrams', () => {
    // Kills the bananagrams-only render of the toggle button, the toggle event
    // handler, and the `wordCheckerOpen && <WordChecker />` conditional render.
    renderAt('/rules/bananagrams');
    expect(screen.queryByPlaceholderText('Enter a word...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Word Checker' }));
    expect(screen.getByPlaceholderText('Enter a word...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Word Checker' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Word Checker' }));
    expect(screen.queryByPlaceholderText('Enter a word...')).not.toBeInTheDocument();
  });

  describe('house rules', () => {
    const houseRules = () => screen.getByText('House rules').closest('details')!;

    it('lists the game\'s house rules, folded so the rulebook stays in view', () => {
      renderAt('/rules/hogwarts-battle');
      expect(houseRules()).not.toHaveAttribute('open');
      expect(within(houseRules()).getByText('7')).toHaveTextContent('7 rules');
      const names = within(houseRules()).getAllByRole('term').map(t => t.textContent);
      expect(names).toEqual(['Altered villain setup', 'Split by cost', 'Stack duplicates', 'Clear the market', 'Dismiss for half', 'Detention amnesty', 'Epic mode']);
      expect(within(houseRules()).getByText(/pay half its cost in Influence, rounded up/)).toBeInTheDocument();
    });

    it('keeps them on an add-on\'s tabs, which are played on top of the game', () => {
      renderAt('/rules/hogwarts-battle/monster-box-2');
      // An unknown tab falls back to Game 1, which has them too: pin the tab.
      expect(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { current: 'page' })).toHaveTextContent('Monster Box 2');
      expect(within(houseRules()).getByText('Altered villain setup')).toBeInTheDocument();
    });

    it('shows nothing for a game without any', () => {
      renderAt('/rules/7-wonders');
      expect(screen.queryByText('House rules')).not.toBeInTheDocument();
    });
  });

  describe('rulebook tabs', () => {
    const tabs = () => screen.getByRole('navigation', { name: 'Rulebooks' });
    const viewer = () => document.querySelector('iframe')!;

    it('shows no tabs for a game with one rulebook', () => {
      renderAt('/rules/7-wonders');
      expect(screen.queryByRole('navigation', { name: 'Rulebooks' })).not.toBeInTheDocument();
    });

    it('gives a game\'s own further rulebooks a tab each, then its add-ons', () => {
      renderAt('/rules/hogwarts-battle/game-4');
      const links = within(tabs()).getAllByRole('link');
      expect(links.map(l => l.textContent)).toEqual([
        'Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7',
        'Monster Box 1expansion', 'Monster Box 2expansion', 'Monster Box 3expansion', 'Monster Box 4expansion',
      ]);
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Game 4');
      expect(viewer()).toHaveAttribute('src', '/rules/hogwarts-battle.game-4.pdf');
      expect(viewer()).toHaveAttribute('title', 'Hogwarts Battle: Game 4 rules');
    });

    it('opens on the base game, with a tab per add-on marked by its kind', () => {
      renderAt('/rules/catan');
      const links = within(tabs()).getAllByRole('link');
      // The extension's name already says what it is, so only the expansion is tagged.
      expect(links.map(l => l.textContent)).toEqual(['Base game', '5–6 Player Extension', 'Cities & Knightsexpansion']);
      expect(links[0]).toHaveAttribute('aria-current', 'page');
      expect(links[1]).not.toHaveAttribute('aria-current');
      expect(links[1]).toHaveAttribute('href', '/rules/catan/5-6-player-extension');
      expect(viewer()).toHaveAttribute('src', '/rules/catan.pdf');
    });

    it('shows the chosen rulebook, its line and its download', () => {
      renderAt('/rules/card-deck/euchre');
      const current = within(tabs()).getByRole('link', { current: 'page' });
      expect(current).toHaveTextContent('Euchre');
      expect(within(tabs()).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/rules/card-deck');
      expect(viewer()).toHaveAttribute('src', '/rules/card-deck.euchre.pdf');
      expect(viewer()).toHaveAttribute('title', 'Euchre rules');
      expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', '/rules/card-deck.euchre.pdf');
      expect(screen.getByText(/two jacks that outrank everything/)).toBeInTheDocument();
      // The heading stays the deck: the page is the family's, the tab is the game.
      expect(screen.getByRole('heading', { name: 'Card Deck' })).toBeInTheDocument();
    });

    it('falls back to the game\'s own rulebook for an unknown tab', () => {
      renderAt('/rules/card-deck/mahjong');
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Overview');
      expect(viewer()).toHaveAttribute('src', '/rules/card-deck.pdf');
    });

    it('scrolls the tab strip sideways to the chosen tab, and only the strip', () => {
      // jsdom has no layout: place Rummy 300px into the strip, and record
      // which elements get scrolled where.
      const offset = vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get')
        .mockImplementation(function (this: HTMLElement) { return this.textContent === 'Rummy' ? 300 : 0; });
      const scrolled: [Element, number][] = [];
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
      Object.defineProperty(Element.prototype, 'scrollLeft', {
        configurable: true,
        get: () => 0,
        set(this: Element, v: number) { scrolled.push([this, v]); },
      });
      try {
        renderAt('/rules/card-deck/rummy');
        expect(scrolled).toEqual([[tabs(), 284]]);
      } finally {
        offset.mockRestore();
        if (original) Object.defineProperty(Element.prototype, 'scrollLeft', original);
        else delete (Element.prototype as Partial<Element>).scrollLeft;
      }
    });

    it('asks the rules assistant about the rulebook on screen', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
      vi.stubGlobal('fetch', fetchMock);
      try {
        renderAt('/rules/catan/cities-and-knights');
        fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
        fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Barbarians?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await screen.findByText(/something went wrong/);
        const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
        expect(body).toMatchObject({ slug: 'catan', parts: ['cities-and-knights'] });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('tells the chat which rulebooks it reads for the tab on screen', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
      vi.stubGlobal('fetch', fetchMock);
      try {
        renderAt('/rules/hogwarts-battle/monster-box-3');
        fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
        expect(screen.getByText('Reading: Monster Box 3, plus Game 1–7 and Monster Box 1–2.')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Patronus?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await screen.findByText(/something went wrong/);
        const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
        expect(body.parts).toEqual(['game-2', 'game-3', 'game-4', 'game-5', 'game-6', 'game-7', 'monster-box-of-monsters', 'monster-box-2', 'monster-box-3']);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('moves between tabs', () => {
      renderAt('/rules/catan');
      fireEvent.click(within(tabs()).getByRole('link', { name: /Cities & Knights/ }));
      expect(viewer()).toHaveAttribute('src', '/rules/catan.cities-and-knights.pdf');
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Cities & Knights');
    });
  });
});

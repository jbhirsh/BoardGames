import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RulesPage from '../components/RulesPage';

// pdf.js needs a real browser; PdfReader.test.tsx covers the reader itself.
vi.mock('../components/PdfReader', () => ({
  default: ({ src, title }: { src: string; title: string }) => {
    if (src.includes('vampire')) throw new Error('reader broke');
    return <section aria-label={title} data-src={src} />;
  },
}));

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
        // 48px short of it, clear of the strip's faded edge.
        expect(scrolled).toEqual([[tabs(), 252]]);
      } finally {
        offset.mockRestore();
        if (original) Object.defineProperty(Element.prototype, 'scrollLeft', original);
        else delete (Element.prototype as Partial<Element>).scrollLeft;
      }
    });

    it('fades the strip at an end with tabs past it, and leaves a scroll by hand where it is', () => {
      // jsdom has no layout: a 300px strip holding 900px of tabs.
      let left = 0;
      const sets: number[] = [];
      const restore = [
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300),
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900),
      ];
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
      Object.defineProperty(Element.prototype, 'scrollLeft', {
        configurable: true,
        get: () => left,
        set(v: number) { sets.push(v); left = v; },
      });
      try {
        renderAt('/rules/card-deck');
        expect(tabs()).toHaveClass('fade-end');
        expect(tabs()).not.toHaveClass('fade-start');

        left = 200;
        fireEvent.scroll(tabs());
        expect(tabs()).toHaveClass('fade-start', 'fade-end');
        left = 600;
        fireEvent.scroll(tabs());
        expect(tabs()).toHaveClass('fade-start');
        expect(tabs()).not.toHaveClass('fade-end');
        // Only the opening scroll to the chosen tab; the strip re-rendered
        // as its fades changed without being snapped back.
        expect(sets).toEqual([0]);
      } finally {
        restore.forEach((r) => r.mockRestore());
        if (original) Object.defineProperty(Element.prototype, 'scrollLeft', original);
        else delete (Element.prototype as Partial<Element>).scrollLeft;
      }
    });

    it('brings a tab reached by keyboard clear of the faded edges', () => {
      // jsdom has no layout: a 300px strip; each tab 60px wide at a set offset.
      const at: Record<string, number> = { Overview: 0, Euchre: 280, Spades: 220, Hearts: 260 };
      let left = 0;
      const restore = [
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300),
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60),
        vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get')
          .mockImplementation(function (this: HTMLElement) { return at[this.textContent ?? ''] ?? 0; }),
      ];
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
      Object.defineProperty(Element.prototype, 'scrollLeft', {
        configurable: true,
        get: () => left,
        set(v: number) { left = v; },
      });
      try {
        renderAt('/rules/card-deck');
        const tab = (name: string) => within(tabs()).getByRole('link', { name });
        // Past the right edge: scrolled until its end is 48px clear.
        fireEvent.focus(tab('Euchre'));
        expect(left).toBe(88);
        // Inside the left fade: scrolled back until its start is 48px clear.
        left = 200;
        fireEvent.focus(tab('Spades'));
        expect(left).toBe(172);
        // Well inside: left alone.
        fireEvent.focus(tab('Hearts'));
        expect(left).toBe(172);
      } finally {
        restore.forEach((r) => r.mockRestore());
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

describe('RulesPage on a phone or touch device', () => {
  const touch = (matches: boolean) =>
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, addEventListener: () => {}, removeEventListener: () => {} })));
  const headWith = (headers: Record<string, string>, ok = true) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, headers: new Headers(headers) } as Response);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the rulebook in the page, under a download link with its size', async () => {
    touch(true);
    const fetchSpy = headWith({ 'content-length': '16445120' });
    renderAt('/rules/7-wonders');

    const download = screen.getByRole('link', { name: 'Download PDF' });
    expect(download).toHaveAttribute('href', '/rules/7-wonders.pdf');
    expect(download).toHaveAttribute('download');
    const reader = await screen.findByRole('region', { name: '7 Wonders rules' });
    expect(reader).toHaveAttribute('data-src', '/rules/7-wonders.pdf');
    // Above the reader, where a long rulebook won't bury it.
    expect(download.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTitle('7 Wonders rules')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(download).toHaveAccessibleDescription('16.4 MB'));
    expect(fetchSpy).toHaveBeenCalledWith('/rules/7-wonders.pdf', expect.objectContaining({ method: 'HEAD' }));
  });

  it('leaves the size out when the server does not give one', async () => {
    touch(true);
    const fetchSpy = headWith({ 'content-length': '5000000' }, false);
    renderAt('/rules/7-wonders');
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAccessibleDescription('');
  });

  it('cancels the size request when the page goes away', async () => {
    touch(true);
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      signals.push(init!.signal!);
      return new Promise(() => {});
    });
    const { unmount } = renderAt('/rules/catan');
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it('gives each tab its own reader', async () => {
    touch(true);
    headWith({});
    renderAt('/rules/catan');
    expect(await screen.findByRole('region', { name: 'Catan rules' })).toHaveAttribute('data-src', '/rules/catan.pdf');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name: /Cities & Knights/ }));
    expect(await screen.findByRole('region', { name: /Cities & Knights rules/ })).toHaveAttribute('data-src', '/rules/catan.cities-and-knights.pdf');
  });

  it('keeps the page, with its link to the PDF, when the reader fails', async () => {
    touch(true);
    headWith({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/rules/one-night-werewolf/vampire');
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('embeds the rulebook on a desktop and never asks its size', () => {
    touch(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderAt('/rules/7-wonders');
    const frame = screen.getByTitle('7 Wonders rules');
    const download = screen.getByRole('link', { name: 'Download PDF' });
    expect(download).not.toHaveAccessibleDescription(/MB/);
    // Under the embedded viewer, as before.
    expect(frame.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RulesPage from '../components/RulesPage';
import { FROM_LIST } from '../utils/fromList';
import { renderRouted } from './routed';
import { PROBE_MS, type SaveState } from '../pdfjs/saved';

// pdf.js needs a real browser; PdfReader.test.tsx covers the reader itself.
// This one says it has failed when a test sets `reader.fails`, and throws
// for a rulebook whose path holds `reader.broken`.
const reader = vi.hoisted(() => ({ fails: false, broken: 'vampire' as string | null }));
vi.mock('../components/PdfReader', async () => {
  const { useEffect } = await import('react');
  return {
    default: function PdfReader({ src, title, jump, warm, onFail }: { src: string; title: string; jump?: { page: number; key: string; place?: string; quote?: string }; warm?: readonly { src: string; page: number }[]; onFail?: (src: string) => void }) {
      if (reader.broken !== null && src.includes(reader.broken)) throw new Error('reader broke');
      useEffect(() => {
        if (reader.fails) onFail?.(src);
      }, [onFail, src]);
      return <section aria-label={title} data-src={src} data-jump={jump && `${jump.page}:${jump.key}`} data-place={jump?.place} data-quote={jump?.quote} data-warm={warm?.map((w) => `${w.src}:${w.page}`).join(' ')} />;
    },
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rules/:slug/:part?" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * A service worker in charge of the page, as the browser gives it: a
 * container that tells of a new one taking charge, and the one in charge,
 * which takes messages (`postMessage`).
 */
function controlledBy(postMessage: (message: never, transfer: Transferable[]) => void = () => {}) {
  const container = Object.assign(new EventTarget(), { controller: { postMessage } });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
}

/** The question a fetch mock was sent: the POST, since the PDF's size is asked (HEAD) first. */
function body(fetchMock: { mock: { calls: unknown[][] } }) {
  const post = (fetchMock.mock.calls as [string, RequestInit][]).find(([, init]) => init?.method === 'POST')!;
  return JSON.parse(post[1].body as string);
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
    // The reader loads lazily, so it is waited for.
    const viewer = () => screen.findByRole('region', { name: / rules$/ });

    it('shows no tabs for a game with one rulebook', () => {
      renderAt('/rules/7-wonders');
      expect(screen.queryByRole('navigation', { name: 'Rulebooks' })).not.toBeInTheDocument();
    });

    it('gives a game\'s own further rulebooks a tab each, then its add-ons', async () => {
      renderAt('/rules/hogwarts-battle/game-4');
      const links = within(tabs()).getAllByRole('link');
      expect(links.map(l => l.textContent)).toEqual([
        'Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7',
        'Monster Box 1expansion', 'Monster Box 2expansion', 'Monster Box 3expansion', 'Monster Box 4expansion',
      ]);
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Game 4');
      expect(await viewer()).toHaveAttribute('data-src', '/rules/hogwarts-battle.game-4.pdf');
      expect(await viewer()).toHaveAccessibleName('Hogwarts Battle: Game 4 rules');
    });

    it('opens on the base game, with a tab per add-on marked by its kind', async () => {
      renderAt('/rules/catan');
      const links = within(tabs()).getAllByRole('link');
      // The extension's name already says what it is, so only the expansion is tagged.
      expect(links.map(l => l.textContent)).toEqual(['Base game', '5–6 Player Extension', 'Cities & Knightsexpansion']);
      expect(links[0]).toHaveAttribute('aria-current', 'page');
      expect(links[1]).not.toHaveAttribute('aria-current');
      expect(links[1]).toHaveAttribute('href', '/rules/catan/5-6-player-extension');
      expect(await viewer()).toHaveAttribute('data-src', '/rules/catan.pdf');
    });

    it('shows the chosen rulebook, its line and its download', async () => {
      renderAt('/rules/card-deck/euchre');
      const current = within(tabs()).getByRole('link', { current: 'page' });
      expect(current).toHaveTextContent('Euchre');
      expect(within(tabs()).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/rules/card-deck');
      expect(await viewer()).toHaveAttribute('data-src', '/rules/card-deck.euchre.pdf');
      expect(await viewer()).toHaveAccessibleName('Euchre rules');
      expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', '/rules/card-deck.euchre.pdf');
      expect(screen.getByText(/two jacks that outrank everything/)).toBeInTheDocument();
      // The heading stays the deck: the page is the family's, the tab is the game.
      expect(screen.getByRole('heading', { name: 'Card Deck' })).toBeInTheDocument();
    });

    it('switches tabs in place, so Back still returns to the list it came from', () => {
      const router = renderRouted(<RulesPage />, ['/?p=5', { pathname: '/rules/catan', state: FROM_LIST }], '/rules/:slug/:part?');
      fireEvent.click(within(tabs()).getByRole('link', { name: '5–6 Player Extension' }));
      expect(router.state.historyAction).toBe('REPLACE');
      expect(router.state.location).toMatchObject({ pathname: '/rules/catan/5-6-player-extension', state: { fromList: true } });

      fireEvent.click(screen.getByRole('link', { name: /Back to The Game Room/ }));
      expect(router.state.location).toMatchObject({ pathname: '/', search: '?p=5' });
    });

    it('falls back to the game\'s own rulebook for an unknown tab', async () => {
      renderAt('/rules/card-deck/mahjong');
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Overview');
      expect(await viewer()).toHaveAttribute('data-src', '/rules/card-deck.pdf');
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
        expect(body(fetchMock)).toMatchObject({ slug: 'catan', parts: ['cities-and-knights'] });
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
        expect(body(fetchMock).parts).toEqual(['game-2', 'game-3', 'game-4', 'game-5', 'game-6', 'game-7', 'monster-box-of-monsters', 'monster-box-2', 'monster-box-3']);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('opens a tab the assistant names in place too, keeping the way back to the list', async () => {
      const answer = new TextEncoder().encode("That's in the Cities & Knights rules.");
      let read = false;
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        body: { getReader: () => ({ read: async () => (read ? { done: true } : (read = true, { done: false, value: answer })) }) },
      }) as unknown as Response));
      try {
        const router = renderRouted(<RulesPage />, ['/?p=3', { pathname: '/rules/catan', state: FROM_LIST }], '/rules/:slug/:part?');
        fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
        fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Knights?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(await screen.findByRole('link', { name: /Open Cities & Knights/ }));
        expect(router.state.historyAction).toBe('REPLACE');
        expect(router.state.location).toMatchObject({ pathname: '/rules/catan/cities-and-knights', state: { fromList: true } });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('links an answer\'s citations to their rulebooks, each named with what it shows', async () => {
      const answer = new TextEncoder().encode('Robber (Catan p. 11, 12), knights (Cities And Knights p. 4).');
      let read = false;
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        body: { getReader: () => ({ read: async () => (read ? { done: true } : (read = true, { done: false, value: answer })) }) },
      }) as unknown as Response));
      try {
        renderAt('/rules/catan/cities-and-knights');
        fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
        fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Robber?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(await screen.findByRole('link', { name: 'Base game p. 11' })).toHaveAttribute('href', '/rules/catan.pdf#page=11');
        expect(screen.getByRole('link', { name: 'p. 12, Base game' })).toHaveAttribute('href', '/rules/catan.pdf#page=12');
        expect(screen.getByRole('link', { name: 'Cities & Knights p. 4' })).toHaveAttribute('href', '/rules/catan.cities-and-knights.pdf#page=4');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('moves between tabs', async () => {
      renderAt('/rules/catan');
      fireEvent.click(within(tabs()).getByRole('link', { name: /Cities & Knights/ }));
      expect(await viewer()).toHaveAttribute('data-src', '/rules/catan.cities-and-knights.pdf');
      expect(within(tabs()).getByRole('link', { current: 'page' })).toHaveTextContent('Cities & Knights');
    });
  });
});

describe('RulesPage\'s reader', () => {
  // The page reads no media query: a desktop, a phone and a touch tablet
  // all get the reader. `desktop` makes every query answer as a desktop would.
  const desktop = () =>
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
  const headWith = (headers: Record<string, string>, ok = true) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, headers: new Headers(headers) } as Response);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the rulebook in the page, under a download link with its size from the build', async () => {
    const fetchSpy = headWith({ 'content-length': '16445120' });
    renderAt('/rules/7-wonders');

    const download = screen.getByRole('link', { name: 'Download PDF' });
    // There from the first paint, whatever the HEAD later says.
    expect(download).toHaveAccessibleDescription('4.6 MB');
    expect(download).toHaveAttribute('href', '/rules/7-wonders.pdf');
    expect(download).toHaveAttribute('download');
    const reader = await screen.findByRole('region', { name: '7 Wonders rules' });
    expect(reader).toHaveAttribute('data-src', '/rules/7-wonders.pdf');
    // Above the reader, where a long rulebook won't bury it.
    expect(download.compareDocumentPosition(reader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTitle('7 Wonders rules')).not.toBeInTheDocument();
    // The HEAD is still sent, for whether the network answers (outOfReach).
    expect(fetchSpy).toHaveBeenCalledWith('/rules/7-wonders.pdf', expect.objectContaining({ method: 'HEAD' }));
    await act(async () => {});
    expect(download).toHaveAccessibleDescription('4.6 MB');
  });

  it('cancels the size request when the page goes away', async () => {
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
    headWith({});
    renderAt('/rules/catan');
    expect(await screen.findByRole('region', { name: 'Catan rules' })).toHaveAttribute('data-src', '/rules/catan.pdf');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name: /Cities & Knights/ }));
    expect(await screen.findByRole('region', { name: /Cities & Knights rules/ })).toHaveAttribute('data-src', '/rules/catan.cities-and-knights.pdf');
  });

  it('keeps the page, with its link to the PDF, when the reader fails', async () => {
    headWith({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/rules/one-night-werewolf/vampire');
    expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  describe('offline', () => {
    const NOT_SAVED = 'Not saved on this device yet. Open it once with signal.';
    const OFFLINE = "You're offline — the assistant needs a connection.";
    const STILL_WORKS = ' The rulebook below still works.';
    const VAMPIRE = '/rules/one-night-werewolf.vampire.pdf';
    /** The service worker in charge, with these rulebooks saved. */
    const savedHere = (...saved: string[]) => {
      controlledBy();
      const match = vi.fn(async (src: string) => (saved.includes(src) ? new Response('%PDF') : undefined));
      vi.stubGlobal('caches', { match });
      return match;
    };
    /** Says the browser is online or not, and tells the page, as the browser does. */
    const goOnline = (online: boolean) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
      act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
    };
    /** The chat's live region by its box, where it says why it can't answer. */
    const chatSays = () => screen.getByPlaceholderText('Ask a rules question...').closest('form')!.previousElementSibling as HTMLElement;
    const tab = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name });

    afterEach(() => {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
      reader.broken = 'vampire';
      vi.useRealTimers();
    });

    it('says a rulebook not saved on this device needs signal, and drops its dead links', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere('/rules/catan.pdf');
      renderAt('/rules/one-night-werewolf/vampire');

      expect(await screen.findByRole('status')).toHaveTextContent(NOT_SAVED);
      expect(screen.getByRole('status')).toHaveClass('notice-info');
      expect(screen.queryByText(/couldn’t be shown here/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Open PDF' })).not.toBeInTheDocument();
      expect(screen.queryByText(/To print this rulebook/)).not.toBeInTheDocument();
      // The chat's own notice doesn't send them to it.
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      expect(screen.getByText(OFFLINE, { exact: true })).toBeInTheDocument();
    });

    it('says it only of the tab whose rulebook it is, and sends the chat to one that shows and is saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere('/rules/one-night-werewolf.pdf');
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getAllByRole('link')[0]);
      expect(await screen.findByRole('region', { name: /rules$/ })).toHaveAttribute('data-src', '/rules/one-night-werewolf.pdf');
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(OFFLINE + STILL_WORKS));
    });

    it('doesn\'t send the chat to a rulebook that shows but isn\'t saved, which can\'t draw the pages it hasn\'t fetched', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      headWith({});
      const match = savedHere();
      renderAt('/rules/catan');
      await screen.findByRole('region', { name: 'Catan rules' });
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      await vi.waitFor(() => expect(match).toHaveBeenCalledWith('/rules/catan.pdf', expect.anything()));
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(new RegExp(`^${OFFLINE}$`)));
    });

    it('asks again as the browser goes offline, saying the notice whole once it knows', async () => {
      headWith({});
      renderAt('/rules/catan');
      await screen.findByRole('region', { name: 'Catan rules' });
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      await act(async () => {});
      // Saved in the background since it was opened.
      const match = savedHere('/rules/catan.pdf');
      goOnline(false);
      // Not said and then added to: nothing until it is known.
      expect(chatSays()).toBeEmptyDOMElement();
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(OFFLINE + STILL_WORKS));
      expect(match).toHaveBeenCalledWith('/rules/catan.pdf', expect.anything());
    });

    it('keeps what the notice says while another tab\'s rulebook is asked after', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      headWith({});
      let answer: (saved: boolean) => void = () => {};
      savedHere('/rules/catan.pdf');
      renderAt('/rules/catan');
      await screen.findByRole('region', { name: 'Catan rules' });
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(OFFLINE + STILL_WORKS));

      vi.stubGlobal('caches', { match: () => new Promise((resolve) => { answer = (saved) => resolve(saved ? new Response('%PDF') : undefined); }) });
      fireEvent.click(tab(/Cities & Knights/));
      expect(await screen.findByRole('region', { name: /Cities & Knights rules/ })).toBeInTheDocument();
      expect(chatSays()).toHaveTextContent(OFFLINE + STILL_WORKS);
      await act(async () => answer(false));
      expect(chatSays()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
    });

    it('forgets a rulebook\'s failure once another tab is open, so going back gives it a fresh reader', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere();
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getAllByRole('link')[0]);
      await screen.findByRole('region', { name: /rules$/ });
      // Saved meanwhile (another window read it), so it loads offline now.
      reader.broken = null;
      savedHere(VAMPIRE);
      fireEvent.click(tab(/Vampire/));
      expect(await screen.findByRole('region', { name: /Vampire rules/ })).toHaveAttribute('data-src', VAMPIRE);
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(OFFLINE + STILL_WORKS));
    });

    it('gives a rulebook that failed offline another go when the network comes back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument();

      reader.broken = null;
      fetchSpy.mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': '2048' }) } as Response);
      goOnline(true);
      expect(await screen.findByRole('region', { name: /Vampire rules/ })).toHaveAttribute('data-src', VAMPIRE);
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAccessibleDescription('2.1 MB');
    });

    it('judges a failure on the network\'s return by that attempt\'s own HEAD, not the last one\'s', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // A dead Wi-Fi, which the browser calls online, then the network back.
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      fetchSpy.mockResolvedValue({ ok: true, headers: new Headers() } as Response);
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();

      // The reader still can't show it, but now for want of nothing the
      // network could give: the note that says to download it, and the links.
      goOnline(true);
      expect(await screen.findByText(/couldn’t be shown here/)).toBeInTheDocument();
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
    });

    it('pays no heed to the saved check of a tab left before it answered', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      headWith({});
      controlledBy();
      let late: (saved: boolean) => void = () => {};
      vi.stubGlobal('caches', {
        match: (src: string) => (src === '/rules/catan.pdf'
          ? new Promise((resolve) => { late = (saved) => resolve(saved ? new Response('%PDF') : undefined); })
          : Promise.resolve(undefined)),
      });
      renderAt('/rules/catan');
      await screen.findByRole('region', { name: 'Catan rules' });
      fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
      fireEvent.click(tab(/Cities & Knights/));
      await vi.waitFor(() => expect(chatSays()).toHaveTextContent(new RegExp(`^${OFFLINE}$`)));
      await act(async () => late(true));
      expect(chatSays()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
    });

    it('says so again if it fails again, and no longer listens once it loads', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
      const heads = () => fetchSpy.mock.calls.filter(([, init]) => init?.method === 'HEAD').length;
      const before = heads();

      // Back, it says, but with nothing coming through.
      goOnline(true);
      expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
      expect(heads()).toBeGreaterThan(before);

      reader.broken = null;
      goOnline(true);
      expect(await screen.findByRole('region', { name: /Vampire rules/ })).toBeInTheDocument();
      const remove = vi.spyOn(window, 'removeEventListener');
      const add = vi.spyOn(window, 'addEventListener');
      goOnline(true);
      expect(screen.getByRole('region', { name: /Vampire rules/ })).toBeInTheDocument();
      expect(add).not.toHaveBeenCalledWith('online', expect.anything());
      expect(remove).not.toHaveBeenCalledWith('online', expect.anything());
    });

    it('says nothing in the reader\'s place until it knows why it failed, and counts no answer in time as no network', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // The network neither answers nor fails.
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
      renderAt('/rules/one-night-werewolf/vampire');
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(VAMPIRE, expect.objectContaining({ method: 'HEAD' })));
      await act(async () => {});
      expect(screen.queryByText(/couldn’t be shown here/)).not.toBeInTheDocument();
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(PROBE_MS); });
      expect(screen.getByText(NOT_SAVED)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument();
    });

    it('counts a network that doesn\'t answer as none, though the browser says it is online, asking it once', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      renderAt('/rules/one-night-werewolf/vampire');

      expect(await screen.findByRole('status')).toHaveTextContent(NOT_SAVED);
      // The HEAD that asked its size answers for it too.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(VAMPIRE, expect.objectContaining({ method: 'HEAD' }));
      expect(screen.queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument();
    });

    it('keeps the note and the links for a rulebook saved on this device', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const match = savedHere(VAMPIRE);
      renderAt('/rules/one-night-werewolf/vampire');

      await vi.waitFor(() => expect(match).toHaveBeenCalledWith(VAMPIRE, { cacheName: 'gameroom-rulebooks', ignoreVary: true }));
      await act(async () => {});
      expect(screen.getByText(/couldn’t be shown here/)).toBeInTheDocument();
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
    });

    it('keeps the note and the links for a rulebook that fails online', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchSpy = headWith({});
      renderAt('/rules/one-night-werewolf/vampire');

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(screen.getByText(/couldn’t be shown here/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeInTheDocument();
      expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
    });
  });

  /** A HEAD for the PDF's size gets no answer; a question gets `answer`. */
  const answering = (answer: string) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'HEAD') return { ok: false, headers: new Headers() } as Response;
    let read = false;
    const value = new TextEncoder().encode(answer);
    return {
      ok: true,
      body: { getReader: () => ({ read: async () => (read ? { done: true } : (read = true, { done: false, value })) }) },
    } as unknown as Response;
  });
  const ask = () => {
    fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Robber?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  };

  it('opens a citation of another tab at its page in the reader, in place, under the answer', async () => {
    answering('A 7 moves the robber (Catan p. 5), knights (Cities And Knights p. 4), as before (p. 3).');
    const router = renderRouted(<RulesPage />, ['/?p=3', { pathname: '/rules/catan/cities-and-knights', state: FROM_LIST }], '/rules/:slug/:part?');
    ask();
    const link = await screen.findByRole('link', { name: 'Base game p. 5' });
    // Taken by the page, not opened as a PDF.
    expect(fireEvent.click(link)).toBe(false);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location).toMatchObject({ pathname: '/rules/catan', search: '?page=5', state: { fromList: true } });
    // The window stays put for the reader to move, not sent to the top first.
    expect(router.state.preventScrollReset).toBe(true);
    const reader = await screen.findByRole('region', { name: 'Catan rules' });
    expect(reader).toHaveAttribute('data-jump', `5:${router.state.location.key}`);
    expect(reader).toHaveAttribute('data-place', 'Base game');
    // With the words of the answer the citation closes, to mark on the page;
    // in the router state, not the URL.
    expect(reader).toHaveAttribute('data-quote', 'A 7 moves the robber');
    expect(router.state.location.state).toEqual({ fromList: true, quote: 'A 7 moves the robber' });
    expect(screen.getByText(/A 7 moves the robber/)).toBeInTheDocument();
    expect(screen.getByText('Reading: Base game.')).toBeInTheDocument();
    // The answer still reads as it was asked, on Cities & Knights: its own
    // page stays a link, and a bare page, which could have been either
    // rulebook there, stays text rather than turning into Catan's.
    expect(screen.getByRole('link', { name: 'Cities & Knights p. 4' })).toHaveAttribute('href', '/rules/catan.cities-and-knights.pdf#page=4');
    expect(screen.queryByRole('link', { name: /p\. 3/ })).not.toBeInTheDocument();
    expect(screen.getByText(/as before \(p\. 3\)/)).toBeInTheDocument();
    // A tab opened afterwards carries the way back, not the citation's words.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name: /Cities & Knights/ }));
    expect(router.state.location.state).toEqual({ fromList: true });
  });

  it('has the reader get the first page an answer cites in another tab ready as the answer lands', async () => {
    answering('Knights first (Cities And Knights p. 4). A 7 moves the robber (Catan p. 5, 6).');
    renderRouted(<RulesPage />, ['/rules/catan/cities-and-knights'], '/rules/:slug/:part?');
    const reader = await screen.findByRole('region', { name: 'Cities & Knights rules' });
    expect(reader).toHaveAttribute('data-warm', '');
    ask();
    await screen.findByRole('link', { name: 'Base game p. 5' });
    // Its own rulebook is open already; the base game's first cited page is wanted.
    await vi.waitFor(() => expect(reader).toHaveAttribute('data-warm', '/rules/catan.pdf:5'));
  });

  it('gets nothing ready for an answer that cites only the rulebook on screen', async () => {
    answering('Knights first (Cities And Knights p. 4).');
    renderRouted(<RulesPage />, ['/rules/catan/cities-and-knights'], '/rules/:slug/:part?');
    ask();
    await screen.findByRole('link', { name: 'Cities & Knights p. 4' });
    expect(screen.getByRole('region', { name: 'Cities & Knights rules' })).toHaveAttribute('data-warm', '');
  });

  it('gets nothing ready once the reader has failed, when a citation opens the PDF', async () => {
    reader.fails = true;
    try {
      answering('A 7 moves the robber (Catan p. 5).');
      renderRouted(<RulesPage />, ['/rules/catan/cities-and-knights'], '/rules/:slug/:part?');
      ask();
      await screen.findByRole('link', { name: 'Base game p. 5' });
      expect(screen.getByRole('region', { name: 'Cities & Knights rules' })).toHaveAttribute('data-warm', '');
    } finally {
      reader.fails = false;
    }
  });

  it('marks nothing for a citation with no words of its own before it', async () => {
    answering('Robber (p. 3), (p. 4).');
    renderRouted(<RulesPage />, ['/rules/azul'], '/rules/:slug/:part?');
    ask();
    fireEvent.click(await screen.findByRole('link', { name: 'p. 4, Azul rulebook' }));
    const reader = await screen.findByRole('region', { name: 'Azul rules' });
    expect(reader).toHaveAttribute('data-jump', expect.stringMatching(/^4:/));
    expect(reader).not.toHaveAttribute('data-quote');
  });

  it('jumps the reader on screen to a page of its own rulebook, again on each tap', async () => {
    answering('Roll two dice (p. 3).');
    const router = renderRouted(<RulesPage />, ['/rules/catan'], '/rules/:slug/:part?');
    const reader = await screen.findByRole('region', { name: 'Catan rules' });
    expect(reader).not.toHaveAttribute('data-jump');
    ask();
    const link = await screen.findByRole('link', { name: 'p. 3, Base game' });
    fireEvent.click(link);
    expect(router.state.location).toMatchObject({ pathname: '/rules/catan', search: '?page=3' });
    const first = router.state.location.key;
    // The same reader, told to jump.
    expect(screen.getByRole('region', { name: 'Catan rules' })).toBe(reader);
    expect(reader).toHaveAttribute('data-jump', `3:${first}`);
    fireEvent.click(link);
    expect(router.state.location.key).not.toBe(first);
    expect(reader).toHaveAttribute('data-jump', `3:${router.state.location.key}`);
  });

  it('leaves a link that is not a citation to the browser', async () => {
    answering('See [the FAQ](https://example.com/faq).');
    const router = renderRouted(<RulesPage />, ['/rules/catan'], '/rules/:slug/:part?');
    ask();
    const link = await screen.findByRole('link', { name: 'the FAQ' });
    expect(fireEvent.click(link)).toBe(true);
    expect(router.state.location.search).toBe('');
  });

  it('opens the reader at the page a link asks for', async () => {
    headWith({});
    renderAt('/rules/catan?page=4');
    const reader = await screen.findByRole('region', { name: 'Catan rules' });
    expect(reader).toHaveAttribute('data-jump', '4:default');
    // A shared link has no answer behind it: nothing to mark.
    expect(reader).not.toHaveAttribute('data-quote');
  });

  it('ignores a page that is no page', async () => {
    headWith({});
    renderAt('/rules/catan?page=0');
    expect(await screen.findByRole('region', { name: 'Catan rules' })).not.toHaveAttribute('data-jump');
  });

  it('names no rulebook for a game with only its own', async () => {
    answering('Draw two (p. 4).');
    renderRouted(<RulesPage />, ['/rules/azul'], '/rules/:slug/:part?');
    ask();
    await screen.findByRole('link', { name: 'p. 4, Azul rulebook' });
    fireEvent.click(screen.getByRole('link', { name: 'p. 4, Azul rulebook' }));
    expect(await screen.findByRole('region', { name: 'Azul rules' })).not.toHaveAttribute('data-place');
  });

  it('leaves citations to open the PDF once the reader has failed', async () => {
    reader.fails = true;
    try {
      answering('A 7 moves the robber (Catan p. 5).');
      const router = renderRouted(<RulesPage />, ['/rules/catan/cities-and-knights'], '/rules/:slug/:part?');
      ask();
      expect(fireEvent.click(await screen.findByRole('link', { name: 'Base game p. 5' }))).toBe(true);
      expect(router.state.location.pathname).toBe('/rules/catan/cities-and-knights');
    } finally {
      reader.fails = false;
    }
  });

  it('leaves citations to open the PDF when the reader itself won\'t load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    answering('A vampire wakes (Vampire p. 2).');
    const router = renderRouted(<RulesPage />, ['/rules/one-night-werewolf/vampire'], '/rules/:slug/:part?');
    await screen.findByText(/couldn’t be shown here/);
    ask();
    const link = await screen.findByRole('link', { name: 'Vampire p. 2' });
    expect(fireEvent.click(link)).toBe(true);
    expect(router.state.location.search).toBe('');
  });

  it('takes citations in the reader again once a rulebook that failed offline loads on the network\'s return', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    answering('A vampire wakes (Vampire p. 2).');
    try {
      const router = renderRouted(<RulesPage />, ['/rules/one-night-werewolf/vampire'], '/rules/:slug/:part?');
      expect(await screen.findByText('Not saved on this device yet. Open it once with signal.')).toBeInTheDocument();

      reader.broken = null;
      onLine.mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      const shown = await screen.findByRole('region', { name: /Vampire rules/ });
      ask();
      const link = await screen.findByRole('link', { name: 'Vampire p. 2' });
      expect(fireEvent.click(link)).toBe(false);
      expect(router.state.location).toMatchObject({ pathname: '/rules/one-night-werewolf/vampire', search: '?page=2' });
      expect(screen.getByRole('region', { name: /Vampire rules/ })).toBe(shown);
      expect(shown).toHaveAttribute('data-jump', expect.stringMatching(/^2:/));
    } finally {
      reader.broken = 'vampire';
    }
  });

  it('takes citations in the reader again on another tab once one has failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    answering('Everyone wakes in order (p. 3).');
    const router = renderRouted(<RulesPage />, ['/rules/one-night-werewolf/vampire'], '/rules/:slug/:part?');
    await screen.findByText(/couldn’t be shown here/);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getAllByRole('link')[0]);
    await screen.findByRole('region', { name: /rules$/ });
    ask();
    const link = await screen.findByRole('link', { name: /p\. 3/ });
    expect(fireEvent.click(link)).toBe(false);
    expect(router.state.location.search).toBe('?page=3');
  });

  it('opens a citation in place on a desktop too, leaving a new tab to a modified click', async () => {
    desktop();
    answering('A 7 moves the robber (Catan p. 5).');
    const router = renderRouted(<RulesPage />, ['/rules/catan/cities-and-knights'], '/rules/:slug/:part?');
    ask();
    const link = await screen.findByRole('link', { name: 'Base game p. 5' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(router.state.location.pathname).toBe('/rules/catan/cities-and-knights');
    expect(fireEvent.click(link)).toBe(false);
    expect(router.state.location).toMatchObject({ pathname: '/rules/catan', search: '?page=5' });
  });

  it('draws the rulebook in the page on a desktop too, under a download link with its size', async () => {
    desktop();
    headWith({ 'content-length': '2048' });
    renderAt('/rules/7-wonders');
    expect(await screen.findByRole('region', { name: '7 Wonders rules' })).toHaveAttribute('data-src', '/rules/7-wonders.pdf');
    expect(screen.queryByTitle('7 Wonders rules')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAccessibleDescription('4.6 MB');
    // The browser's own viewer a click away, for its zoom, thumbnails and printing.
    const open = screen.getByRole('link', { name: 'Open PDF' });
    expect(open).toHaveAttribute('href', '/rules/7-wonders.pdf');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).not.toHaveAttribute('download');
    expect(screen.getByText(/To print this rulebook, use Open PDF/)).toBeInTheDocument();
  });
  describe('Save for offline', () => {
    const SEVEN = '/rules/7-wonders.pdf';
    /**
     * A service worker in charge of the page, answering a page's question
     * about a rulebook with `asked(path)` and a request to save one with
     * `saving(path)`, each a list of answers sent at once, or a function
     * that gets the port to answer on later.
     */
    function worker({ asked = () => ['unsaved'], saving = () => ['saving', 'saved'] }: {
      asked?: (path: string) => SaveState[] | ((say: (state: SaveState) => void) => void);
      saving?: (path: string) => SaveState[] | ((say: (state: SaveState) => void) => void);
    } = {}) {
      const postMessage = vi.fn((message: { path: string; save: boolean }, [port]: Transferable[]) => {
        const say = (state: SaveState) => (port as MessagePort).postMessage({ path: message.path, state });
        const answers = (message.save ? saving : asked)(message.path);
        if (typeof answers === 'function') answers(say);
        else answers.forEach(say);
      });
      controlledBy(postMessage);
      return postMessage;
    }
    /** The service worker's saved rulebooks, as the page's saved check reads them. */
    const savedHere = (...saved: string[]) =>
      vi.stubGlobal('caches', { match: vi.fn(async (src: string) => (saved.includes(src) ? new Response('%PDF') : undefined)) });
    const asks = (post: ReturnType<typeof worker>) => post.mock.calls.map(([m]) => `${m.path} ${m.save ? 'save' : 'ask'}`);
    /** The Save for offline button, once the page has asked the worker after its rulebook. */
    const saveButton = async () => {
      const button = await screen.findByRole('button', { name: 'Save for offline' });
      await act(async () => {});
      return button;
    };
    const links = () => screen.getByRole('link', { name: 'Open PDF' }).parentElement!;

    afterEach(() => {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
      delete (navigator as { connection?: unknown }).connection;
      reader.broken = 'vampire';
    });

    it('offers nothing without a service worker in charge, which would save nothing', async () => {
      const fetchSpy = headWith({});
      renderAt('/rules/7-wonders');
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/Sav(ed|ing)/)).not.toBeInTheDocument();
    });

    it('offers to save a large rulebook in the links row, described by its size, without waiting for the HEAD', async () => {
      vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
      savedHere();
      const post = worker();
      renderAt('/rules/7-wonders');
      const button = await saveButton();
      expect(button).toHaveAccessibleDescription('4.6 MB');
      expect(asks(post)).toEqual([`${SEVEN} ask`]);
      // The third in the row above the reader, after Download PDF and Open
      // PDF; nothing in the header.
      expect(links()).toHaveClass('rules-pdf-links');
      expect(links()).toContainElement(button);
      expect(screen.getByRole('banner')).not.toContainElement(button);
      const items = [...links().children];
      expect(items.map((el) => el.textContent)).toEqual(['Download PDF·4.6 MB', 'Open PDF', 'Save for offline']);
    });

    it('saves it on a tap, saying it is saving and then that it is saved', async () => {
      headWith({});
      savedHere();
      let finish: (state: SaveState) => void = () => {};
      const post = worker({ saving: () => (say) => { say('saving'); finish = say; } });
      renderAt('/rules/7-wonders');
      fireEvent.click(await saveButton());
      expect(screen.getByText('Saving…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sav/ })).not.toBeInTheDocument();
      expect(asks(post)).toEqual([`${SEVEN} ask`, `${SEVEN} save`]);
      await act(async () => finish('saved'));
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      expect(screen.getByText('Saved on this device.')).toHaveAttribute('aria-live', 'polite');
    });

    it('says when a save fails, and tries again on another tap', async () => {
      headWith({});
      savedHere();
      const post = worker({ saving: () => ['saving', 'failed'] });
      renderAt('/rules/7-wonders');
      fireEvent.click(await saveButton());
      const retry = await screen.findByRole('button', { name: 'Couldn’t save. Try again' });
      fireEvent.click(retry);
      expect(asks(post)).toEqual([`${SEVEN} ask`, `${SEVEN} save`, `${SEVEN} save`]);
    });

    it('says when the device has no room for it, with nothing to try again', async () => {
      headWith({});
      savedHere();
      worker({ saving: () => ['saving', 'full'] });
      renderAt('/rules/7-wonders');
      fireEvent.click(await saveButton());
      expect(await screen.findByText('Not enough space on this device')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();
    });

    it('says Saving… of a small rulebook from the first, then Saved, having the worker save it', async () => {
      headWith({});
      savedHere();
      let finish: (state: SaveState) => void = () => {};
      const post = worker({ saving: () => (say) => { say('saving'); finish = say; } });
      renderAt('/rules/azul');
      await vi.waitFor(() => expect(screen.getByText('Saving…')).toBeVisible());
      expect(screen.queryByRole('button', { name: 'Save for offline' })).not.toBeInTheDocument();
      expect(asks(post)).toEqual(['/rules/azul.pdf save']);
      await act(async () => finish('saved'));
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
    });

    it('says Saved of a rulebook already saved, without asking the service worker', async () => {
      headWith({});
      savedHere('/rules/azul.pdf');
      const post = worker();
      renderAt('/rules/azul');
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      await act(async () => {});
      expect(post).not.toHaveBeenCalled();
      // Saved already: nothing announced.
      expect(screen.queryByText('Saved on this device.')).not.toBeInTheDocument();
    });

    it('acts on the tab on screen, an add-on\'s rulebook included, announcing only a save that ends', async () => {
      headWith({});
      savedHere();
      const post = worker({ asked: (path) => [path === '/rules/catan.pdf' ? 'saved' : 'unsaved'] });
      renderAt('/rules/catan');
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name: /Cities & Knights/ }));
      fireEvent.click(await saveButton());
      expect(asks(post)).toEqual(['/rules/catan.pdf ask', '/rules/catan.cities-and-knights.pdf ask', '/rules/catan.cities-and-knights.pdf save']);
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      expect(screen.getByText('Saved on this device.')).toBeInTheDocument();
      // Back on the base game, what was said of it stands, and isn't news.
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Rulebooks' })).getByRole('link', { name: 'Base game' }));
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      expect(screen.queryByText('Saved on this device.')).not.toBeInTheDocument();
    });

    it('keeps Saved offline, and offers nothing for a rulebook offline and unsaved', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere('/rules/azul.pdf');
      const post = worker();
      const { unmount } = renderAt('/rules/azul');
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      unmount();
      renderAt('/rules/catan');
      await screen.findByRole('region', { name: 'Catan rules' });
      await act(async () => {});
      expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('offers nothing for a rulebook out of reach, whose notice says to tap it next time there is signal', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      reader.broken = '7-wonders';
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere();
      worker();
      renderAt('/rules/7-wonders');
      expect(await screen.findByRole('status')).toHaveTextContent('Not saved on this device yet. Tap Save for offline next time you have signal.');
      expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
    });

    it('says the same of a small rulebook while the browser saves data, when none saves itself', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByRole('status')).toHaveTextContent('Not saved on this device yet. Tap Save for offline next time you have signal.');
    });

    it('asks again when the network comes back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere();
      const post = worker({ saving: () => ['saving', 'saved'] });
      renderAt('/rules/one-night-werewolf/vampire');
      expect(await screen.findByText(/Not saved on this device yet/)).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();

      reader.broken = null;
      fetchSpy.mockReturnValue(new Promise(() => {}));
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      await screen.findByRole('region', { name: /Vampire rules/ });
      expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
      expect(asks(post)).toEqual(['/rules/one-night-werewolf.vampire.pdf save']);
    });

    it('hides the item when the network the browser claims finds no rulebook', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      reader.broken = '7-wonders';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      savedHere();
      worker();
      renderAt('/rules/7-wonders');
      expect(await screen.findByText(/Tap Save for offline next time/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import { MemoryRouter } from 'react-router';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from '../components/RulesChat';
import { FROM_LIST } from '../utils/fromList';
import { renderRouted } from './routed';

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

/** A streamed reply; a string chunk is sent as its UTF-8 bytes, a byte array as is. */
function streamResponse(chunks: (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const bytes = (c: string | Uint8Array) => (typeof c === 'string' ? encoder.encode(c) : c);
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: bytes(chunks[i++]) })
            : Promise.resolve({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

function setup(parts?: string[], scope?: string) {
  render(
    <RulesChatProvider>
      <RulesChatToggle />
      <RulesChatPanel slug="cranium" gameName="Cranium" parts={parts} scope={scope} />
    </RulesChatProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /ai rules assistant/i }));
}

function send(question: string) {
  fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('RulesChat', () => {
  it('hides the panel until toggled open, then shows the welcome message', () => {
    setup();
    expect(screen.queryByPlaceholderText('Ask a rules question...')).toBeNull();
    openPanel();
    expect(screen.getByText('Hi! Ask me anything about the rules for Cranium.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close ai chat/i })).toBeInTheDocument();
  });

  it('disables Send while the input is empty', () => {
    setup();
    openPanel();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), {
      target: { value: 'How many players?' },
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('streams an answer into an assistant bubble', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['4 or more ', 'players.']));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    openPanel();
    send('How many players?');

    expect(screen.getByText('How many players?')).toBeInTheDocument();
    expect(await screen.findByText('4 or more players.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ slug: 'cranium', message: 'How many players?', history: [] });
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Ask a rules question...')).toBeEnabled(),
    );
  });

  // The network splits the stream wherever it likes, including inside a
  // multi-byte character, which must be joined, not decoded half at a time.
  it('joins a character split across two chunks', async () => {
    const bytes = new TextEncoder().encode('Lead the 10 of ♠ — café rules.');
    const cut = bytes.indexOf(0xe2) + 1; // one byte into the three-byte ♠
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([bytes.slice(0, cut), bytes.slice(cut)])));
    setup();
    openPanel();
    send('Which suit leads?');

    expect(await screen.findByText('Lead the 10 of ♠ — café rules.')).toBeInTheDocument();
    expect(screen.queryByText(/\uFFFD/)).toBeNull();
  });

  it('marks a character the stream cut off at its end', async () => {
    const bytes = new TextEncoder().encode('Spades ♠');
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([bytes.slice(0, -1)])));
    setup();
    openPanel();
    send('Which suit?');

    expect(await screen.findByText('Spades \uFFFD')).toBeInTheDocument();
  });

  it('says what it is reading when told, and nothing when not', () => {
    setup(['game-2'], 'Reading: Game 2, plus Game 1.');
    openPanel();
    expect(screen.getByText('Reading: Game 2, plus Game 1.')).toHaveClass('rules-chat-scope');
  });

  it('shows no reading line without a scope', () => {
    setup();
    openPanel();
    expect(document.querySelector('.rules-chat-scope')).toBeNull();
  });

  it('names the rulebooks to read along with the game\'s own', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['ok']));
    vi.stubGlobal('fetch', fetchMock);
    setup(['cities-and-knights']);
    openPanel();
    send('How do knights work?');
    await screen.findByText('ok');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ slug: 'cranium', message: 'How do knights work?', history: [], parts: ['cities-and-knights'] });
  });

  it('links the tabs an answer names, once the answer is in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(["That's in the 5 6 Player Extension."])));
    const linksFor = vi.fn((answer: string) =>
      answer.includes('Extension') ? [{ label: '5–6 Player Extension', to: '/rules/catan/5-6-player-extension' }] : [],
    );
    render(
      <MemoryRouter>
        <RulesChatProvider>
          <RulesChatToggle />
          <RulesChatPanel slug="catan" gameName="Catan" linksFor={linksFor} />
        </RulesChatProvider>
      </MemoryRouter>,
    );
    openPanel();
    // The greeting names no tab and is never checked.
    expect(screen.queryByRole('link')).toBeNull();
    send('How do we play with 5?');
    const link = await screen.findByRole('link', { name: 'Open 5–6 Player Extension' });
    expect(link).toHaveAttribute('href', '/rules/catan/5-6-player-extension');
    expect(linksFor).not.toHaveBeenCalledWith('Hi! Ask me anything about the rules for Catan.');
  });

  it('opens a tab an answer names in place, with the state it is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(["That's in the 5 6 Player Extension."])));
    const router = renderRouted(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel
          slug="catan"
          gameName="Catan"
          linksFor={() => [{ label: '5–6 Player Extension', to: '/rules/catan/5-6-player-extension', state: FROM_LIST }]}
        />
      </RulesChatProvider>,
      ['/', { pathname: '/rules/catan', state: FROM_LIST }],
      '/rules/catan',
    );
    openPanel();
    send('How do we play with 5?');
    fireEvent.click(await screen.findByRole('link', { name: 'Open 5–6 Player Extension' }));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location).toMatchObject({ pathname: '/rules/catan/5-6-player-extension', state: { fromList: true } });
  });

  it('opens an answer\'s page citations in a tab of their own', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['Roll two dice (p. 4).'])));
    const citeLinks = (answer: string) => answer.replace('(p. 4)', '([p. 4](/rules/catan.pdf#page=4))');
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" citeLinks={citeLinks} />
      </RulesChatProvider>,
    );
    openPanel();
    send('How many dice?');
    const link = await screen.findByRole('link', { name: 'p. 4' });
    expect(link).toHaveAttribute('href', '/rules/catan.pdf#page=4');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names a citation by its text and its rulebook, and leaves any other link\'s title alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['Roll two dice (p. 4). See [the FAQ](https://example.com/faq "Our FAQ").'])));
    const citeLinks = (answer: string) => answer.replace('(p. 4)', '([p. 4](/rules/catan.pdf#page=4 "p. 4, Base game"))');
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" citeLinks={citeLinks} isCitation={(href) => href.includes('#page=')} />
      </RulesChatProvider>,
    );
    openPanel();
    send('How many dice?');
    const link = await screen.findByRole('link', { name: 'p. 4, Base game' });
    expect(link).toHaveTextContent('p. 4');
    expect(link).not.toHaveAttribute('title');
    const faq = screen.getByRole('link', { name: 'the FAQ' });
    expect(faq).toHaveAttribute('title', 'Our FAQ');
    expect(faq).not.toHaveAttribute('aria-label');
  });

  it('lets the page take a citation it can show in place, and leaves the rest to open the PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['Roll (p. 4), trade (p. 9), see [the FAQ](https://example.com/faq).'])));
    const citeLinks = (answer: string) => answer.replace(/\(p\. (\d)\)/g, '([p. $1](/rules/catan.pdf#page=$1))');
    const onCite = vi.fn((href: string) => href.endsWith('=4'));
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" citeLinks={citeLinks} isCitation={(href) => href.includes('#page=')} onCite={onCite} />
      </RulesChatProvider>,
    );
    openPanel();
    send('How do turns go?');
    const four = await screen.findByRole('link', { name: 'p. 4' });
    const nine = screen.getByRole('link', { name: 'p. 9' });
    // fireEvent returns false when the click's default was prevented.
    expect(fireEvent.click(four)).toBe(false);
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=4');
    expect(fireEvent.click(nine)).toBe(true);
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=9');
    // Opening it in a new tab on purpose is left to the browser, as is any
    // link that isn't a citation.
    onCite.mockClear();
    for (const how of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(fireEvent.click(four, how)).toBe(true);
    }
    expect(fireEvent.click(screen.getByRole('link', { name: 'the FAQ' }))).toBe(true);
    expect(onCite).not.toHaveBeenCalled();
  });

  it('reads each answer\'s links against the tab it was asked on, even one still streaming', async () => {
    const encoder = new TextEncoder();
    let release = () => {};
    const replies = [['First (p. 1).'], ['Second ', '(p. 2).']];
    vi.stubGlobal('fetch', vi.fn(async () => {
      const chunks = replies.shift()!;
      let i = 0;
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              // The second reply waits halfway until the test lets it go on.
              if (chunks.length === 2 && i === 1) await new Promise<void>((resolve) => { release = resolve; });
              return i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined };
            },
          }),
        },
      } as unknown as Response;
    }));
    const citeLinks = vi.fn((answer: string, tab?: string) => answer.replace(/\((p\. \d)\)/, `([$1 on ${tab}](/x))`));
    const linksFor = vi.fn<(answer: string, tab?: string) => { label: string; to: string }[]>(() => []);
    const panel = (tab: string) => (
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" tab={tab} citeLinks={citeLinks} linksFor={linksFor} />
      </RulesChatProvider>
    );
    const { rerender } = render(panel('base'));
    openPanel();
    send('One?');
    expect(await screen.findByRole('link', { name: 'p. 1 on base' })).toBeInTheDocument();
    send('Two?');
    await screen.findByText(/Second/);
    // The tab changes while the second answer is still coming in.
    rerender(panel('knights'));
    await act(async () => release());
    expect(await screen.findByRole('link', { name: 'p. 2 on base' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'p. 1 on base' })).toBeInTheDocument();
    expect(linksFor).toHaveBeenLastCalledWith('Second (p. 2).', 'base');
    // The greeting, asked on no tab, goes by the one on screen.
    expect(citeLinks).toHaveBeenCalledWith('Hi! Ask me anything about the rules for Catan.', 'knights');
  });

  it('offers starter questions until the first is asked, and asks the one tapped', async () => {
    const fetchMock = vi.fn(async () => streamResponse(['Deal 7 each.']));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="uno" gameName="UNO" starters={['How do we set up for 4 players?', 'How do you win?']} />
      </RulesChatProvider>,
    );
    openPanel();
    const panel = document.querySelector('.rules-chat-panel')!;
    expect(panel).toHaveClass('rules-chat-panel-fresh');
    expect(screen.getByRole('group', { name: 'Try asking' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How do we set up for 4 players?' }));

    expect(await screen.findByText('Deal 7 each.')).toBeInTheDocument();
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ slug: 'uno', message: 'How do we set up for 4 players?', history: [] });
    expect(screen.queryByRole('group', { name: 'Try asking' })).toBeNull();
    expect(panel).not.toHaveClass('rules-chat-panel-fresh');
    // The tapped button is gone; focus comes back to the box.
    await waitFor(() => expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveFocus());
  });

  it('leaves a half-typed question in the box when a starter is tapped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['Sure.'])));
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="uno" gameName="UNO" starters={['How do you win?']} />
      </RulesChatProvider>,
    );
    openPanel();
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'Can I stack' } });
    fireEvent.click(screen.getByRole('button', { name: 'How do you win?' }));
    await screen.findByText('Sure.');
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('Can I stack');
  });

  it('shows no starters when given none', () => {
    setup();
    openPanel();
    expect(screen.queryByRole('group', { name: 'Try asking' })).toBeNull();
  });

  it('shows the error bubble and reports to Sentry on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(
      await screen.findByText('Sorry, something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(vi.mocked(Sentry.captureMessage)).toHaveBeenCalledWith(
      'rules chat request failed: HTTP 500',
      expect.objectContaining({ level: 'error', tags: { slug: 'cranium' } }),
    );
  });

  it('shows the error bubble and reports to Sentry when fetch throws', async () => {
    const boom = new Error('network down');
    vi.stubGlobal('fetch', vi.fn(async () => { throw boom; }));
    setup();
    openPanel();
    send('How many players?');

    expect(
      await screen.findByText('Sorry, something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: { slug: 'cranium' } }),
    );
  });

  it('puts a failed question back in the box and retries it without repeating it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce(streamResponse(['Four to eight.']));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, something went wrong. Please try again.');
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many players?');
    // The question comes out of the transcript so a retry doesn't show it twice.
    expect(screen.queryByText('How many players?', { selector: '.rules-chat-bubble' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Four to eight.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('How many players?', { selector: '.rules-chat-bubble' })).toHaveLength(1);
    // The failed attempt never reaches the history sent with the retry.
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.history).toEqual([]);
    expect(retryBody.message).toBe('How many players?');
  });

  it('says to wait on a rate limit, without reporting it as a fault', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many questions just now. Wait a minute, then try again.');
    expect(vi.mocked(Sentry.captureMessage)).not.toHaveBeenCalled();
  });

  it('says the assistant is done for the day when the daily cap answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Daily cap.', code: 'daily-limit' }),
    }) as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toHaveTextContent('The rules assistant has reached its limit for today. The rulebook still works.');
    expect(vi.mocked(Sentry.captureMessage)).not.toHaveBeenCalled();
  });

  it('keeps the per-minute notice for a 429 whose body has no daily code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many requests. Please slow down.' }),
    }) as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many questions just now. Wait a minute, then try again.');
  });

  it('removes a half-streamed answer when the stream fails', async () => {
    const encoder = new TextEncoder();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: () => (calls++ === 0
            ? Promise.resolve({ done: false, value: encoder.encode('Partial ans') })
            : Promise.reject(new Error('connection reset'))),
        }),
      },
    }) as unknown as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Partial ans')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many players?');
  });

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    try {
      // A fetch that only settles when aborted, as a real one does.
      vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })));
      setup();
      openPanel();
      send('How many players?');
      expect(screen.getByText('Thinking...')).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(screen.getByRole('alert')).toHaveTextContent('That took too long to answer. Please try again.');
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Ask a rules question...')).toBeEnabled();
      expect(vi.mocked(Sentry.captureMessage)).toHaveBeenCalledWith(
        'rules chat request timed out',
        expect.objectContaining({ level: 'warning', tags: { slug: 'cranium' } }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting while the answer is still streaming in', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      const chunks = ['One, ', 'two, ', 'three.'];
      let i = 0;
      // Each chunk arrives 20s after the last: slow, but never 30s quiet.
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: () => new Promise((resolve) => {
              setTimeout(() => resolve(i < chunks.length
                ? { done: false, value: encoder.encode(chunks[i++]) }
                : { done: true, value: undefined }), 20_000);
            }),
          }),
        },
      }) as unknown as Response));
      setup();
      openPanel();
      send('Count?');

      await act(async () => { await vi.advanceTimersByTimeAsync(80_000); });
      expect(screen.getByText('One, two, three.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands focus back to the box after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    setup();
    openPanel();
    send('How many players?');
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveFocus());
  });

  it('hands focus back without scrolling, and not when it has gone elsewhere meanwhile', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    let fail = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      fail = () => resolve({ ok: false, status: 500 } as Response);
    })));
    render(
      <>
        <RulesChatProvider>
          <RulesChatToggle />
          <RulesChatPanel slug="cranium" gameName="Cranium" />
        </RulesChatProvider>
        <button type="button">Elsewhere</button>
      </>,
    );
    openPanel();
    send('How many players?');
    // Someone moves on (a citation they tapped puts focus on its page).
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await act(async () => fail());
    await screen.findByRole('alert');
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();

    // Asked from the box, which a browser blurs while it is disabled (focus
    // on the page itself), a failure puts them back in it, where they are.
    send('How many players?');
    screen.getByRole('button', { name: 'Elsewhere' }).blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => fail());
    await waitFor(() => expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveFocus());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    // Focus still in the panel counts as not having moved on.
    screen.getByPlaceholderText('Ask a rules question...').focus();
    focus.mockClear();
    send('How many players?');
    await act(async () => fail());
    await waitFor(() => expect(focus).toHaveBeenCalledWith({ preventScroll: true }));
    focus.mockRestore();
  });

  it('cancels a request quietly when the page goes away', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise<Response>((_, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    const { unmount } = render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="cranium" gameName="Cranium" />
      </RulesChatProvider>,
    );
    openPanel();
    send('How many players?');
    unmount();
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    expect(vi.mocked(Sentry.captureMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
  });
});


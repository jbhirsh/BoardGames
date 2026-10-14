import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import { MemoryRouter } from 'react-router';
import RulesChatProvider, { HISTORY_SENT, RulesChatToggle, RulesChatPanel } from '../components/RulesChat';
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

/**
 * The live region by the box, where the chat says why it can't answer: the
 * one live region for that, so the notice in it isn't one as well.
 */
function statusRegion(): HTMLElement {
  return screen.getByPlaceholderText('Ask a rules question...').closest('form')!.previousElementSibling as HTMLElement;
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

  it('sends only the last HISTORY_SENT messages of a long conversation', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => streamResponse([`Answer ${++n}.`]));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    openPanel();
    for (let q = 1; q <= 5; q++) {
      send(`Question ${q}?`);
      expect(await screen.findByText(`Answer ${q}.`)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByPlaceholderText('Ask a rules question...')).toBeEnabled());
    }
    // Four exchanges before the fifth question: eight messages, the newest kept.
    const body = JSON.parse((fetchMock.mock.calls[4] as unknown as [string, RequestInit])[1].body as string);
    expect(body.history).toHaveLength(HISTORY_SENT);
    expect(body.history.at(-1)).toEqual({ role: 'model', content: 'Answer 4.' });
    expect(body.history[0]).toEqual({ role: 'user', content: `Question ${5 - HISTORY_SENT / 2}?` });
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

  it('hands on each answer once it is whole, with the tab it was asked on', async () => {
    const onAnswer = vi.fn();
    let finish = () => {};
    const rest = new Promise<void>((resolve) => { finish = resolve; });
    let i = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            i++;
            if (i === 1) return { done: false, value: new TextEncoder().encode('Robber moves ') };
            if (i === 2) {
              await rest;
              return { done: false, value: new TextEncoder().encode('(Catan p. 5).') };
            }
            return { done: true, value: undefined };
          },
        }),
      },
    })));
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" tab="cities-and-knights" onAnswer={onAnswer} />
      </RulesChatProvider>,
    );
    openPanel();
    send('A 7?');
    await screen.findByText(/Robber moves/);
    // Not while it is still coming in.
    expect(onAnswer).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('Robber moves (Catan p. 5).', 'cities-and-knights'));
    // Once, however often the panel draws again.
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'And then?' } });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('hands on nothing for a failed question', async () => {
    const onAnswer = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" onAnswer={onAnswer} />
      </RulesChatProvider>,
    );
    openPanel();
    send('A 7?');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
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
    // With the words of the answer each citation closes.
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=4', 'Roll');
    expect(fireEvent.click(nine)).toBe(true);
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=9', 'trade');
    // Opening it in a new tab on purpose is left to the browser, as is any
    // link that isn't a citation.
    onCite.mockClear();
    for (const how of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(fireEvent.click(four, how)).toBe(true);
    }
    expect(fireEvent.click(screen.getByRole('link', { name: 'the FAQ' }))).toBe(true);
    expect(onCite).not.toHaveBeenCalled();
  });

  it('hands over the words a citation closes from its own list item, formatting and all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['Two things:\n\n- Roll **two** dice (p. 3).\n- On a 7, move the robber (p. 4).'])));
    const citeLinks = (answer: string) => answer.replace(/\(p\. (\d)\)/g, '([p. $1](/rules/catan.pdf#page=$1))');
    const onCite = vi.fn(() => true);
    render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="catan" gameName="Catan" citeLinks={citeLinks} isCitation={(href) => href.includes('#page=')} onCite={onCite} />
      </RulesChatProvider>,
    );
    openPanel();
    send('How do turns go?');
    fireEvent.click(await screen.findByRole('link', { name: 'p. 4' }));
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=4', 'On a 7, move the robber');
    fireEvent.click(screen.getByRole('link', { name: 'p. 3' }));
    expect(onCite).toHaveBeenLastCalledWith('/rules/catan.pdf#page=3', 'Roll two dice');
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

  it('reports a fault of ours that is no network\'s doing, though it is a TypeError before any answer', async () => {
    // A 200 with no body to read: the code's fault, not the visitor's network.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: null }) as unknown as Response));
    setup();
    openPanel();
    send('How many players?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, something went wrong. Please try again.');
    expect(statusRegion()).toBeEmptyDOMElement();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({ tags: { slug: 'cranium' } }),
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

  it('says the assistant is resting for the day when the daily cap answers, by the box and not as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Daily cap.', code: 'daily-limit' }),
    }) as Response));
    setup();
    openPanel();
    send('How many players?');

    await waitFor(() => expect(statusRegion()).toHaveTextContent('The assistant is resting for today. The rulebook below still works.'));
    expect(statusRegion().firstElementChild).toHaveClass('notice-info');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Asking again today won't help, so there is no Retry; the question
    // is back in the box, and Send stays for later in the day.
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many players?');
    expect(screen.queryByText('How many players?', { selector: '.rules-chat-bubble' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
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
    // Focus goes back a frame after the answer; frames run only when the
    // test runs them, so focus left alone is known, not waited for.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const runFrames = async () => {
      await waitFor(() => expect(frames).toHaveLength(1));
      act(() => { for (const cb of frames.splice(0)) cb(0); });
    };
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
    await runFrames();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();

    // Asked from the box, which a browser blurs while it is disabled (focus
    // on the page itself), a failure puts them back in it, where they are.
    send('How many players?');
    screen.getByRole('button', { name: 'Elsewhere' }).blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => fail());
    await runFrames();
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    // Focus still in the panel counts as not having moved on.
    screen.getByPlaceholderText('Ask a rules question...').focus();
    focus.mockClear();
    send('How many players?');
    await act(async () => fail());
    await runFrames();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
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

describe('RulesChat when the assistant can\'t answer', () => {
  const OFFLINE = "You're offline — the assistant needs a connection.";
  const STILL_WORKS = ' The rulebook below still works.';

  /** Says the browser is online or not, and tells the page, as the browser does. */
  function goOnline(online: boolean) {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
  }

  type Rulebook = { rulebookFailed?: boolean; rulebookSaved?: boolean | 'asking' };
  const panel = (rulebook: Rulebook) => (
    <RulesChatProvider>
      <RulesChatToggle />
      <RulesChatPanel slug="uno" gameName="UNO" starters={['How do you win?']} {...rulebook} />
    </RulesChatProvider>
  );

  function withStarters(rulebook: Rulebook = {}) {
    const view = render(panel(rulebook));
    openPanel();
    return { rerender: (next: Rulebook) => view.rerender(panel(next)) };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an empty live region by the box until there is something to say', () => {
    setup();
    openPanel();
    expect(statusRegion()).toHaveAttribute('aria-live', 'polite');
    expect(statusRegion()).toBeEmptyDOMElement();
  });

  it('says so offline, and turns off Send and the starters with the reason', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    withStarters();

    expect(statusRegion()).toHaveTextContent(OFFLINE);
    // Said once, by the region: the notice in it is no live region of its own.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(statusRegion().firstElementChild).toHaveClass('notice', 'notice-info');
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'How many cards?' } });
    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAccessibleDescription(OFFLINE);
    const starter = screen.getByRole('button', { name: 'How do you win?' });
    expect(starter).toBeDisabled();
    expect(starter).toHaveAccessibleDescription(OFFLINE);
    // Enter in the box sends nothing either.
    fireEvent.submit(sendButton.closest('form')!);
    expect(fetchMock).not.toHaveBeenCalled();
    // The question typed stays for later; nothing to retry.
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many cards?');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('points to the rulebook offline only when it is saved on this device', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { rerender } = withStarters({ rulebookSaved: true });
    expect(statusRegion()).toHaveTextContent(new RegExp(`^${OFFLINE}${STILL_WORKS}$`));
    expect(screen.getByRole('button', { name: 'How do you win?' })).toHaveAccessibleDescription(OFFLINE + STILL_WORKS);
    // One opened online but not saved can't draw the pages it hasn't fetched.
    rerender({ rulebookSaved: false });
    expect(statusRegion()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
    // Nor one that can't be shown at all, saved or not.
    rerender({ rulebookSaved: true, rulebookFailed: true });
    expect(statusRegion()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
  });

  it('holds a notice about to appear while the page asks whether the rulebook is saved, then says it whole', () => {
    const { rerender } = withStarters({ rulebookSaved: false });
    goOnline(false);
    // The page asks again as the browser goes offline.
    rerender({ rulebookSaved: 'asking' });
    expect(statusRegion()).toBeEmptyDOMElement();
    // Send is off meanwhile all the same.
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    rerender({ rulebookSaved: true });
    expect(statusRegion()).toHaveTextContent(new RegExp(`^${OFFLINE}${STILL_WORKS}$`));
  });

  it('keeps a no-network notice already up as it was while the page asks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { rerender } = withStarters({ rulebookSaved: false });
    fireEvent.click(screen.getByRole('button', { name: 'How do you win?' }));
    const said = () => statusRegion().querySelector('.notice-text');
    await waitFor(() => expect(said()).toHaveTextContent(new RegExp(`^${OFFLINE}$`)));
    goOnline(false);
    rerender({ rulebookSaved: 'asking' });
    expect(said()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
  });

  it('keeps pointing to the rulebook at the cap while the page asks whether it is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ code: 'daily-limit' }) }) as Response));
    withStarters({ rulebookSaved: 'asking' });
    fireEvent.click(screen.getByRole('button', { name: 'How do you win?' }));
    await waitFor(() => expect(statusRegion()).toHaveTextContent('The assistant is resting for today.' + STILL_WORKS));
  });

  it('follows the browser offline and back online', () => {
    withStarters();
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: 'How many cards?' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();

    goOnline(false);
    expect(statusRegion()).toHaveTextContent(OFFLINE);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'How do you win?' })).toBeDisabled();

    goOnline(true);
    expect(statusRegion()).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAccessibleDescription();
    expect(screen.getByRole('button', { name: 'How do you win?' })).toBeEnabled();
  });

  it('moves focus to the box from a button that going offline turns off', () => {
    withStarters();
    const box = screen.getByPlaceholderText('Ask a rules question...');
    fireEvent.change(box, { target: { value: 'How many cards?' } });
    screen.getByRole('button', { name: 'Send' }).focus();
    goOnline(false);
    expect(box).toHaveFocus();

    goOnline(true);
    screen.getByRole('button', { name: 'How do you win?' }).focus();
    goOnline(false);
    expect(box).toHaveFocus();
  });

  it('leaves focus alone when it is elsewhere', () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        {panel({})}
      </>,
    );
    openPanel();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    goOnline(false);
    expect(elsewhere).toHaveFocus();
    // Nor from the box itself, which stays on.
    goOnline(true);
    const box = screen.getByPlaceholderText('Ask a rules question...');
    box.focus();
    goOnline(false);
    expect(box).toHaveFocus();
  });

  it('says the same when a request finds no network though the browser says it has one, with Retry', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(streamResponse(['Seven cards each.']));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    openPanel();
    send('How many cards?');

    await waitFor(() => expect(statusRegion()).toHaveTextContent(OFFLINE));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many cards?');
    // The visitor's connection, not a fault of ours.
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
    // A captive Wi-Fi still says online, so Send stays.
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();

    // Asked as typed, less the spaces around it.
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: ' How many cards? ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Seven cards each.')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).message).toBe('How many cards?');
    expect(statusRegion()).toBeEmptyDOMElement();
    expect(screen.getAllByText('How many cards?', { selector: '.rules-chat-bubble' })).toHaveLength(1);
  });

  it('stops following the browser online and offline once it goes', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <RulesChatProvider>
        <RulesChatToggle />
        <RulesChatPanel slug="uno" gameName="UNO" />
      </RulesChatProvider>,
    );
    openPanel();
    const following = added.mock.calls.filter(([type]) => type === 'online' || type === 'offline');
    expect(following.length).toBeGreaterThan(0);
    unmount();
    // Every listener it set on the window for them is taken off again,
    // however many it uses.
    for (const [type, listener] of following) expect(removed).toHaveBeenCalledWith(type, listener);
  });

  it('offers Retry only with a question in the box to ask', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    setup();
    openPanel();
    send('How many cards?');
    await waitFor(() => expect(statusRegion()).toHaveTextContent(OFFLINE));
    fireEvent.change(screen.getByPlaceholderText('Ask a rules question...'), { target: { value: '  ' } });
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent(OFFLINE);
  });

  it('drops the no-network notice once the browser is back online', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    setup();
    openPanel();
    send('How many cards?');
    await waitFor(() => expect(statusRegion()).toHaveTextContent(OFFLINE));

    // Gone offline, it says so without a Retry that can't work.
    goOnline(false);
    expect(statusRegion()).toHaveTextContent(OFFLINE);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    goOnline(true);
    expect(statusRegion()).toBeEmptyDOMElement();
  });

  it('keeps the cap\'s notice when the browser comes back online', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ code: 'daily-limit' }),
    }) as Response));
    setup();
    openPanel();
    send('How many cards?');
    await waitFor(() => expect(statusRegion()).not.toBeEmptyDOMElement());
    goOnline(true);
    expect(statusRegion()).toHaveTextContent('The assistant is resting for today.');
  });

  it('counts a stream cut off before any of the answer came as no network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: () => Promise.reject(new TypeError('network error')) }) },
    }) as unknown as Response));
    setup();
    openPanel();
    send('How many cards?');

    await waitFor(() => expect(statusRegion()).toHaveTextContent(OFFLINE));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
  });

  it('counts one cut off partway through the answer as a broken answer', async () => {
    const encoder = new TextEncoder();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: () => (calls++ === 0
            ? Promise.resolve({ done: false, value: encoder.encode('Seven') })
            : Promise.reject(new TypeError('network error'))),
        }),
      },
    }) as unknown as Response));
    setup();
    openPanel();
    send('How many cards?');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, something went wrong. Please try again.');
    expect(statusRegion()).toBeEmptyDOMElement();
  });

  it('puts any failure of the request down to the network once the browser says it is offline', async () => {
    let fail = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_, reject) => {
      fail = () => reject(new Error('net::ERR_INTERNET_DISCONNECTED'));
    })));
    setup();
    openPanel();
    send('How many cards?');
    goOnline(false);
    await act(async () => fail());

    expect(statusRegion()).toHaveTextContent(OFFLINE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask a rules question...')).toHaveValue('How many cards?');
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
  });

  it('turns off an error\'s Retry while offline, and says why', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    setup();
    openPanel();
    send('How many cards?');
    await screen.findByRole('alert');
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeEnabled();
    expect(retry).not.toHaveAccessibleDescription();
    goOnline(false);
    expect(retry).toBeDisabled();
    expect(retry).toHaveAccessibleDescription(OFFLINE);
    // One notice by the box; the error stays where it was said.
    expect(statusRegion().children).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Sorry, something went wrong.');
  });

  it('doesn\'t point to the rulebook when it can\'t be shown either', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    withStarters({ rulebookFailed: true });
    expect(statusRegion()).toHaveTextContent(new RegExp(`^${OFFLINE}$`));
  });
});

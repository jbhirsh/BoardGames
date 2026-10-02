import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from '../components/RulesChat';

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
});

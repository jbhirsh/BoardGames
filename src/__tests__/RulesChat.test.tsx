import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from '../components/RulesChat';

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) })
            : Promise.resolve({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

function setup() {
  render(
    <RulesChatProvider>
      <RulesChatToggle />
      <RulesChatPanel slug="cranium" gameName="Cranium" />
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

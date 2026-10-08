import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  askRulesAssistant,
  buildContents,
  loadRulesText,
  streamRulesAnswer,
  RULES_ASSISTANT_MODEL,
  RULES_ASSISTANT_SYSTEM_INSTRUCTION,
  RULES_ASSISTANT_MAX_OUTPUT_TOKENS,
  rulebookHeader,
  firstRulebookHeader,
  otherRulebooks,
  otherRulebooksNote,
} from '../../api/_lib/rulesAssistant';

const mocks = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
  constructorCalls: [] as unknown[],
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream: mocks.generateContentStream };
    constructor(options: unknown) {
      mocks.constructorCalls.push(options);
    }
  },
}));

async function* fakeStream(...texts: Array<string | undefined>) {
  for (const text of texts) {
    yield { text };
  }
}

function lastRequest() {
  return mocks.generateContentStream.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constructorCalls.length = 0;
});

describe('buildContents', () => {
  it('puts the rules text first, maps history in order with roles, and appends the message last', () => {
    const contents = buildContents(
      'RULES TEXT',
      [
        { role: 'user', content: 'first question' },
        { role: 'model', content: 'first answer' },
      ],
      'second question',
    );
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Here are the complete rules for the game:\n\nRULES TEXT' }] },
      { role: 'user', parts: [{ text: 'first question' }] },
      { role: 'model', parts: [{ text: 'first answer' }] },
      { role: 'user', parts: [{ text: 'second question' }] },
    ]);
  });

  it('builds just rules text plus message when history is undefined', () => {
    const contents = buildContents('RULES TEXT', undefined, 'the question');
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Here are the complete rules for the game:\n\nRULES TEXT' }] },
      { role: 'user', parts: [{ text: 'the question' }] },
    ]);
  });
});

describe('loadRulesText', () => {
  it('reads rules-text/<slug>.txt relative to the working directory', () => {
    const text = loadRulesText('uno');
    expect(text).toBe(readFileSync(join(process.cwd(), 'rules-text', 'uno.txt'), 'utf-8'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('throws when no rules text exists for the slug', () => {
    expect(() => loadRulesText('no-such-game')).toThrow(/ENOENT/);
  });

  it('follows a game\'s own rules with the named games inside it, in the order asked', () => {
    const root = mkdtempSync(join(tmpdir(), 'rules-'));
    mkdirSync(join(root, 'rules-text'));
    const files: Record<string, string> = {
      'deck.txt': 'DECK',
      'deck.speed.txt': 'SPEED',
      'deck.euchre.txt': 'EUCHRE',
      // A different game that shares the prefix, and a stray non-text file.
      'deck-builder.txt': 'OTHER GAME',
      'deck.notes.md': 'NOT RULES',
    };
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'rules-text', name), text);
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      expect(loadRulesText('deck')).toBe('DECK');
      // The game's own rulebook is named only when another follows it.
      expect(loadRulesText('deck', ['speed', 'euchre'])).toBe(`${firstRulebookHeader('deck')}DECK${rulebookHeader('speed')}SPEED${rulebookHeader('euchre')}EUCHRE`);
      // A part with no file (a stale page) is skipped, not an error.
      expect(loadRulesText('deck', ['euchre', 'mahjong'])).toBe(`${firstRulebookHeader('deck')}DECK${rulebookHeader('euchre')}EUCHRE`);
      expect(loadRulesText('deck', ['mahjong'])).toBe('DECK');
      expect(loadRulesText('deck-builder')).toBe('OTHER GAME');
      expect(() => loadRulesText('deck', ['../deck-builder'])).not.toThrow();
      expect(loadRulesText('deck', ['../deck-builder'])).toBe('DECK');
    } finally {
      cwd.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the real Card Deck\'s game rulebooks when asked', () => {
    const parts = ['euchre', 'spades', 'hearts', 'crazy-eights', 'rummy', 'president', 'spoons', 'egyptian-ratscrew', 'speed', 'golf', 'go-fish', 'klondike'];
    const text = loadRulesText('card-deck', parts);
    expect(text.startsWith(firstRulebookHeader('card-deck') + readFileSync(join(process.cwd(), 'rules-text', 'card-deck.txt'), 'utf-8'))).toBe(true);
    expect(text).toContain(readFileSync(join(process.cwd(), 'rules-text', 'card-deck.euchre.txt'), 'utf-8'));
    expect(text.split('=== Next rulebook:')).toHaveLength(13);
  });

  it('names each rulebook in its header and says how it relates to the game\'s own', () => {
    expect(rulebookHeader('cities-and-knights')).toBe(
      '\n\n=== Next rulebook: Cities And Knights. It goes with the game above; where it differs, say which rulebook a rule comes from. ===\n\n',
    );
    expect(rulebookHeader('5-6-player-extension')).toContain('Next rulebook: 5 6 Player Extension.');
    // The game's own, by the name a citation of it uses.
    expect(firstRulebookHeader('ticket-to-ride')).toBe('=== First rulebook: Ticket To Ride. ===\n\n');
  });
});

describe('otherRulebooks', () => {
  it('lists the game\'s rulebooks the assistant is not reading, from the directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'rules-'));
    mkdirSync(join(root, 'rules-text'));
    for (const name of ['deck.txt', 'deck.speed.txt', 'deck.euchre.txt', 'deck-builder.txt', 'deck-builder.x.txt', 'deck.notes.md']) {
      writeFileSync(join(root, 'rules-text', name), 'x');
    }
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      expect(otherRulebooks('deck')).toEqual(['euchre', 'speed']);
      expect(otherRulebooks('deck', ['speed'])).toEqual(['euchre']);
      expect(otherRulebooks('deck', ['speed', 'euchre'])).toEqual([]);
      expect(otherRulebooks('deck-builder')).toEqual(['x']);
    } finally {
      cwd.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds Catan\'s add-ons beside its own rules', () => {
    expect(otherRulebooks('catan')).toEqual(['5-6-player-extension', 'cities-and-knights']);
    expect(otherRulebooks('catan', ['cities-and-knights'])).toEqual(['5-6-player-extension']);
    expect(otherRulebooks('uno')).toEqual([]);
  });
});

describe('otherRulebooksNote', () => {
  it('names the rulebooks left out and asks the assistant to point to them', () => {
    expect(otherRulebooksNote([])).toBe('');
    const one = otherRulebooksNote(['5-6-player-extension']);
    expect(one).toContain("this game's other rulebook, 5 6 Player Extension.");
    expect(one).toContain('say which rulebook covers it');
    expect(otherRulebooksNote(['a-b', 'c', 'd'])).toContain("other rulebooks, A B, C and D.");
  });
});

describe('streamRulesAnswer', () => {
  it('sends the production payload: api key, model, system instruction, and contents', async () => {
    const stream = fakeStream('hi');
    mocks.generateContentStream.mockResolvedValue(stream);

    const result = await streamRulesAnswer({
      rulesText: 'RULES TEXT',
      message: 'the question',
      history: [{ role: 'user', content: 'earlier' }],
      apiKey: 'test-key',
    });

    expect(mocks.constructorCalls).toEqual([{ apiKey: 'test-key' }]);
    expect(result).toBe(stream);
    const request = lastRequest();
    expect(request.model).toBe(RULES_ASSISTANT_MODEL);
    expect(request.config.systemInstruction).toBe(RULES_ASSISTANT_SYSTEM_INSTRUCTION);
    expect(request.contents).toEqual(
      buildContents('RULES TEXT', [{ role: 'user', content: 'earlier' }], 'the question'),
    );
  });

  it('caps output tokens by default and omits temperature when not provided', async () => {
    mocks.generateContentStream.mockResolvedValue(fakeStream());
    await streamRulesAnswer({ rulesText: 'RULES TEXT', message: 'q', apiKey: 'test-key' });
    const request = lastRequest();
    expect(request.config.maxOutputTokens).toBe(RULES_ASSISTANT_MAX_OUTPUT_TOKENS);
    expect('temperature' in request.config).toBe(false);
  });

  it('forwards temperature 0 and an explicit maxOutputTokens when provided', async () => {
    mocks.generateContentStream.mockResolvedValue(fakeStream());
    await streamRulesAnswer({
      rulesText: 'RULES TEXT',
      message: 'q',
      apiKey: 'test-key',
      temperature: 0,
      maxOutputTokens: 256,
    });
    expect(lastRequest().config).toEqual({
      systemInstruction: RULES_ASSISTANT_SYSTEM_INSTRUCTION,
      maxOutputTokens: 256,
      temperature: 0,
    });
  });
});

describe('askRulesAssistant', () => {
  it('loads the rules text, streams at the given temperature, and concatenates chunk text', async () => {
    mocks.generateContentStream.mockResolvedValue(fakeStream('Seven ', undefined, 'cards', '', '.'));

    const answer = await askRulesAssistant({
      slug: 'uno',
      message: 'How many cards is each player dealt?',
      apiKey: 'test-key',
      temperature: 0,
    });

    expect(answer).toBe('Seven cards.');
    const request = lastRequest();
    expect(request.model).toBe(RULES_ASSISTANT_MODEL);
    expect(request.config.temperature).toBe(0);
    const grounding = request.contents[0].parts[0].text;
    expect(grounding).toBe(
      'Here are the complete rules for the game:\n\n' + loadRulesText('uno'),
    );
    expect(request.contents.at(-1)).toEqual({
      role: 'user',
      parts: [{ text: 'How many cards is each player dealt?' }],
    });
  });

  it('reads the named parts with the game\'s own rules', async () => {
    mocks.generateContentStream.mockResolvedValue(fakeStream('Three.'));
    await askRulesAssistant({ slug: 'ticket-to-ride', parts: ['europe'], message: 'Stations?', apiKey: 'k', temperature: 0 });
    expect(lastRequest().contents[0].parts[0].text).toBe(
      'Here are the complete rules for the game:\n\n' + loadRulesText('ticket-to-ride', ['europe']),
    );
    expect(loadRulesText('ticket-to-ride', ['europe'])).toContain(rulebookHeader('europe'));
  });

  it('names the rulebooks it was not given after the ones it reads', async () => {
    mocks.generateContentStream.mockResolvedValue(fakeStream('Use the extension.'));
    await askRulesAssistant({ slug: 'catan', message: 'Five players?', apiKey: 'k', temperature: 0 });
    expect(lastRequest().contents[0].parts[0].text).toBe(
      'Here are the complete rules for the game:\n\n' + loadRulesText('catan') +
        otherRulebooksNote(['5-6-player-extension', 'cities-and-knights']),
    );
  });

  it('propagates a missing-rules error before any Gemini call', async () => {
    await expect(
      askRulesAssistant({ slug: 'no-such-game', message: 'q', apiKey: 'test-key' }),
    ).rejects.toThrow(/ENOENT/);
    expect(mocks.generateContentStream).not.toHaveBeenCalled();
  });
});

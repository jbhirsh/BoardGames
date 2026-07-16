import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  askRulesAssistant,
  buildContents,
  loadRulesText,
  streamRulesAnswer,
  RULES_ASSISTANT_MODEL,
  RULES_ASSISTANT_SYSTEM_INSTRUCTION,
  RULES_ASSISTANT_MAX_OUTPUT_TOKENS,
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

  it('propagates a missing-rules error before any Gemini call', async () => {
    await expect(
      askRulesAssistant({ slug: 'no-such-game', message: 'q', apiKey: 'test-key' }),
    ).rejects.toThrow(/ENOENT/);
    expect(mocks.generateContentStream).not.toHaveBeenCalled();
  });
});

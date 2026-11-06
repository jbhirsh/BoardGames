// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { askRulesAssistant, RULES_ASSISTANT_MODEL } from '../../api/_lib/rulesAssistant.ts';
import type { GoldenEntry } from '../../eval/grading.ts';
import { main, run } from '../../eval/run-eval.ts';

const generateContent = vi.hoisted(() => vi.fn<(request: unknown) => Promise<{ text?: string }>>());

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock('../../api/_lib/rulesAssistant.ts', () => ({
  RULES_ASSISTANT_MODEL: 'test-model',
  askRulesAssistant: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const RESULTS_PATH = fileURLToPath(new URL('../../eval/results.json', import.meta.url));
const ENV_PATH = resolve(process.cwd(), '.env.local');

const entry = (over: Partial<GoldenEntry> & Pick<GoldenEntry, 'id' | 'matchType' | 'expected'>): GoldenEntry => ({
  game: 'azul',
  question: `question for ${over.id}?`,
  sourceQuote: '',
  ...over,
});

const ENTRIES = [
  entry({ id: 'exact-one', matchType: 'exact', expected: 'Five' }),
  entry({
    id: 'contains-one',
    matchType: 'contains',
    expected: 'seven points',
    game: 'ticket-to-ride',
    parts: ['europe'],
  }),
  entry({ id: 'judge-one', matchType: 'judge', expected: 'the first player', notes: 'any wording' }),
  entry({ id: 'regex-one', matchType: 'regex', expected: '\\b(3|three)\\b' }),
];

/** The assistant's answer to each entry, by id (a string, or an error it throws), as each test starts. */
const ANSWERS: Readonly<Record<string, string | Error>> = {
  'exact-one': 'five (p. 2)',
  'contains-one': 'You score seven points.',
  'judge-one': 'Whoever went first.',
  'regex-one': 'Four.',
};

/** The files there are: .env.local's text (when given) and each golden set's, by path. */
function files(golden: Record<string, string>, envLocal?: string) {
  vi.mocked(existsSync).mockImplementation((path) => path === ENV_PATH && envLocal !== undefined);
  vi.mocked(readFileSync).mockImplementation((path) => {
    if (path === ENV_PATH && envLocal !== undefined) return envLocal;
    const text = golden[String(path)];
    if (text === undefined) throw new Error(`ENOENT: no such file, open '${String(path)}'`);
    return text;
  });
}

const goldenJson = (entries: GoldenEntry[]) => JSON.stringify({ status: 'verified', entries });
const DEFAULT_GOLDEN = resolve(process.cwd(), 'eval/golden-set.json');

interface Report {
  generatedAt: string;
  goldenFile: string;
  model: string;
  summary: { total: number; passed: number; failed: number; passRate: number; threshold: number; ok: boolean };
  results: { id: string; answer: string; passed: boolean; reason: string; game: string; matchType: string }[];
}

/** The report main wrote to eval/results.json. */
function writtenReport(): Report {
  expect(writeFileSync).toHaveBeenCalledTimes(1);
  const [path, text] = vi.mocked(writeFileSync).mock.calls[0];
  expect(path).toBe(RESULTS_PATH);
  expect(String(text).endsWith('}\n')).toBe(true);
  return JSON.parse(String(text)) as Report;
}

let answers: Record<string, string | Error>;
let log: MockInstance<typeof console.log>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'key-from-env');
  answers = { ...ANSWERS };
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.mocked(askRulesAssistant).mockImplementation(({ message }) => {
    const found = ENTRIES.find((e) => e.question === message);
    const answer = found ? answers[found.id] : new Error('unknown question');
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  generateContent.mockResolvedValue({ text: 'PASS: same meaning' });
  files({ [DEFAULT_GOLDEN]: goldenJson(ENTRIES) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(writeFileSync).mockReset();
  generateContent.mockReset();
  process.exitCode = undefined;
});

describe('main', () => {
  it('asks every entry at temperature 0, grades it, and writes the report', async () => {
    // 3 of 4 pass: 0.75 meets a 0.75 threshold.
    expect(await main(['--threshold', '0.75'])).toBe(0);

    expect(vi.mocked(askRulesAssistant).mock.calls.map(([options]) => options)).toEqual([
      { slug: 'azul', parts: undefined, message: 'question for exact-one?', apiKey: 'key-from-env', temperature: 0 },
      {
        slug: 'ticket-to-ride',
        parts: ['europe'],
        message: 'question for contains-one?',
        apiKey: 'key-from-env',
        temperature: 0,
      },
      { slug: 'azul', parts: undefined, message: 'question for judge-one?', apiKey: 'key-from-env', temperature: 0 },
      { slug: 'azul', parts: undefined, message: 'question for regex-one?', apiKey: 'key-from-env', temperature: 0 },
    ]);
    // Only the judge entry gets the second call, at temperature 0, with the answer to judge.
    expect(generateContent).toHaveBeenCalledTimes(1);
    const request = generateContent.mock.calls[0][0] as { model: string; contents: string; config: unknown };
    expect(request.model).toBe(RULES_ASSISTANT_MODEL);
    expect(request.config).toEqual({ temperature: 0 });
    expect(request.contents).toContain('Whoever went first.');
    expect(request.contents).toContain('the first player');

    const report = writtenReport();
    expect(report.goldenFile).toBe('eval/golden-set.json');
    expect(report.model).toBe('test-model');
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
    expect(report.summary).toEqual({ total: 4, passed: 3, failed: 1, passRate: 0.75, threshold: 0.75, ok: true });
    expect(report.results.map(({ id, answer, passed }) => [id, answer, passed])).toEqual([
      ['exact-one', 'five (p. 2)', true],
      ['contains-one', 'You score seven points.', true],
      ['judge-one', 'Whoever went first.', true],
      ['regex-one', 'Four.', false],
    ]);
    expect(report.results[2].reason).toBe('judge: same meaning');
    expect(log).toHaveBeenCalledWith(`\nResults written to ${RESULTS_PATH}`);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('3/4 passed (75.0%)'));
  });

  it('fails when the pass rate is below the default threshold of 0.9, still writing the report', async () => {
    expect(await main([])).toBe(1);

    expect(writtenReport().summary).toMatchObject({ passRate: 0.75, threshold: 0.9, ok: false });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
  });

  it('passes at the default threshold when every answer passes', async () => {
    answers['regex-one'] = 'Three.';

    expect(await main([])).toBe(0);

    expect(writtenReport().summary).toMatchObject({ passed: 4, ok: true });
  });

  it('fails an entry the assistant or the judge errors on, and carries on with the rest', async () => {
    answers['exact-one'] = new Error('quota exceeded');
    generateContent.mockRejectedValue(new Error('judge down'));

    expect(await main(['--threshold', '0'])).toBe(0);

    const results = writtenReport().results;
    expect(results[0]).toMatchObject({ answer: '', passed: false, reason: 'error: quota exceeded' });
    // The judge failing keeps the answer it was asked about.
    expect(results[2]).toMatchObject({ answer: 'Whoever went first.', passed: false, reason: 'error: judge down' });
    expect(results).toHaveLength(4);
  });

  it('reads a judge reply with no text as an unparseable verdict', async () => {
    generateContent.mockResolvedValue({});

    await main(['--threshold', '0']);

    expect(writtenReport().results[2]).toMatchObject({ passed: false });
    expect(writtenReport().results[2].reason).toContain('could not parse judge verdict');
  });

  it('reads the golden set --file names, from the current directory, and records it', async () => {
    const one = [entry({ id: 'exact-one', matchType: 'exact', expected: 'Five' })];
    files({ [resolve(process.cwd(), 'tmp/smoke.json')]: goldenJson(one) });

    expect(await main(['--file', 'tmp/smoke.json', '--threshold', '1'])).toBe(0);

    expect(askRulesAssistant).toHaveBeenCalledTimes(1);
    expect(writtenReport()).toMatchObject({ goldenFile: 'tmp/smoke.json', summary: { total: 1, threshold: 1 } });
  });

  it('fails an empty golden set, which never passes', async () => {
    files({ [DEFAULT_GOLDEN]: goldenJson([]) });

    expect(await main(['--threshold', '0'])).toBe(1);
    expect(writtenReport().summary).toMatchObject({ total: 0, ok: false });
  });

  it('fails before calling anything when GEMINI_API_KEY is not set anywhere', async () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);

    expect(await main([])).toBe(1);

    expect(error).toHaveBeenCalledWith(
      'GEMINI_API_KEY is not set. Export it or add it to .env.local at the repo root.',
    );
    expect(askRulesAssistant).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('takes the key from .env.local when the environment has none', async () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    files({ [DEFAULT_GOLDEN]: goldenJson(ENTRIES) }, 'GEMINI_API_KEY=key-from-file\n');

    await main([]);

    expect(vi.mocked(askRulesAssistant).mock.calls[0][0].apiKey).toBe('key-from-file');
  });

  it("never lets .env.local override the environment's own value", async () => {
    files({ [DEFAULT_GOLDEN]: goldenJson(ENTRIES) }, 'GEMINI_API_KEY=key-from-file\n');

    await main([]);

    expect(vi.mocked(askRulesAssistant).mock.calls[0][0].apiKey).toBe('key-from-env');
  });

  it('fails, naming the file, when the golden set is missing or invalid', async () => {
    files({});
    expect(await main([])).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to load golden set from ${DEFAULT_GOLDEN}: ENOENT`),
    );

    files({ [DEFAULT_GOLDEN]: JSON.stringify({ status: 'draft' }) });
    expect(await main([])).toBe(1);
    expect(error).toHaveBeenCalledWith(
      `Failed to load golden set from ${DEFAULT_GOLDEN}: golden set "entries" must be an array`,
    );
    expect(askRulesAssistant).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

describe('run', () => {
  it("sets the exit code to the eval's", async () => {
    await run(['--threshold', '0.75']);
    expect(process.exitCode).toBe(0);

    await run([]);
    expect(process.exitCode).toBe(1);
  });

  it('prints the error and exits 1 when the arguments are bad', async () => {
    await run(['--threshold', 'high']);

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('between 0 and 1'));
    expect(askRulesAssistant).not.toHaveBeenCalled();
  });

  it('prints a thrown non-Error as it is', async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw 'disk full';
    });

    await run(['--threshold', '0']);

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('disk full');
  });
});

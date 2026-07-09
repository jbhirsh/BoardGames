import { describe, it, expect } from 'vitest';
import {
  buildJudgePrompt,
  formatScorecard,
  gradeAnswer,
  gradeContains,
  gradeExact,
  gradeRegex,
  normalizeText,
  parseGoldenSet,
  parseJudgeVerdict,
  summarize,
  truncate,
  type EntryResult,
  type GoldenEntry,
} from '../../eval/grading';

function makeEntry(overrides: Partial<GoldenEntry> = {}): GoldenEntry {
  return {
    id: 'uno-draw-count',
    game: 'uno',
    question: 'How many cards are dealt to each player?',
    expected: '7 cards',
    matchType: 'contains',
    sourceQuote: 'Each player is dealt 7 cards.',
    ...overrides,
  };
}

function makeResult(overrides: Partial<EntryResult> = {}): EntryResult {
  return {
    id: 'uno-draw-count',
    game: 'uno',
    question: 'How many cards are dealt to each player?',
    expected: '7 cards',
    matchType: 'contains',
    answer: 'Each player is dealt 7 cards.',
    passed: true,
    reason: 'answer contains expected text',
    ...overrides,
  };
}

describe('normalizeText', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  seven cards  ')).toBe('seven cards');
  });

  it('collapses internal whitespace runs, including newlines and tabs', () => {
    expect(normalizeText('seven\n\t  cards\r\n dealt')).toBe('seven cards dealt');
  });

  it('lowercases', () => {
    expect(normalizeText('Seven CARDS')).toBe('seven cards');
  });
});

describe('gradeExact', () => {
  it('passes when only case and whitespace differ', () => {
    expect(gradeExact('7 cards', '  7   CARDS\n')).toBe(true);
  });

  it('fails when the words differ', () => {
    expect(gradeExact('7 cards', '8 cards')).toBe(false);
  });

  it('fails when the answer merely contains the expected text', () => {
    expect(gradeExact('7 cards', 'Each player gets 7 cards.')).toBe(false);
  });
});

describe('gradeContains', () => {
  it('finds the expected text case-insensitively', () => {
    expect(gradeContains('7 Cards', 'each player is dealt 7 cards to start')).toBe(true);
  });

  it('matches across differing internal whitespace', () => {
    expect(gradeContains('7 cards', 'You get 7\n  cards at the start.')).toBe(true);
  });

  it('fails when the expected text is absent', () => {
    expect(gradeContains('7 cards', 'Each player receives five tokens.')).toBe(false);
  });
});

describe('gradeRegex', () => {
  it('matches the pattern against the answer', () => {
    expect(gradeRegex('\\b7 (cards|tiles)\\b', 'Deal 7 cards to each player')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(gradeRegex('seven cards', 'SEVEN CARDS each')).toBe(true);
  });

  it('fails when the pattern does not match', () => {
    expect(gradeRegex('\\b9 cards\\b', 'Deal 7 cards to each player')).toBe(false);
  });

  it('throws on an invalid pattern so the runner can report it', () => {
    expect(() => gradeRegex('(unclosed', 'anything')).toThrow();
  });
});

describe('parseJudgeVerdict', () => {
  it('parses a PASS verdict with a reason', () => {
    expect(parseJudgeVerdict('PASS — the response states the 7-card deal.')).toEqual({
      verdict: 'PASS',
      reason: 'the response states the 7-card deal.',
    });
  });

  it('parses a FAIL verdict with a colon-separated reason', () => {
    expect(parseJudgeVerdict('FAIL: the response says 8 cards.')).toEqual({
      verdict: 'FAIL',
      reason: 'the response says 8 cards.',
    });
  });

  it('is case-insensitive about the verdict token', () => {
    expect(parseJudgeVerdict('pass - looks correct').verdict).toBe('PASS');
  });

  it('finds a verdict embedded in surrounding prose or markdown', () => {
    expect(parseJudgeVerdict('**PASS** — correct.').verdict).toBe('PASS');
    expect(parseJudgeVerdict('Verdict: FAIL. Missing the penalty.').verdict).toBe('FAIL');
  });

  it('uses the first verdict token when both appear', () => {
    expect(parseJudgeVerdict('FAIL. It would only PASS if it named the penalty.').verdict).toBe(
      'FAIL',
    );
  });

  it('does not match PASS inside a longer word', () => {
    const verdict = parseJudgeVerdict('The response PASSES no judgment.');
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.reason).toContain('could not parse judge verdict');
  });

  it('fails closed when no verdict is present', () => {
    const verdict = parseJudgeVerdict('The response is mostly right, I suppose.');
    expect(verdict.verdict).toBe('FAIL');
    expect(verdict.reason).toContain('could not parse judge verdict');
  });

  it('falls back to the raw reply when nothing follows the token', () => {
    expect(parseJudgeVerdict('PASS')).toEqual({ verdict: 'PASS', reason: 'PASS' });
  });
});

describe('buildJudgePrompt', () => {
  it('frames expected as a reference answer and embeds question, reference, and response', () => {
    const prompt = buildJudgePrompt(
      'How many cards?',
      'Each player is dealt 7 cards.',
      'You are dealt 7 cards.',
    );
    expect(prompt).toContain('Question asked to the assistant: How many cards?');
    expect(prompt).toContain('Reference answer:');
    expect(prompt).toContain('Each player is dealt 7 cards.');
    expect(prompt).toContain('You are dealt 7 cards.');
    expect(prompt).toContain('does not need to repeat every detail');
    expect(prompt).toContain('contradicts the reference answer');
    expect(prompt).not.toContain('Expected fact');
  });

  it('keeps the strict verdict contract', () => {
    const prompt = buildJudgePrompt('q', 'ref', 'ans');
    expect(prompt).toContain('Answer PASS or FAIL with a one-line reason.');
    expect(prompt).toContain('Start your reply with exactly PASS or FAIL.');
  });

  it('includes notes as accept-but-not-require guidance when present', () => {
    const prompt = buildJudgePrompt('q', 'ref', 'ans', 'Mentioning house-rule variants is fine.');
    expect(prompt).toContain('Grading guidance');
    expect(prompt).toContain('Mentioning house-rule variants is fine.');
    expect(prompt).toContain('but not required');
  });

  it('omits the guidance section when notes is absent, empty, or blank', () => {
    expect(buildJudgePrompt('q', 'ref', 'ans')).not.toContain('Grading guidance');
    expect(buildJudgePrompt('q', 'ref', 'ans', '')).not.toContain('Grading guidance');
    expect(buildJudgePrompt('q', 'ref', 'ans', '   ')).not.toContain('Grading guidance');
  });
});

describe('gradeAnswer', () => {
  it('dispatches exact grading', () => {
    const entry = makeEntry({ matchType: 'exact', expected: '7 cards' });
    expect(gradeAnswer(entry, ' 7 CARDS ').passed).toBe(true);
    expect(gradeAnswer(entry, 'You get 7 cards.').passed).toBe(false);
  });

  it('dispatches contains grading', () => {
    const entry = makeEntry({ matchType: 'contains', expected: '7 cards' });
    expect(gradeAnswer(entry, 'Each player is dealt 7 cards.').passed).toBe(true);
    expect(gradeAnswer(entry, 'Each player is dealt tiles.').passed).toBe(false);
  });

  it('dispatches regex grading', () => {
    const entry = makeEntry({ matchType: 'regex', expected: '\\b7 cards\\b' });
    expect(gradeAnswer(entry, 'deal 7 cards each').passed).toBe(true);
    expect(gradeAnswer(entry, 'deal 17 cardstock sheets').passed).toBe(false);
  });

  it('grades judge entries from the judge reply', () => {
    const entry = makeEntry({ matchType: 'judge' });
    const passed = gradeAnswer(entry, 'whatever', 'PASS — states the rule.');
    expect(passed.passed).toBe(true);
    expect(passed.reason).toBe('judge: states the rule.');
    expect(gradeAnswer(entry, 'whatever', 'FAIL: wrong count.').passed).toBe(false);
  });

  it('fails a judge entry when no judge reply is provided', () => {
    const graded = gradeAnswer(makeEntry({ matchType: 'judge' }), 'whatever');
    expect(graded.passed).toBe(false);
    expect(graded.reason).toBe('no judge reply was provided');
  });
});

describe('parseGoldenSet', () => {
  const validEntry = {
    id: 'uno-draw-count',
    game: 'uno',
    question: 'How many cards are dealt?',
    expected: '7 cards',
    matchType: 'contains',
    sourceQuote: 'Each player is dealt 7 cards.',
  };

  it('accepts a valid golden set and preserves fields', () => {
    const parsed = parseGoldenSet({
      status: 'ready',
      entries: [{ ...validEntry, notes: 'boundary case' }],
    });
    expect(parsed.status).toBe('ready');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual({ ...validEntry, notes: 'boundary case' });
  });

  it('accepts entries without the optional notes field', () => {
    const parsed = parseGoldenSet({ status: 'ready', entries: [validEntry] });
    expect(parsed.entries[0].notes).toBeUndefined();
  });

  it('accepts an empty sourceQuote (UNANSWERABLE entries have no quote to cite)', () => {
    const unanswerable = {
      ...validEntry,
      id: 'uno-unanswerable',
      question: 'What is the tournament ruling on misdeals?',
      expected: 'The rules do not cover this.',
      matchType: 'judge',
      sourceQuote: '',
      notes: 'Searched the rules text for misdeal/tournament; absent.',
    };
    const parsed = parseGoldenSet({ status: 'ready', entries: [unanswerable] });
    expect(parsed.entries[0].sourceQuote).toBe('');
  });

  it('rejects a missing or non-string sourceQuote', () => {
    expect(() =>
      parseGoldenSet({ status: 'ready', entries: [{ ...validEntry, sourceQuote: undefined }] }),
    ).toThrow('"sourceQuote" must be a string');
    expect(() =>
      parseGoldenSet({ status: 'ready', entries: [{ ...validEntry, sourceQuote: 7 }] }),
    ).toThrow('"sourceQuote" must be a string');
  });

  it('rejects non-object roots', () => {
    expect(() => parseGoldenSet([])).toThrow('must be a JSON object');
    expect(() => parseGoldenSet('nope')).toThrow('must be a JSON object');
  });

  it('rejects a missing or non-string status', () => {
    expect(() => parseGoldenSet({ entries: [] })).toThrow('"status" must be a string');
  });

  it('rejects a missing entries array', () => {
    expect(() => parseGoldenSet({ status: 'ready' })).toThrow('"entries" must be an array');
  });

  it('rejects non-object entries', () => {
    expect(() => parseGoldenSet({ status: 'ready', entries: ['x'] })).toThrow(
      'entry 0 must be an object',
    );
  });

  it('rejects an unknown matchType', () => {
    expect(() =>
      parseGoldenSet({ status: 'ready', entries: [{ ...validEntry, matchType: 'fuzzy' }] }),
    ).toThrow('matchType "fuzzy"');
  });

  it('rejects a missing required string field, naming it', () => {
    const withoutQuestion = { ...validEntry, question: undefined };
    expect(() => parseGoldenSet({ status: 'ready', entries: [withoutQuestion] })).toThrow(
      '"question" must be a non-empty string',
    );
  });

  it('rejects an empty string in a required field', () => {
    expect(() => parseGoldenSet({ status: 'ready', entries: [{ ...validEntry, id: '  ' }] })).toThrow(
      '"id" must be a non-empty string',
    );
  });

  it('rejects non-string notes', () => {
    expect(() =>
      parseGoldenSet({ status: 'ready', entries: [{ ...validEntry, notes: 42 }] }),
    ).toThrow('"notes" must be a string');
  });
});

describe('summarize', () => {
  const passing = makeResult({ passed: true });
  const failing = makeResult({ id: 'uno-uno-penalty', passed: false });

  it('counts totals, passes, and failures', () => {
    const summary = summarize([passing, passing, failing], 0.9);
    expect(summary).toMatchObject({ total: 3, passed: 2, failed: 1 });
    expect(summary.passRate).toBeCloseTo(2 / 3);
  });

  it('passes when the pass rate meets the threshold exactly', () => {
    const results = [passing, passing, passing, passing, passing, passing, passing, passing, passing, failing];
    expect(summarize(results, 0.9).ok).toBe(true);
  });

  it('fails when the pass rate is below the threshold', () => {
    expect(summarize([passing, failing], 0.9).ok).toBe(false);
  });

  it('never passes an empty run', () => {
    const summary = summarize([], 0);
    expect(summary.ok).toBe(false);
    expect(summary.passRate).toBe(0);
  });
});

describe('truncate', () => {
  it('returns short text unchanged', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('cuts long text to the limit with an ellipsis', () => {
    const cut = truncate('a'.repeat(50), 10);
    expect(cut).toHaveLength(10);
    expect(cut.endsWith('…')).toBe(true);
  });
});

describe('formatScorecard', () => {
  it('prints the "passed" headline with percentages and overall verdict', () => {
    const results = [
      ...Array.from({ length: 23 }, (_, i) => makeResult({ id: `q-${i}` })),
      makeResult({ id: 'f-1', passed: false }),
      makeResult({ id: 'f-2', passed: false }),
    ];
    const card = formatScorecard(summarize(results, 0.9), results);
    expect(card).toContain('23/25 passed (92.0%)');
    expect(card).toContain('threshold 90.0%');
    expect(card.split('\n')[0]).toContain('PASS');
  });

  it('lists each failure with id, question, expected, got, and reason', () => {
    const failure = makeResult({
      id: 'uno-uno-penalty',
      passed: false,
      question: 'What is the penalty for not saying UNO?',
      expected: 'draw 4 cards',
      answer: 'You must\ndraw two cards.',
      reason: 'answer does not contain expected text',
    });
    const results = [makeResult(), failure];
    const card = formatScorecard(summarize(results, 0.9), results);
    expect(card).toContain('FAIL uno-uno-penalty (contains, uno)');
    expect(card).toContain('question: What is the penalty for not saying UNO?');
    expect(card).toContain('expected: draw 4 cards');
    expect(card).toContain('got:      You must draw two cards.');
    expect(card).toContain('reason:   answer does not contain expected text');
    expect(card).not.toContain('FAIL uno-draw-count');
  });

  it('omits the failures section when everything passes', () => {
    const results = [makeResult()];
    const card = formatScorecard(summarize(results, 0.9), results);
    expect(card).not.toContain('Failures:');
    expect(card).toContain('1/1 passed (100.0%)');
  });
});

// Pure grading and scorecard logic for the rules-assistant eval harness.
// No I/O in this module — everything here is unit-tested from src/__tests__.

export const MATCH_TYPES = ['exact', 'contains', 'regex', 'judge'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

export interface GoldenEntry {
  id: string;
  game: string;
  question: string;
  expected: string;
  matchType: MatchType;
  sourceQuote: string;
  notes?: string;
}

export interface GoldenSet {
  status: string;
  entries: GoldenEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMatchType(value: string): value is MatchType {
  return (MATCH_TYPES as readonly string[]).includes(value);
}

function requireString(entry: Record<string, unknown>, field: string, index: number): string {
  const value = entry[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`golden set entry ${index}: "${field}" must be a non-empty string`);
  }
  return value;
}

/** Validates parsed JSON against the golden-set schema; throws with a precise message. */
export function parseGoldenSet(data: unknown): GoldenSet {
  if (!isRecord(data)) {
    throw new Error('golden set must be a JSON object with "status" and "entries"');
  }
  if (typeof data.status !== 'string') {
    throw new Error('golden set "status" must be a string');
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('golden set "entries" must be an array');
  }
  const entries = data.entries.map((raw, index): GoldenEntry => {
    if (!isRecord(raw)) {
      throw new Error(`golden set entry ${index} must be an object`);
    }
    const matchType = requireString(raw, 'matchType', index);
    if (!isMatchType(matchType)) {
      throw new Error(
        `golden set entry ${index}: matchType "${matchType}" is not one of ${MATCH_TYPES.join('|')}`,
      );
    }
    const notes = raw.notes;
    if (notes !== undefined && typeof notes !== 'string') {
      throw new Error(`golden set entry ${index}: "notes" must be a string when present`);
    }
    // sourceQuote is human-verification metadata, never used for grading.
    // UNANSWERABLE entries intentionally carry an empty string (no quote can
    // prove an absence), so it only has to be a string — empty is allowed.
    const sourceQuote = raw.sourceQuote;
    if (typeof sourceQuote !== 'string') {
      throw new Error(`golden set entry ${index}: "sourceQuote" must be a string`);
    }
    const entry: GoldenEntry = {
      id: requireString(raw, 'id', index),
      game: requireString(raw, 'game', index),
      question: requireString(raw, 'question', index),
      expected: requireString(raw, 'expected', index),
      matchType,
      sourceQuote,
    };
    if (notes !== undefined) {
      entry.notes = notes;
    }
    return entry;
  });
  return { status: data.status, entries };
}

/** Trims, collapses all whitespace runs to single spaces, and lowercases. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function gradeExact(expected: string, answer: string): boolean {
  return normalizeText(answer) === normalizeText(expected);
}

export function gradeContains(expected: string, answer: string): boolean {
  return normalizeText(answer).includes(normalizeText(expected));
}

// Case-insensitive to match the other graders — model output casing is not stable.
export function gradeRegex(pattern: string, answer: string): boolean {
  return new RegExp(pattern, 'i').test(answer);
}

export interface JudgeVerdict {
  verdict: 'PASS' | 'FAIL';
  reason: string;
}

/** Strict rubric prompt for the second (judge) Gemini call. */
export function buildJudgePrompt(question: string, expected: string, answer: string): string {
  return [
    'You are a strict grader for a board game rules assistant.',
    '',
    `Question asked to the assistant: ${question}`,
    `Expected fact the response must state: ${expected}`,
    '',
    "Assistant's response:",
    '"""',
    answer,
    '"""',
    '',
    'Does the response correctly state the expected fact? Answer PASS or FAIL ' +
      'with a one-line reason. Start your reply with exactly PASS or FAIL.',
  ].join('\n');
}

/** Robustly extracts a PASS/FAIL verdict from a judge reply; unparseable replies fail. */
export function parseJudgeVerdict(raw: string): JudgeVerdict {
  const match = /\b(PASS|FAIL)\b/i.exec(raw);
  if (!match) {
    return {
      verdict: 'FAIL',
      reason: `could not parse judge verdict from: "${truncate(raw.trim(), 120)}"`,
    };
  }
  const verdict = match[1].toUpperCase() === 'PASS' ? 'PASS' : 'FAIL';
  const rest = raw
    .slice(match.index + match[0].length)
    .replace(/^[\s:,.*–—-]+/, '')
    .trim();
  return { verdict, reason: rest === '' ? raw.trim() : rest };
}

export interface EntryResult {
  id: string;
  game: string;
  question: string;
  expected: string;
  matchType: MatchType;
  answer: string;
  passed: boolean;
  reason: string;
}

/** Grades one answer. Judge entries need the raw reply from the second Gemini call. */
export function gradeAnswer(
  entry: GoldenEntry,
  answer: string,
  judgeReply?: string,
): { passed: boolean; reason: string } {
  switch (entry.matchType) {
    case 'exact': {
      const passed = gradeExact(entry.expected, answer);
      return {
        passed,
        reason: passed
          ? 'normalized answer equals expected'
          : 'normalized answer does not equal expected',
      };
    }
    case 'contains': {
      const passed = gradeContains(entry.expected, answer);
      return {
        passed,
        reason: passed ? 'answer contains expected text' : 'answer does not contain expected text',
      };
    }
    case 'regex': {
      const passed = gradeRegex(entry.expected, answer);
      return {
        passed,
        reason: passed
          ? 'answer matches expected pattern'
          : 'answer does not match expected pattern',
      };
    }
    case 'judge': {
      if (judgeReply === undefined) {
        return { passed: false, reason: 'no judge reply was provided' };
      }
      const { verdict, reason } = parseJudgeVerdict(judgeReply);
      return { passed: verdict === 'PASS', reason: `judge: ${reason}` };
    }
  }
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  threshold: number;
  ok: boolean;
}

/** Aggregates results against the pass threshold; an empty run never passes. */
export function summarize(results: EntryResult[], threshold: number): EvalSummary {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const passRate = total === 0 ? 0 : passed / total;
  return {
    total,
    passed,
    failed: total - passed,
    passRate,
    threshold,
    ok: total > 0 && passRate >= threshold,
  };
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

/** Human-readable scorecard: headline plus a detail block per failure. */
export function formatScorecard(summary: EvalSummary, results: EntryResult[]): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const lines = [
    `${summary.passed}/${summary.total} passed (${pct(summary.passRate)}) — ` +
      `threshold ${pct(summary.threshold)} — ${summary.ok ? 'PASS' : 'FAIL'}`,
  ];
  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    lines.push('', 'Failures:');
    for (const failure of failures) {
      lines.push(
        `  FAIL ${failure.id} (${failure.matchType}, ${failure.game})`,
        `    question: ${failure.question}`,
        `    expected: ${failure.expected}`,
        `    got:      ${truncate(normalizeSingleLine(failure.answer), 400)}`,
        `    reason:   ${failure.reason}`,
      );
    }
  }
  return lines.join('\n');
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

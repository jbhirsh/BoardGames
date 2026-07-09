// RAG evaluation harness for the AI rules assistant (GitHub issue #23).
//
// Runs every entry of a golden set through the real ask-a-question pipeline
// (api/_lib/rulesAssistant.ts) at temperature 0, grades the answers, prints a
// scorecard, writes eval/results.json, and exits nonzero when the pass rate
// falls below the threshold.
//
// Usage:
//   npm run eval                                       # eval/golden-set.json, threshold 0.9
//   npm run eval -- --file path/to/set.json --threshold 0.8
//
// Requires GEMINI_API_KEY in the environment or in .env.local at the repo root.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { askRulesAssistant, RULES_ASSISTANT_MODEL } from '../api/_lib/rulesAssistant.ts';
import {
  buildJudgePrompt,
  formatScorecard,
  gradeAnswer,
  parseGoldenSet,
  summarize,
} from './grading.ts';
import type { EntryResult, GoldenEntry, GoldenSet } from './grading.ts';
import { parseCliArgs, parseEnvFile } from './cli.ts';

const RESULTS_PATH = fileURLToPath(new URL('./results.json', import.meta.url));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Loads .env.local from the current directory without overriding existing env vars. */
function loadDotEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    return;
  }
  const parsed = parseEnvFile(readFileSync(envPath, 'utf-8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadGoldenSet(path: string): GoldenSet | null {
  try {
    return parseGoldenSet(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    console.error(`Failed to load golden set from ${path}: ${errorMessage(err)}`);
    return null;
  }
}

/** Second Gemini call: strict PASS/FAIL rubric at temperature 0. */
async function judgeAnswer(ai: GoogleGenAI, entry: GoldenEntry, answer: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: RULES_ASSISTANT_MODEL,
    contents: buildJudgePrompt(entry.question, entry.expected, answer),
    config: { temperature: 0 },
  });
  return response.text ?? '';
}

async function main(): Promise<number> {
  const options = parseCliArgs(process.argv.slice(2));
  loadDotEnvLocal();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Export it or add it to .env.local at the repo root.');
    return 1;
  }

  const goldenPath = resolve(process.cwd(), options.file);
  const golden = loadGoldenSet(goldenPath);
  if (golden === null) {
    return 1;
  }

  console.log(`Golden set: ${goldenPath} (status: ${golden.status}, ${golden.entries.length} entries)`);
  console.log(`Model: ${RULES_ASSISTANT_MODEL}, temperature 0, pass threshold ${options.threshold}`);

  const ai = new GoogleGenAI({ apiKey });
  const results: EntryResult[] = [];

  for (const [index, entry] of golden.entries.entries()) {
    process.stdout.write(`[${index + 1}/${golden.entries.length}] ${entry.id} (${entry.matchType}) ... `);
    let answer = '';
    let graded: { passed: boolean; reason: string };
    try {
      answer = await askRulesAssistant({
        slug: entry.game,
        message: entry.question,
        apiKey,
        temperature: 0,
      });
      const judgeReply = entry.matchType === 'judge' ? await judgeAnswer(ai, entry, answer) : undefined;
      graded = gradeAnswer(entry, answer, judgeReply);
    } catch (err) {
      graded = { passed: false, reason: `error: ${errorMessage(err)}` };
    }
    console.log(graded.passed ? 'pass' : 'FAIL');
    results.push({
      id: entry.id,
      game: entry.game,
      question: entry.question,
      expected: entry.expected,
      matchType: entry.matchType,
      answer,
      passed: graded.passed,
      reason: graded.reason,
    });
  }

  const summary = summarize(results, options.threshold);
  console.log(`\n${formatScorecard(summary, results)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    goldenFile: options.file,
    model: RULES_ASSISTANT_MODEL,
    summary,
    results,
  };
  writeFileSync(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nResults written to ${RESULTS_PATH}`);

  return summary.ok ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(errorMessage(err));
    process.exitCode = 1;
  },
);

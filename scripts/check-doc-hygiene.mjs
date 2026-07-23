#!/usr/bin/env node
// Doc-hygiene gate: fail if CLAUDE.md restates a rule that tooling already
// enforces. The guide should document intent and how-to; the *enforcement* is
// the source of truth (lint rules, git hooks, branch protection, gitleaks).
// Keeping enforced prohibitions out of the prose stops the guide and the
// sensors from drifting — the moment a rule is automated it should leave the
// doc, and this check makes that non-optional.
//
// Patterns target the prohibition / imperative phrasing of an enforced rule,
// not incidental descriptive mentions (e.g. "the E2E job runs on push to
// main" is fine; "never push to main" is not).
import { readFileSync } from 'node:fs';

const BANNED = [
  {
    re: /eslint-disable/i,
    why: 'inline eslint-disable is blocked by the @eslint-community/eslint-comments `no-use` rule',
  },
  {
    re: /@ts-(ignore|expect-error|nocheck)/i,
    why: 'suppressing type errors is blocked by @typescript-eslint/ban-ts-comment',
  },
  {
    re: /never\b[^.\n]{0,25}(commit|check[- ]?in|include)[^.\n]{0,25}(secret|api[- ]?key|\.env)/i,
    why: 'committed secrets are caught by the gitleaks workflow',
  },
  {
    re: /never\b[^.\n]{0,25}(push|commit)[^.\n]{0,20}\bto\b[^.\n]{0,10}\bmain\b/i,
    why: 'pushing to `main` is blocked by branch protection',
  },
  {
    re: /(always run|re-?run|run)[^.\n]{0,40}(test|lint|typecheck|type-check)[^.\n]{0,25}before[^.\n]{0,15}(commit|push)/i,
    why: 'the pre-commit / pre-push git hooks run these automatically',
  },
  {
    re: /tests?[^.\n]{0,15}must be green before/i,
    why: 'the pre-push hook enforces the coverage gate before code leaves the machine',
  },
];

const file = 'CLAUDE.md';
const lines = readFileSync(file, 'utf8').split('\n');
const hits = [];
lines.forEach((line, i) => {
  for (const { re, why } of BANNED) {
    if (re.test(line)) hits.push({ n: i + 1, text: line.trim(), why });
  }
});

if (hits.length) {
  console.error(
    `${file} restates ${hits.length} rule(s) that tooling already enforces.\n` +
      `Remove them — the enforcement is the source of truth, not the doc:\n`,
  );
  for (const h of hits) console.error(`  ${file}:${h.n}  ${h.text}\n     -> ${h.why}\n`);
  process.exit(1);
}
console.log(`${file} hygiene: OK — no enforced-rule prose.`);

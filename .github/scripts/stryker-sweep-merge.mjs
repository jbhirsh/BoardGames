// Merges the monthly sweep's shards (stryker-shards.mjs) into one incremental
// report, scores it and judges it against the config's `break` threshold.
//
// Each shard mutated its own files, so the reports' `files` are disjoint; a
// file in two of them means the split went wrong, and the merge stops. Every
// shard ran the whole test suite, but Stryker numbers a report's tests in the
// order its run met them, so test "7" in one shard can be another test in
// the next. Tests are matched across shards the way Stryker's incremental
// mode matches them (test file, start position and name), given one number
// each, and every mutant's `coveredBy` and `killedBy` are renumbered to
// match; a test a shard names but doesn't list is dropped from them.
//
// The score is Stryker's (mutation-testing-metrics): detected (killed and
// timed out) over valid (detected, survived and with no coverage), leaving
// out compile and runtime errors and ignored mutants; the run fails when it
// falls below `break`, as Stryker fails `score < break`. Where Stryker would
// pass a run that tested nothing (its score is NaN), this fails it: a sweep
// with nothing to score is broken.
//
// The merged report is written only when every expected shard reported,
// since it becomes main's baseline, which every PR run starts from: one
// missing a shard would send PRs to re-test that shard's files, or score
// them on nothing. A partial sweep's score is still shown, for information,
// and fails the run.
//
// Usage: node .github/scripts/stryker-sweep-merge.mjs <shards dir> <expected count> <out file>
// The shards dir holds one directory per shard (an artifact each), with its
// stryker-incremental.json. In Actions it writes `complete=true|false` to
// $GITHUB_OUTPUT and the score to $GITHUB_STEP_SUMMARY. Exits 1 when the
// sweep is incomplete, scored nothing or scored below `break`.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { nodeIo } from './cli-io.mjs';
import { relativeName } from './stryker-incremental-scope.mjs';

/** The key Stryker's incremental mode identifies a test by across reports. */
export function testKey(fileName, test, cwd = process.cwd()) {
  const start = test.location?.start ?? { line: 0, column: 0 };
  return `${relativeName(fileName, cwd)}@${start.line}:${start.column}\n${test.name}`;
}

/**
 * The shard reports as one, with tests numbered once across them.
 * @param {Array<{ files?: object, testFiles?: object }>} reports
 * @param {{ mutate?: string[], thresholds?: object }} config
 */
export function mergeReports(reports, config, cwd = process.cwd()) {
  const files = {};
  const seen = new Set();
  const testFiles = {};
  const ids = new Map();
  for (const report of reports) {
    const local = new Map();
    for (const [fileName, testFile] of Object.entries(report.testFiles ?? {})) {
      const merged = (testFiles[fileName] ??= { ...testFile, tests: [] });
      for (const test of testFile.tests ?? []) {
        const key = testKey(fileName, test, cwd);
        if (!ids.has(key)) {
          ids.set(key, String(ids.size));
          merged.tests.push({ ...test, id: ids.get(key) });
        }
        local.set(test.id, ids.get(key));
      }
    }
    const renumber = (list) => list?.map((id) => local.get(id)).filter((id) => id !== undefined);
    for (const [fileName, file] of Object.entries(report.files ?? {})) {
      const name = relativeName(fileName, cwd);
      if (seen.has(name)) throw new Error(`${name} is in more than one shard's report`);
      seen.add(name);
      files[fileName] = {
        ...file,
        mutants: (file.mutants ?? []).map((mutant) => ({
          ...mutant,
          coveredBy: renumber(mutant.coveredBy),
          killedBy: renumber(mutant.killedBy),
        })),
      };
    }
  }
  const [first = {}] = reports;
  return {
    ...first,
    files,
    testFiles,
    thresholds: config.thresholds,
    config: { ...first.config, mutate: config.mutate, thresholds: config.thresholds },
  };
}

/** A report's mutant counts by status, and Stryker's score (NaN with nothing valid). */
export function metrics(report) {
  const count = {};
  for (const file of Object.values(report.files ?? {})) {
    for (const { status } of file.mutants ?? []) count[status] = (count[status] ?? 0) + 1;
  }
  const n = (status) => count[status] ?? 0;
  const detected = n('Killed') + n('Timeout');
  const valid = detected + n('Survived') + n('NoCoverage');
  return {
    killed: n('Killed'),
    timeout: n('Timeout'),
    survived: n('Survived'),
    noCoverage: n('NoCoverage'),
    errors: n('CompileError') + n('RuntimeError'),
    ignored: n('Ignored'),
    score: valid > 0 ? (detected / valid) * 100 : NaN,
  };
}

/** The verdict on a merge: whether it passes, and the summary to show. */
export function verdict({ found, expected, m, breakAt }) {
  const complete = found === expected;
  const score = Number.isNaN(m.score) ? 'none' : `${m.score.toFixed(2)}%`;
  const lines = [
    `### Mutation sweep${complete ? '' : ' (incomplete)'}`,
    '',
    `Shards reported: ${found} of ${expected}.`,
    '',
    '| Score | Break | Killed | Timeout | Survived | No coverage | Errors | Ignored |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${score} | ${breakAt ?? 'none'} | ${m.killed} | ${m.timeout} | ${m.survived} | ${m.noCoverage} | ${m.errors} | ${m.ignored} |`,
    '',
  ];
  let pass = true;
  if (!complete) {
    pass = false;
    lines.push(
      "Not every shard reported, so this score covers only some files, and main's baseline is left as it was.",
    );
  } else if (Number.isNaN(m.score)) {
    pass = false;
    lines.push('No mutant was tested.');
  } else if (typeof breakAt === 'number' && m.score < breakAt) {
    pass = false;
    lines.push(`The score is under the break threshold of ${breakAt}.`);
  }
  return { complete, pass, summary: `${lines.join('\n')}\n` };
}

/**
 * The command line. `io` reads the shards and writes the outputs, so tests
 * can stand in for the file system. Returns the exit code.
 */
export function main(args, io) {
  const [dir, expectedText, out] = args;
  const expected = Number(expectedText);
  if (!dir || !out || !Number.isInteger(expected) || expected < 1) {
    io.error('Usage: stryker-sweep-merge.mjs <shards dir> <expected count> <out file>');
    return 2;
  }
  const config = JSON.parse(io.read('stryker.config.json'));
  const reports = [];
  for (const shard of io.list(dir).sort()) {
    let report = null;
    try {
      report = JSON.parse(io.read(path.join(dir, shard, 'stryker-incremental.json')) ?? '');
    } catch {
      // Not a report: counted as missing below.
    }
    if (report !== null && typeof report === 'object') reports.push(report);
    else io.error(`No readable results from ${shard}.`);
  }
  const merged = mergeReports(reports, config);
  const { complete, pass, summary } = verdict({
    found: reports.length,
    expected,
    m: metrics(merged),
    breakAt: config.thresholds?.break,
  });
  if (complete) io.write(out, JSON.stringify(merged));
  io.log(summary);
  if (io.env.GITHUB_OUTPUT) io.append(io.env.GITHUB_OUTPUT, `complete=${complete}\n`);
  if (io.env.GITHUB_STEP_SUMMARY) io.append(io.env.GITHUB_STEP_SUMMARY, summary);
  return pass ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2), {
    ...nodeIo(),
    list: (dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        return [];
      }
    },
  });
}

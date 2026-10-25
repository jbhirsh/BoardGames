// Splits the monthly Stryker sweep into shards that run as parallel jobs.
//
// The whole mutate scope is about 12,500 mutants, and at CI's pace (about 4 s
// a mutant) one job would need most of a day: far past the job's limit, and a
// run cut off by it saves nothing, so main's baseline never refreshed. Split
// across shards, each job tests its part from scratch, and
// stryker-sweep-merge.mjs puts the parts back together, scores the whole and
// saves it as main's baseline.
//
// The files are those the `mutate` globs in stryker.config.json select among
// the tracked files (the same matching as the PR scope, so the two can't
// drift). Each file goes whole to one shard: biggest first, each to the
// lightest shard so far (ties to the lower shard, equal weights in path
// order), so the same files and weights always give the same split. A file
// weighs its mutant count in the last report (main's baseline, when there is
// one; ignored mutants left out, as Stryker doesn't run them), else its line
// count scaled by that report's mutants per line, else its line count.
//
// Usage:
//   node .github/scripts/stryker-shards.mjs plan <count> [report]
//     Prints the split. In Actions it also writes `matrix` (a job matrix,
//     one entry per shard with its comma-joined files as `mutate`) and
//     `count` to $GITHUB_OUTPUT, and the table to $GITHUB_STEP_SUMMARY.
//   node .github/scripts/stryker-shards.mjs shard <k> <count> [report]
//     Prints shard k's files (1-based), comma-joined for --mutate.
//   node .github/scripts/stryker-shards.mjs config <out>
//     Writes stryker.config.json to <out> with no break threshold: a shard's
//     score is one part's, and only the merged score is judged.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { nodeIo } from './cli-io.mjs';
import { relativeName } from './stryker-incremental-scope.mjs';
import { mutateScope } from './stryker-mutate-scope.mjs';

/**
 * The mutant count of each file in an incremental report, by cwd-relative
 * name, ignored mutants left out.
 * @param {{ files?: Record<string, { mutants?: Array<{ status?: string }> }> }} report
 * @param {string} cwd
 * @returns {Map<string, number>}
 */
export function reportCounts(report, cwd = process.cwd()) {
  const counts = new Map();
  for (const [name, file] of Object.entries(report.files ?? {})) {
    counts.set(relativeName(name, cwd), (file.mutants ?? []).filter((m) => m.status !== 'Ignored').length);
  }
  return counts;
}

/**
 * Each file's weight: its count when `counts` has one, else its line count
 * scaled by the mutants per line of the files `counts` does have (1 when it
 * has none of them).
 * @param {string[]} files
 * @param {(file: string) => number} lines
 * @param {Map<string, number>} counts
 * @returns {Map<string, number>}
 */
export function fileWeights(files, lines, counts) {
  let known = 0;
  let knownLines = 0;
  for (const file of files) {
    if (!counts.has(file)) continue;
    known += counts.get(file);
    knownLines += lines(file);
  }
  const perLine = knownLines > 0 ? known / knownLines : 1;
  return new Map(files.map((file) => [file, counts.get(file) ?? Math.round(lines(file) * perLine)]));
}

/**
 * Splits the files into at most `count` shards of near-equal weight (never
 * an empty one), each shard's files in path order.
 * @param {Map<string, number>} weights
 * @param {number} count
 * @returns {Array<{ files: string[], weight: number }>}
 */
export function splitShards(weights, count) {
  const order = [...weights.keys()].sort((a, b) => weights.get(b) - weights.get(a) || (a < b ? -1 : 1));
  const shards = Array.from({ length: Math.min(count, order.length) }, () => ({ files: [], weight: 0 }));
  for (const file of order) {
    let lightest = 0;
    for (let i = 1; i < shards.length; i++) if (shards[i].weight < shards[lightest].weight) lightest = i;
    shards[lightest].files.push(file);
    shards[lightest].weight += weights.get(file);
  }
  for (const shard of shards) shard.files.sort();
  return shards;
}

/** The split for the tracked files (newline-separated), config and report. */
export function plan({ tracked, configText, reportText, lines, count, cwd = process.cwd() }) {
  const files = mutateScope(tracked, JSON.parse(configText));
  let counts = new Map();
  if (reportText !== null) {
    try {
      counts = reportCounts(JSON.parse(reportText), cwd);
    } catch {
      // An unreadable report weighs nothing: line counts stand in.
    }
  }
  return { shards: splitShards(fileWeights(files, lines, counts), count), byMutants: counts.size > 0 };
}

/** The config's text with no break threshold, for one shard's run. */
export function shardConfig(configText) {
  const config = JSON.parse(configText);
  return `${JSON.stringify({ ...config, thresholds: { ...config.thresholds, break: null } }, null, 2)}\n`;
}

/** A GitHub Actions job matrix with one entry per shard. */
export function matrix(shards) {
  return { include: shards.map(({ files }, i) => ({ shard: i + 1, mutate: files.join(',') })) };
}

/** The split as a Markdown table. */
export function table(shards, byMutants) {
  const unit = byMutants ? 'mutants (last report)' : 'lines';
  const rows = shards.map(({ files, weight }, i) => `| ${i + 1} | ${files.length} | ${weight} |`);
  return [`| Shard | Files | Weight, ${unit} |`, '| --- | --- | --- |', ...rows, ''].join('\n');
}

function positive(text) {
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The command line. `io` reads the repository and writes the outputs, so
 * tests can stand in for git and the file system. Returns the exit code.
 */
export function main(args, io) {
  const [command, ...rest] = args;
  if (command === 'config' && rest[0]) {
    io.write(rest[0], shardConfig(io.read('stryker.config.json')));
    return 0;
  }
  const isShard = command === 'shard';
  const k = isShard ? positive(rest[0]) : 1;
  const count = positive(isShard ? rest[1] : rest[0]);
  const reportFile = isShard ? rest[2] : rest[1];
  if ((command !== 'plan' && !isShard) || k === null || count === null) {
    io.error('Usage: stryker-shards.mjs plan <count> [report] | shard <k> <count> [report] | config <out>');
    return 2;
  }
  const { shards, byMutants } = plan({
    tracked: io.tracked(),
    configText: io.read('stryker.config.json'),
    reportText: reportFile ? io.read(reportFile) : null,
    lines: (file) => (io.read(file) ?? '').split('\n').length,
    count,
  });
  if (isShard) {
    io.log(shards[k - 1]?.files.join(',') ?? '');
    return 0;
  }
  const summary = table(shards, byMutants);
  io.log(summary);
  if (io.env.GITHUB_OUTPUT) {
    io.append(io.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix(shards))}\ncount=${shards.length}\n`);
  }
  if (io.env.GITHUB_STEP_SUMMARY) io.append(io.env.GITHUB_STEP_SUMMARY, `### Mutation sweep shards\n\n${summary}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2), {
    ...nodeIo(),
    tracked: () => execFileSync('git', ['ls-files'], { encoding: 'utf8' }),
  });
}

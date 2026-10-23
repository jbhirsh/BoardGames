// Keeps one GitHub issue per weekly-audit category (weekly-audit.yml): the
// dead code knip finds, the clones jscpd finds, broken markdown links, and
// documentation debt. A run with findings opens the category's issue, or
// rewrites the body of the one already open, so the issue always shows the
// latest report and never collects a comment a week; a clean run closes it
// with a comment saying so. Issues are found by exact title among the open
// ones labelled `weekly-audit`, so renaming a category opens a new issue.
//
// Usage (gh must be authenticated, GH_TOKEN with issues: write):
//   node .github/scripts/tracking-issue.mjs --title "Dead code (weekly audit)" \
//     --report knip.md --found true
// `--found false` (nothing to report) needs no report file.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LABEL = 'weekly-audit';

/**
 * What to do with the category's issue: open one, rewrite the open one's
 * body, close it, or nothing.
 * @param {{ existing: number | null, found: boolean }} state
 * @returns {'create' | 'update' | 'close' | 'none'}
 */
export function planAction({ existing, found }) {
  if (found) return existing === null ? 'create' : 'update';
  return existing === null ? 'none' : 'close';
}

// GitHub refuses an issue body over 65,536 characters; past this the report
// is cut, leaving room for the footer.
export const REPORT_MAX = 60_000;

/**
 * The issue body: the tool's report, cut to REPORT_MAX with a pointer to
 * the run's full one, then where it came from.
 * @param {string} report
 * @param {Record<string, string | undefined>} env
 */
export function issueBody(report, env) {
  const run =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
  const footer = run
    ? `Written by the weekly audit ([run](${run})); the next run rewrites this body, and closes the issue once it finds nothing.`
    : 'Written by the weekly audit; the next run rewrites this body, and closes the issue once it finds nothing.';
  let text = report.trim();
  if (text.length > REPORT_MAX) {
    text = `${text.slice(0, REPORT_MAX)}\n\n…cut short: the whole report is in the ${run ? `[run](${run})` : 'run'}'s summary.`;
  }
  return `${text}\n\n---\n_${footer}_\n`;
}

/**
 * The number of the open issue labelled `weekly-audit` with exactly this
 * title, or null.
 * @param {(args: string[], input?: string) => string} gh runs the gh CLI with `input` on stdin, returning stdout
 * @param {string} title
 */
export function findIssue(gh, title) {
  const open = JSON.parse(
    gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '100', '--json', 'number,title']),
  );
  return open.find((issue) => issue.title === title)?.number ?? null;
}

/**
 * Brings the category's issue in line with this run, and says what it did.
 * @param {{ title: string, found: boolean, report: string, env: Record<string, string | undefined>,
 *   gh: (args: string[], input?: string) => string }} options
 */
export function sync({ title, found, report, env, gh }) {
  const existing = findIssue(gh, title);
  const action = planAction({ existing, found });
  if (action === 'create') {
    gh(['label', 'create', LABEL, '--force', '--color', 'c5def5', '--description', 'Opened by the weekly audit']);
    // The body goes on stdin: a long report could pass the argument limit.
    gh(['issue', 'create', '--title', title, '--label', LABEL, '--body-file', '-'], issueBody(report, env));
    return `Opened "${title}".`;
  }
  if (action === 'update') {
    gh(['issue', 'edit', String(existing), '--body-file', '-'], issueBody(report, env));
    return `Updated #${existing} ("${title}").`;
  }
  if (action === 'close') {
    gh([
      'issue',
      'close',
      String(existing),
      '--reason',
      'completed',
      '--comment',
      'The weekly audit found nothing this week, so this is done.',
    ]);
    return `Closed #${existing} ("${title}"): nothing found.`;
  }
  return `Nothing found and no open "${title}" issue: nothing to do.`;
}

/**
 * Reads `--name value` pairs.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!name.startsWith('--') || argv[i + 1] === undefined) throw new Error(`expected --name value, got ${name}`);
    args[name.slice(2)] = argv[i + 1];
  }
  if (!args.title) throw new Error('--title is required');
  if (args.found !== 'true' && args.found !== 'false') throw new Error('--found must be true or false');
  if (args.found === 'true' && !args.report) throw new Error('--report is required when --found is true');
  return { title: args.title, found: args.found === 'true', report: args.report };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { title, found, report } = parseArgs(process.argv.slice(2));
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input });
  console.log(sync({ title, found, report: found ? readFileSync(report, 'utf8') : '', env: process.env, gh }));
}

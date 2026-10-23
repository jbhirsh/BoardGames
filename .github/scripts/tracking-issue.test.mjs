// @vitest-environment node
// A Node script's test: Node's environment, where import.meta.url is a file URL.
import { describe, expect, it } from 'vitest';
import { LABEL, REPORT_MAX, findIssue, issueBody, parseArgs, planAction, sync } from './tracking-issue.mjs';

/** A fake gh: answers `issue list` with `open`, records every call and what it was given on stdin. */
function fakeGh(open = []) {
  const calls = [];
  const inputs = [];
  const gh = (args, input) => {
    calls.push(args);
    inputs.push(input);
    return args[0] === 'issue' && args[1] === 'list' ? JSON.stringify(open) : '';
  };
  return { gh, calls, inputs };
}

const ENV = { GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '42' };

describe('planAction', () => {
  it('opens an issue for new findings and rewrites an open one', () => {
    expect(planAction({ existing: null, found: true })).toBe('create');
    expect(planAction({ existing: 7, found: true })).toBe('update');
  });

  it('closes the open issue once a run is clean, and otherwise does nothing', () => {
    expect(planAction({ existing: 7, found: false })).toBe('close');
    expect(planAction({ existing: null, found: false })).toBe('none');
  });
});

describe('issueBody', () => {
  it('puts the report first and links the run under it', () => {
    const body = issueBody('  ## Report\n\n- one\n\n', ENV);
    expect(body.startsWith('## Report\n\n- one\n\n---\n')).toBe(true);
    expect(body).toContain('([run](https://github.com/o/r/actions/runs/42))');
    expect(body.endsWith('_\n')).toBe(true);
  });

  it("cuts a report too long for GitHub's limit, pointing to the run", () => {
    const body = issueBody('x'.repeat(REPORT_MAX + 5000), ENV);
    expect(body.length).toBeLessThan(65_536);
    expect(body).toContain('x'.repeat(REPORT_MAX));
    expect(body).not.toContain('x'.repeat(REPORT_MAX + 1));
    expect(body).toContain(
      "…cut short: the whole report is in the [run](https://github.com/o/r/actions/runs/42)'s summary.",
    );
    expect(issueBody('x'.repeat(REPORT_MAX), ENV)).not.toContain('cut short');
    expect(issueBody('x'.repeat(REPORT_MAX + 1), {})).toContain("in the run's summary.");
  });

  it('leaves the link out when the run is unknown', () => {
    const body = issueBody('Report', {});
    expect(body).not.toContain('[run]');
    expect(body).toContain('closes the issue once it finds nothing');
  });
});

describe('findIssue', () => {
  it('matches the exact title among open weekly-audit issues', () => {
    const { gh, calls } = fakeGh([
      { number: 3, title: 'Dead code (weekly audit) old' },
      { number: 5, title: 'Dead code (weekly audit)' },
    ]);
    expect(findIssue(gh, 'Dead code (weekly audit)')).toBe(5);
    expect(calls[0]).toEqual(expect.arrayContaining(['--label', LABEL, '--state', 'open']));
  });

  it('is null when none has the title', () => {
    expect(findIssue(fakeGh([{ number: 3, title: 'Other' }]).gh, 'Dead code (weekly audit)')).toBeNull();
  });
});

describe('sync', () => {
  const title = 'Broken links (weekly audit)';

  it('creates the label and the issue on a first finding', () => {
    const { gh, calls, inputs } = fakeGh();
    expect(sync({ title, found: true, report: 'two dead links', env: ENV, gh })).toBe(`Opened "${title}".`);
    expect(calls[1]).toEqual(expect.arrayContaining(['label', 'create', LABEL, '--force']));
    expect(calls[2]).toEqual(['issue', 'create', '--title', title, '--label', LABEL, '--body-file', '-']);
    expect(inputs[2]).toContain('two dead links');
  });

  it('rewrites the open issue rather than opening another', () => {
    const { gh, calls, inputs } = fakeGh([{ number: 9, title }]);
    expect(sync({ title, found: true, report: 'one dead link', env: ENV, gh })).toBe(`Updated #9 ("${title}").`);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(['issue', 'edit', '9', '--body-file', '-']);
    expect(inputs[1]).toContain('one dead link');
  });

  it('closes the open issue with a comment when nothing was found', () => {
    const { gh, calls } = fakeGh([{ number: 9, title }]);
    expect(sync({ title, found: false, report: '', env: ENV, gh })).toBe(`Closed #9 ("${title}"): nothing found.`);
    expect(calls[1].slice(0, 5)).toEqual(['issue', 'close', '9', '--reason', 'completed']);
    expect(calls[1]).toContain('--comment');
  });

  it('leaves everything alone when clean with no open issue', () => {
    const { gh, calls } = fakeGh();
    expect(sync({ title, found: false, report: '', env: ENV, gh })).toContain('nothing to do');
    expect(calls).toHaveLength(1);
  });
});

describe('parseArgs', () => {
  it('reads the title, the verdict and the report', () => {
    expect(parseArgs(['--title', 'T', '--found', 'true', '--report', 'r.md'])).toEqual({
      title: 'T',
      found: true,
      report: 'r.md',
    });
    expect(parseArgs(['--title', 'T', '--found', 'false'])).toEqual({ title: 'T', found: false, report: undefined });
  });

  it('refuses what it cannot act on', () => {
    expect(() => parseArgs(['--found', 'true', '--report', 'r'])).toThrow('--title is required');
    expect(() => parseArgs(['--title', 'T', '--found', 'yes'])).toThrow('--found must be true or false');
    expect(() => parseArgs(['--title', 'T', '--found', 'true'])).toThrow('--report is required');
    expect(() => parseArgs(['title', 'T'])).toThrow('expected --name value');
    expect(() => parseArgs(['--title'])).toThrow('expected --name value');
  });
});

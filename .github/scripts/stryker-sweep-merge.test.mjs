// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main, mergeReports, metrics, testKey, verdict } from './stryker-sweep-merge.mjs';

const config = { mutate: ['src/**/*.ts'], thresholds: { high: 80, low: 60, break: 68 } };
const at = (line, column = 1) => ({ start: { line, column } });
const mutant = (id, status, extra = {}) => ({ id, status, mutatorName: 'X', location: at(1), ...extra });

// Two shards whose runs met the same three tests in different orders.
const shardA = {
  schemaVersion: '1.0',
  projectRoot: '/repo',
  config: { mutate: ['src/a.ts'], thresholds: { break: null }, concurrency: 3 },
  thresholds: { break: null },
  files: {
    'src/a.ts': {
      language: 'typescript',
      source: 'a',
      mutants: [
        mutant('1', 'Killed', { coveredBy: ['0', '1'], killedBy: ['1'] }),
        mutant('2', 'Survived', { coveredBy: ['0'] }),
      ],
    },
  },
  testFiles: {
    'src/__tests__/a.test.ts': {
      source: 'tests',
      tests: [
        { id: '0', name: 'reads', location: at(3) },
        { id: '1', name: 'writes', location: at(7) },
      ],
    },
    'src/__tests__/b.test.ts': { tests: [{ id: '2', name: 'b' }] },
  },
};
const shardB = {
  schemaVersion: '1.0',
  config: { mutate: ['src/b.ts'], thresholds: { break: null } },
  files: {
    'src/b.ts': {
      language: 'typescript',
      mutants: [
        mutant('1', 'Timeout', { coveredBy: ['0', '9'], killedBy: ['0'] }),
        mutant('2', 'NoCoverage'),
        mutant('3', 'CompileError'),
        mutant('4', 'Ignored'),
      ],
    },
  },
  testFiles: {
    'src/__tests__/b.test.ts': { tests: [{ id: '0', name: 'b' }] },
    'src/__tests__/a.test.ts': {
      source: 'tests',
      tests: [
        { id: '1', name: 'writes', location: at(7) },
        { id: '2', name: 'reads', location: at(3) },
      ],
    },
  },
};

describe('testKey', () => {
  it("is Stryker's key: relative test file, start position and name", () => {
    expect(testKey('/repo/src/a.test.ts', { name: 'n', location: at(4, 2) }, '/repo')).toBe('src/a.test.ts@4:2\nn');
    expect(testKey('src/a.test.ts', { name: 'n' }, '/repo')).toBe('src/a.test.ts@0:0\nn');
  });
});

describe('mergeReports', () => {
  const merged = mergeReports([shardA, shardB], config, '/repo');

  it("keeps every shard's files", () => {
    expect(Object.keys(merged.files)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(merged.files['src/a.ts'].source).toBe('a');
    expect(merged.files['src/b.ts'].mutants.map((m) => m.status)).toEqual([
      'Timeout',
      'NoCoverage',
      'CompileError',
      'Ignored',
    ]);
  });

  it('lists each test once, numbered across the shards', () => {
    expect(merged.testFiles['src/__tests__/a.test.ts']).toEqual({
      source: 'tests',
      tests: [
        { id: '0', name: 'reads', location: at(3) },
        { id: '1', name: 'writes', location: at(7) },
      ],
    });
    expect(merged.testFiles['src/__tests__/b.test.ts'].tests).toEqual([{ id: '2', name: 'b' }]);
  });

  it("renumbers each shard's mutants to the merged tests, dropping a test the shard doesn't list", () => {
    const [killed, survived] = merged.files['src/a.ts'].mutants;
    expect(killed.coveredBy).toEqual(['0', '1']);
    expect(killed.killedBy).toEqual(['1']);
    expect(survived.coveredBy).toEqual(['0']);
    expect(survived.killedBy).toBeUndefined();
    // Shard B's test "0" is b.test.ts's "b", merged as "2"; its "9" is no test.
    const [timeout, noCoverage] = merged.files['src/b.ts'].mutants;
    expect(timeout.coveredBy).toEqual(['2']);
    expect(timeout.killedBy).toEqual(['2']);
    expect(noCoverage.coveredBy).toBeUndefined();
  });

  it("takes the first shard's report, with the config's whole scope and thresholds", () => {
    expect(merged.schemaVersion).toBe('1.0');
    expect(merged.projectRoot).toBe('/repo');
    expect(merged.thresholds).toEqual(config.thresholds);
    expect(merged.config).toEqual({ mutate: config.mutate, thresholds: config.thresholds, concurrency: 3 });
  });

  it('stops when two shards mutated the same file, however it is named', () => {
    const again = { files: { '/repo/src/a.ts': { mutants: [] } } };
    expect(() => mergeReports([shardA, again], config, '/repo')).toThrow('src/a.ts is in more than one');
  });

  it('copes with reports missing their lists', () => {
    const out = mergeReports([{ files: { 'src/c.ts': {} }, testFiles: { 't.ts': {} } }, {}], config, '/repo');
    expect(out.files['src/c.ts'].mutants).toEqual([]);
    expect(out.testFiles['t.ts'].tests).toEqual([]);
    expect(mergeReports([], config).files).toEqual({});
  });
});

describe('metrics', () => {
  it('counts each status and scores as Stryker does: detected over valid, errors and ignored left out', () => {
    const m = metrics(mergeReports([shardA, shardB], config, '/repo'));
    expect(m).toEqual({
      killed: 1,
      timeout: 1,
      survived: 1,
      noCoverage: 1,
      errors: 1,
      ignored: 1,
      score: 50,
    });
  });

  it('counts runtime errors with compile errors', () => {
    const m = metrics({ files: { a: { mutants: [mutant('1', 'RuntimeError'), mutant('2', 'Killed')] } } });
    expect(m.errors).toBe(1);
    expect(m.score).toBe(100);
  });

  it('has no score with nothing valid', () => {
    expect(metrics({ files: { a: { mutants: [mutant('1', 'Ignored')] } } }).score).toBeNaN();
    expect(metrics({}).score).toBeNaN();
  });
});

describe('verdict', () => {
  const m = { killed: 7, timeout: 0, survived: 3, noCoverage: 0, errors: 2, ignored: 4, score: 70 };

  it('passes a complete sweep at or above the break threshold, showing the counts', () => {
    const v = verdict({ found: 4, expected: 4, m, breakAt: 70 });
    expect(v).toMatchObject({ complete: true, pass: true });
    expect(v.summary).toContain('### Mutation sweep\n');
    expect(v.summary).toContain('Shards reported: 4 of 4.');
    expect(v.summary).toContain('| 70.00% | 70 | 7 | 0 | 3 | 0 | 2 | 4 |');
  });

  it('fails one under the break threshold', () => {
    const v = verdict({ found: 4, expected: 4, m: { ...m, score: 69.99 }, breakAt: 70 });
    expect(v.pass).toBe(false);
    expect(v.summary).toContain('under the break threshold of 70');
  });

  it('passes any score when there is no break threshold', () => {
    const v = verdict({ found: 1, expected: 1, m: { ...m, score: 1 }, breakAt: null });
    expect(v.pass).toBe(true);
    expect(v.summary).toContain('| 1.00% | none |');
  });

  it('fails a complete sweep that tested nothing', () => {
    const v = verdict({ found: 2, expected: 2, m: { ...m, score: NaN }, breakAt: 68 });
    expect(v.pass).toBe(false);
    expect(v.summary).toContain('| none | 68 |');
    expect(v.summary).toContain('No mutant was tested.');
  });

  it('fails an incomplete sweep whatever its score, saying the baseline is kept', () => {
    const v = verdict({ found: 3, expected: 4, m: { ...m, score: 99 }, breakAt: 68 });
    expect(v).toMatchObject({ complete: false, pass: false });
    expect(v.summary).toContain('### Mutation sweep (incomplete)');
    expect(v.summary).toContain('Shards reported: 3 of 4.');
    expect(v.summary).toContain("main's baseline is left as it was");
  });
});

describe('main', () => {
  function io(shards, env = {}) {
    const files = { 'stryker.config.json': JSON.stringify(config) };
    for (const [name, text] of Object.entries(shards))
      files[path.join('shards', name, 'stryker-incremental.json')] = text;
    const calls = { log: [], error: [], write: {}, append: {} };
    return {
      calls,
      list: (dir) => (dir === 'shards' ? Object.keys(shards) : []),
      read: (file) => files[file] ?? null,
      write: (file, text) => (calls.write[file] = text),
      append: (file, text) => (calls.append[file] = (calls.append[file] ?? '') + text),
      env,
      log: (text) => calls.log.push(text),
      error: (text) => calls.error.push(text),
    };
  }
  const good = { files: { 'src/a.ts': { mutants: [mutant('1', 'Killed'), mutant('2', 'Killed')] } } };
  const weak = { files: { 'src/b.ts': { mutants: [mutant('1', 'Survived')] } } };

  it('writes the merged report and passes a complete sweep at the threshold, telling Actions', () => {
    const third = { files: { 'src/c.ts': { mutants: [mutant('1', 'Killed')] } } };
    const fake = io(
      { 'shard-2': JSON.stringify(weak), 'shard-1': JSON.stringify(good), 'shard-3': JSON.stringify(third) },
      { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'sum' },
    );
    // 3 of 4 detected: 75%, over 68.
    expect(main(['shards', '3', 'merged.json'], fake)).toBe(0);
    expect(Object.keys(JSON.parse(fake.calls.write['merged.json']).files)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
    expect(fake.calls.append.out).toBe('complete=true\n');
    expect(fake.calls.append.sum).toContain('| 75.00% | 68 |');
    expect(fake.calls.log[0]).toBe(fake.calls.append.sum);
  });

  it("fails a complete sweep under the threshold but still writes it, as main's baseline", () => {
    // 2 of 3 detected: 66.67%, under 68.
    const fake = io({ 'shard-1': JSON.stringify(good), 'shard-2': JSON.stringify(weak) });
    expect(main(['shards', '2', 'merged.json'], fake)).toBe(1);
    expect(fake.calls.write['merged.json']).toBeDefined();
    expect(fake.calls.append).toEqual({});
  });

  it('writes nothing and fails when a shard is missing or unreadable', () => {
    const fake = io(
      { 'shard-1': JSON.stringify(good), 'shard-2': '{cut off', 'shard-3': 'null' },
      { GITHUB_OUTPUT: 'out' },
    );
    expect(main(['shards', '4', 'merged.json'], fake)).toBe(1);
    expect(fake.calls.write).toEqual({});
    expect(fake.calls.error).toEqual(['No readable results from shard-2.', 'No readable results from shard-3.']);
    expect(fake.calls.append.out).toBe('complete=false\n');
    expect(fake.calls.log[0]).toContain('Shards reported: 1 of 4.');
  });

  it('fails when no shard reported', () => {
    const fake = io({});
    expect(main(['shards', '2', 'merged.json'], fake)).toBe(1);
    expect(fake.calls.log[0]).toContain('Shards reported: 0 of 2.');
  });

  it.each([[[]], [['shards']], [['shards', '2']], [['shards', '0', 'o.json']], [['shards', 'x', 'o.json']]])(
    'refuses %j with the usage',
    (args) => {
      const fake = io({});
      expect(main(args, fake)).toBe(2);
      expect(fake.calls.error[0]).toMatch(/^Usage:/);
    },
  );
});

describe('the command line', () => {
  it('merges the shard artifacts in a directory', () => {
    const script = path.resolve('.github/scripts/stryker-sweep-merge.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'stryker-merge-'));
    try {
      writeFileSync(path.join(dir, 'stryker.config.json'), JSON.stringify(config));
      for (const [name, report] of [
        ['stryker-sweep-results-1', shardA],
        ['stryker-sweep-results-2', shardB],
      ]) {
        mkdirSync(path.join(dir, 'shards', name), { recursive: true });
        writeFileSync(path.join(dir, 'shards', name, 'stryker-incremental.json'), JSON.stringify(report));
      }
      writeFileSync(path.join(dir, 'shards', 'stray-file'), '');
      const run = (shards, expected) =>
        spawnSync('node', [script, shards, expected, 'merged.json'], { cwd: dir, encoding: 'utf8' });
      // 2 of 4 detected: 50%, under 68, but complete, so written.
      const under = run('shards', '2');
      expect(under.status).toBe(1);
      expect(under.stdout).toContain('| 50.00% | 68 |');
      const merged = JSON.parse(readFileSync(path.join(dir, 'merged.json'), 'utf8'));
      expect(Object.keys(merged.files)).toEqual(['src/a.ts', 'src/b.ts']);
      rmSync(path.join(dir, 'merged.json'));
      const partial = run('shards', '3');
      expect(partial.status).toBe(1);
      expect(partial.stdout).toContain('Shards reported: 2 of 3.');
      expect(existsSync(path.join(dir, 'merged.json'))).toBe(false);
      expect(run('missing', '1').stdout).toContain('Shards reported: 0 of 1.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

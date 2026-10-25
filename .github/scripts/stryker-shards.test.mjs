// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileWeights, main, matrix, plan, reportCounts, shardConfig, splitShards, table } from './stryker-shards.mjs';

const config = {
  mutate: ['src/utils/**/*.ts', 'src/App.tsx', 'api/**/*.ts', '!**/*.d.ts'],
  thresholds: { high: 80, low: 60, break: 68 },
};
const configText = JSON.stringify(config);

describe('reportCounts', () => {
  it("counts each file's mutants by relative name, leaving out ignored ones", () => {
    const report = {
      files: {
        '/repo/src/a.ts': { mutants: [{ status: 'Killed' }, { status: 'Ignored' }, { status: 'Survived' }] },
        'src/b.ts': { mutants: [] },
        'src/c.ts': {},
      },
    };
    expect(reportCounts(report, '/repo')).toEqual(
      new Map([
        ['src/a.ts', 2],
        ['src/b.ts', 0],
        ['src/c.ts', 0],
      ]),
    );
  });

  it('reads a report with no files as no counts', () => {
    expect(reportCounts({}, '/repo').size).toBe(0);
  });
});

describe('fileWeights', () => {
  const lines = { 'a.ts': 100, 'b.ts': 50, 'c.ts': 30 };
  const lineCount = (file) => lines[file];

  it('weighs files by line count when there are no mutant counts', () => {
    expect(fileWeights(['a.ts', 'b.ts'], lineCount, new Map())).toEqual(
      new Map([
        ['a.ts', 100],
        ['b.ts', 50],
      ]),
    );
  });

  it("uses a file's mutant count, scaling the rest's lines by the counted files' mutants per line", () => {
    // a.ts and b.ts: 300 mutants over 150 lines, 2 a line; c.ts has 30 lines.
    const counts = new Map([
      ['a.ts', 250],
      ['b.ts', 50],
      ['gone.ts', 999],
    ]);
    expect(fileWeights(['a.ts', 'b.ts', 'c.ts'], lineCount, counts)).toEqual(
      new Map([
        ['a.ts', 250],
        ['b.ts', 50],
        ['c.ts', 60],
      ]),
    );
  });

  it('rounds a scaled weight to a whole number', () => {
    const counts = new Map([['b.ts', 25]]);
    expect(fileWeights(['b.ts', 'c.ts'], lineCount, counts).get('c.ts')).toBe(15);
    expect(fileWeights(['a.ts', 'c.ts'], lineCount, new Map([['a.ts', 33]])).get('c.ts')).toBe(10);
  });
});

describe('splitShards', () => {
  it('puts each file, biggest first, on the lightest shard so far', () => {
    const weights = new Map([
      ['e.ts', 1],
      ['a.ts', 9],
      ['b.ts', 7],
      ['c.ts', 4],
      ['d.ts', 3],
    ]);
    // a→1 (9), b→2 (7), c→2 (11), d→1 (12), e→2 (12).
    expect(splitShards(weights, 2)).toEqual([
      { files: ['a.ts', 'd.ts'], weight: 12 },
      { files: ['b.ts', 'c.ts', 'e.ts'], weight: 12 },
    ]);
  });

  it('breaks ties by path and by the lower shard, so the split is the same whatever the order given', () => {
    const files = ['c.ts', 'a.ts', 'd.ts', 'b.ts'];
    const forward = splitShards(new Map(files.map((f) => [f, 5])), 2);
    const backward = splitShards(new Map([...files].reverse().map((f) => [f, 5])), 2);
    expect(forward).toEqual([
      { files: ['a.ts', 'c.ts'], weight: 10 },
      { files: ['b.ts', 'd.ts'], weight: 10 },
    ]);
    expect(backward).toEqual(forward);
  });

  it('makes no empty shard when there are fewer files than shards', () => {
    expect(splitShards(new Map([['a.ts', 1]]), 4)).toEqual([{ files: ['a.ts'], weight: 1 }]);
    expect(splitShards(new Map(), 3)).toEqual([]);
  });

  it('keeps every file exactly once', () => {
    const weights = new Map(Array.from({ length: 40 }, (_, i) => [`f${i}.ts`, (i * 37) % 23]));
    const shards = splitShards(weights, 6);
    expect(shards).toHaveLength(6);
    expect(shards.flatMap((s) => s.files).sort()).toEqual([...weights.keys()].sort());
    const total = [...weights.values()].reduce((a, b) => a + b, 0);
    expect(shards.reduce((sum, s) => sum + s.weight, 0)).toBe(total);
    // Greedy keeps the heaviest shard within one file of the lightest.
    const heaviest = Math.max(...shards.map((s) => s.weight));
    const lightest = Math.min(...shards.map((s) => s.weight));
    expect(heaviest - lightest).toBeLessThanOrEqual(Math.max(...weights.values()));
  });
});

describe('plan', () => {
  const tracked = ['src/utils/a.ts', 'src/utils/b.ts', 'src/types.d.ts', 'src/App.tsx', 'README.md', ''].join('\n');
  const text = { 'src/utils/a.ts': 10, 'src/utils/b.ts': 20, 'src/App.tsx': 30 };
  const lines = (file) => text[file];

  it('splits the files the mutate globs select among the tracked ones, by lines without a report', () => {
    const out = plan({ tracked, configText, reportText: null, lines, count: 2, cwd: '/repo' });
    expect(out.byMutants).toBe(false);
    expect(out.shards).toEqual([
      { files: ['src/App.tsx'], weight: 30 },
      { files: ['src/utils/a.ts', 'src/utils/b.ts'], weight: 30 },
    ]);
  });

  it("weighs by the report's mutant counts when it has some", () => {
    const report = {
      files: {
        'src/App.tsx': { mutants: [{ status: 'Killed' }] },
        'src/utils/a.ts': { mutants: Array.from({ length: 5 }, () => ({ status: 'Survived' })) },
      },
    };
    const out = plan({ tracked, configText, reportText: JSON.stringify(report), lines, count: 2, cwd: '/repo' });
    expect(out.byMutants).toBe(true);
    // 6 mutants over 40 counted lines: b.ts's 20 lines weigh 3.
    expect(out.shards).toEqual([
      { files: ['src/utils/a.ts'], weight: 5 },
      { files: ['src/App.tsx', 'src/utils/b.ts'], weight: 4 },
    ]);
  });

  it('falls back to lines when the report is unreadable', () => {
    const out = plan({ tracked, configText, reportText: '{not json', lines, count: 1, cwd: '/repo' });
    expect(out.byMutants).toBe(false);
    expect(out.shards[0].weight).toBe(60);
  });

  it('refuses a config with no mutate list', () => {
    expect(() => plan({ tracked, configText: '{}', reportText: null, lines, count: 1 })).toThrow(/no mutate list/);
  });
});

describe('shardConfig', () => {
  it('keeps the config but drops the break threshold', () => {
    const out = JSON.parse(shardConfig(configText));
    expect(out).toEqual({ ...config, thresholds: { high: 80, low: 60, break: null } });
    expect(shardConfig(configText).endsWith('}\n')).toBe(true);
  });
});

describe('matrix and table', () => {
  const shards = [
    { files: ['a.ts', 'b.ts'], weight: 12 },
    { files: ['c.ts'], weight: 11 },
  ];

  it('makes one matrix entry per shard, numbered from 1, its files comma-joined', () => {
    expect(matrix(shards)).toEqual({
      include: [
        { shard: 1, mutate: 'a.ts,b.ts' },
        { shard: 2, mutate: 'c.ts' },
      ],
    });
  });

  it('tabulates each shard with the unit its weights are in', () => {
    expect(table(shards, false)).toBe(
      '| Shard | Files | Weight, lines |\n| --- | --- | --- |\n| 1 | 2 | 12 |\n| 2 | 1 | 11 |\n',
    );
    expect(table(shards, true)).toContain('Weight, mutants (last report)');
  });
});

describe('main', () => {
  const repo = {
    'stryker.config.json': configText,
    'src/utils/a.ts': 'a\nb\nc',
    'src/utils/b.ts': 'a',
    'src/App.tsx': 'a\nb',
    'report.json': JSON.stringify({ files: { 'src/App.tsx': { mutants: [{ status: 'Killed' }] } } }),
  };
  function io(env = {}) {
    const calls = { log: [], error: [], write: {}, append: {} };
    return {
      calls,
      tracked: () => 'src/utils/a.ts\nsrc/utils/b.ts\nsrc/App.tsx\nREADME.md\n',
      read: (file) => repo[file] ?? null,
      write: (file, text) => (calls.write[file] = text),
      append: (file, text) => (calls.append[file] = (calls.append[file] ?? '') + text),
      env,
      log: (text) => calls.log.push(text),
      error: (text) => calls.error.push(text),
    };
  }

  it('plans, printing the table and writing the matrix and count for Actions', () => {
    const fake = io({ GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'sum' });
    expect(main(['plan', '2'], fake)).toBe(0);
    expect(fake.calls.log[0]).toContain('| 1 | 1 | 3 |');
    expect(fake.calls.append.out).toBe(
      'matrix={"include":[{"shard":1,"mutate":"src/utils/a.ts"},{"shard":2,"mutate":"src/App.tsx,src/utils/b.ts"}]}\ncount=2\n',
    );
    expect(fake.calls.append.sum).toMatch(/^### Mutation sweep shards\n\n\| Shard/);
  });

  it('plans without Actions outputs outside Actions', () => {
    const fake = io();
    expect(main(['plan', '3'], fake)).toBe(0);
    expect(fake.calls.append).toEqual({});
  });

  it("prints one shard's files comma-joined, weighed by the report when given one", () => {
    const fake = io();
    expect(main(['shard', '2', '2', 'report.json'], fake)).toBe(0);
    // App.tsx weighs its 1 mutant over 2 lines; a.ts (3 lines) and b.ts (1)
    // scale to 2 and 1: a.ts alone, then App.tsx and b.ts.
    expect(fake.calls.log).toEqual(['src/App.tsx,src/utils/b.ts']);
  });

  it('prints nothing for a shard past the last', () => {
    const fake = io();
    expect(main(['shard', '5', '5'], fake)).toBe(0);
    expect(fake.calls.log).toEqual(['']);
  });

  it('reads a missing file as one line', () => {
    const fake = io();
    fake.tracked = () => 'src/utils/missing.ts\n';
    expect(main(['plan', '1'], fake)).toBe(0);
    expect(fake.calls.log[0]).toContain('| 1 | 1 | 1 |');
  });

  it('writes the shard config', () => {
    const fake = io();
    expect(main(['config', 'reports/shard.json'], fake)).toBe(0);
    expect(JSON.parse(fake.calls.write['reports/shard.json']).thresholds.break).toBeNull();
  });

  it.each([
    [[]],
    [['plan']],
    [['plan', '0']],
    [['plan', 'x']],
    [['shard', '0', '2']],
    [['shard', '1']],
    [['config']],
    [['nope', '2']],
  ])('refuses %j with the usage', (args) => {
    const fake = io();
    expect(main(args, fake)).toBe(2);
    expect(fake.calls.error[0]).toMatch(/^Usage:/);
  });
});

describe('the command line', () => {
  // Vitest runs from the repository root. Inherited GIT_* variables (a git
  // hook's) are left out, so git reads this checkout.
  const script = path.resolve('.github/scripts/stryker-shards.mjs');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const run = (...args) => execFileSync('node', [script, ...args], { env, encoding: 'utf8' });

  it("splits this repository's mutate scope", () => {
    const files = run('shard', '1', '1').trim().split(',');
    expect(files).toContain('src/App.tsx');
    expect(files).toContain('src/context/filterReducer.ts');
    expect(files).not.toContain('src/main.tsx');
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
  });

  it('writes a shard config with no break threshold', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'stryker-shards-'));
    try {
      const out = path.join(dir, 'reports', 'shard.json');
      run('config', out);
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.thresholds.break).toBeNull();
      expect(written.mutate).toEqual(JSON.parse(readFileSync('stryker.config.json', 'utf8')).mutate);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

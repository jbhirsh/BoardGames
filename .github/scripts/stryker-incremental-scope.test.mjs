// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main, narrow, narrowFile, relativeName, scopeLines } from './stryker-incremental-scope.mjs';

const report = {
  schemaVersion: '1.0',
  files: {
    'src/utils/urls.ts': { mutants: [{ id: '1' }] },
    'src/utils/filterUrl.ts': { mutants: [{ id: '2' }] },
    'api/graphql.ts': { mutants: [{ id: '3' }] },
  },
  testFiles: { 'src/__tests__/urls.test.ts': { tests: [{ id: '0', name: 'a' }] } },
};

describe('relativeName', () => {
  it('reads absolute and relative names as the same cwd-relative path', () => {
    expect(relativeName('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(relativeName('src/a.ts', '/repo')).toBe('src/a.ts');
    expect(relativeName('./src/a.ts', '/repo')).toBe('src/a.ts');
  });
});

describe('narrow', () => {
  it('keeps only the mutated files in scope, and every test file', () => {
    const out = narrow(report, ['src/utils/urls.ts', 'src/App.tsx'], '/repo');
    expect(Object.keys(out.files)).toEqual(['src/utils/urls.ts']);
    expect(out.testFiles).toBe(report.testFiles);
    expect(out.schemaVersion).toBe('1.0');
  });

  it('matches a report that names its files by absolute path', () => {
    const abs = { files: { '/repo/api/graphql.ts': { mutants: [] }, '/repo/src/x.ts': { mutants: [] } } };
    expect(Object.keys(narrow(abs, ['api/graphql.ts'], '/repo').files)).toEqual(['/repo/api/graphql.ts']);
  });

  it('copes with a report that has no files', () => {
    expect(narrow({}, ['a.ts'], '/repo').files).toEqual({});
  });

  it("keeps only the mutants lying within a file's named lines", () => {
    const at = (id, line) => ({ id, location: { start: { line, column: 1 }, end: { line, column: 5 } } });
    const lined = {
      files: { 'src/a.ts': { language: 'ts', mutants: [at('1', 2), at('2', 5), at('3', 9), { id: '4' }] } },
    };
    const out = narrow(lined, ['src/a.ts:4-5', 'src/a.ts:9-12'], '/repo');
    expect(out.files['src/a.ts'].mutants.map((m) => m.id)).toEqual(['2', '3']);
    expect(out.files['src/a.ts'].language).toBe('ts');
  });

  it('drops a mutant that starts in a named range but ends past it', () => {
    const span = (id, start, end) => ({
      id,
      location: { start: { line: start, column: 1 }, end: { line: end, column: 2 } },
    });
    const lined = {
      files: { 'src/a.ts': { mutants: [span('in', 4, 5), span('across', 5, 7), span('before', 3, 4)] } },
    };
    expect(narrow(lined, ['src/a.ts:4-5'], '/repo').files['src/a.ts'].mutants.map((m) => m.id)).toEqual(['in']);
  });
});

describe('scopeLines', () => {
  it("collects each file's ranges, a file named whole staying whole", () => {
    const lines = scopeLines(
      ['src/a.ts:1-2', 'src/a.ts:7-7', 'src/b.ts', 'src/b.ts:3-4', 'src/c.ts:5-6', 'src/c.ts'],
      '/repo',
    );
    expect(lines.get('src/a.ts')).toEqual([
      [1, 2],
      [7, 7],
    ]);
    expect(lines.get('src/b.ts')).toBeNull();
    expect(lines.get('src/c.ts')).toBeNull();
  });
});

describe('narrowFile', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const scratch = () => (dir = mkdtempSync(path.join(tmpdir(), 'stryker-scope-')));

  it('rewrites the file in place with the scope only', () => {
    const file = path.join(scratch(), 'incremental.json');
    writeFileSync(file, JSON.stringify(report));
    const log = vi.fn();
    narrowFile(file, ['src/utils/filterUrl.ts', 'api/graphql.ts'], log);
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).files)).toEqual([
      'src/utils/filterUrl.ts',
      'api/graphql.ts',
    ]);
    expect(log).toHaveBeenCalledWith("Kept 2 of 3 file(s) from the incremental file for this run's scope.");
  });

  it('leaves a missing file missing', () => {
    const file = path.join(scratch(), 'none.json');
    const log = vi.fn();
    narrowFile(file, ['a.ts'], log);
    expect(existsSync(file)).toBe(false);
    expect(log.mock.calls[0][0]).toMatch(/^No incremental file/);
  });

  it('removes a file that will not parse, so Stryker runs every mutant', () => {
    const file = path.join(scratch(), 'broken.json');
    writeFileSync(file, '{"files": {');
    const log = vi.fn();
    narrowFile(file, ['a.ts'], log);
    expect(existsSync(file)).toBe(false);
    expect(log.mock.calls[0][0]).toMatch(/^Unreadable incremental file/);
  });
});

describe('main', () => {
  it('needs both the file and the scope', () => {
    const error = vi.fn();
    expect(main([], vi.fn(), error)).toBe(2);
    expect(main(['incremental.json'], vi.fn(), error)).toBe(2);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('narrows the file to the comma-separated scope', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'stryker-scope-'));
    try {
      const file = path.join(dir, 'incremental.json');
      writeFileSync(file, JSON.stringify(report));
      expect(main([file, 'api/graphql.ts,'], vi.fn(), vi.fn())).toBe(0);
      expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).files)).toEqual(['api/graphql.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

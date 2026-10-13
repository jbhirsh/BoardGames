// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inMutateScope, main, mutateScope } from './stryker-mutate-scope.mjs';

const script = fileURLToPath(new URL('./stryker-mutate-scope.mjs', import.meta.url));
const configText = readFileSync('stryker.config.json', 'utf8');
const config = JSON.parse(configText);

describe('inMutateScope', () => {
  it('lets a later negation take back what an earlier glob selected', () => {
    expect(inMutateScope('src/a.d.ts', ['src/**/*.ts', '!**/*.d.ts'])).toBe(false);
    expect(inMutateScope('src/a.ts', ['src/**/*.ts', '!**/*.d.ts'])).toBe(true);
  });

  it('applies the globs in order, as Stryker does', () => {
    expect(inMutateScope('src/a.d.ts', ['!**/*.d.ts', 'src/**/*.ts'])).toBe(true);
  });

  it('selects nothing a positive glob does not name', () => {
    expect(inMutateScope('docs/a.ts', ['src/**/*.ts'])).toBe(false);
    expect(inMutateScope('src/a.ts', [])).toBe(false);
  });

  it('does not match into hidden directories', () => {
    expect(inMutateScope('src/.cache/a.ts', ['src/**/*.ts'])).toBe(false);
  });
});

describe('mutateScope with the repo config', () => {
  // The files the workflow's hard-coded list picked before the globs were
  // read from the config; the config must keep picking exactly these.
  const changed = [
    'src/components/GameCard.tsx',
    'src/utils/filterGames.ts',
    'src/context/filterReducer.ts',
    'src/context/FilterContext.tsx',
    'src/App.tsx',
    'src/main.tsx',
    'src/sw/shell.ts',
    'src/sw/sw.ts',
    'src/pdfjs/saved.ts',
    'src/pdfjs/worker.ts',
    'api/chat.ts',
    'api/_lib/slug.ts',
    'src/__tests__/filterGames.test.ts',
    'src/types/vitest-axe.d.ts',
    'src/data/games.ts',
    'src/App.css',
    'stryker.config.json',
    '.github/workflows/mutation.yml',
  ].join('\n');

  it('keeps changed source in scope and drops tests, declarations and the rest', () => {
    expect(mutateScope(changed, config)).toEqual([
      'src/components/GameCard.tsx',
      'src/utils/filterGames.ts',
      'src/context/filterReducer.ts',
      'src/App.tsx',
      'src/sw/shell.ts',
      'src/pdfjs/saved.ts',
      'api/chat.ts',
      'api/_lib/slug.ts',
    ]);
  });

  it('drops a declaration file inside a mutated directory', () => {
    expect(mutateScope('src/utils/env.d.ts\napi/_lib/types.d.ts', config)).toEqual([]);
  });

  it('ignores blank lines and surrounding whitespace', () => {
    expect(mutateScope('\n  src/App.tsx  \n\n', config)).toEqual(['src/App.tsx']);
  });

  it('refuses a config with no mutate list', () => {
    expect(() => mutateScope('src/App.tsx', {})).toThrow(/no mutate list/);
  });
});

describe('main', () => {
  it('prints the in-scope files one per line', () => {
    expect(main('src/App.tsx\nREADME.md\napi/votes.ts\n', configText)).toBe('src/App.tsx\napi/votes.ts\n');
  });

  it('prints nothing when no file is in scope', () => {
    expect(main('README.md\n', configText)).toBe('');
  });
});

describe('command line', () => {
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });

  it('reads the diff on stdin and stryker.config.json from the cwd', () => {
    const out = run('src/App.tsx\nREADME.md\napi/votes.ts\n');
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('src/App.tsx\napi/votes.ts\n');
  });

  it('succeeds with no output when no file is in scope', () => {
    const out = run('README.md\n');
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('');
  });
});

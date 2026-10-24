// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAs, gitIo, inMutateScope, main, mutateScope, substantive } from './stryker-mutate-scope.mjs';

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
    'api/graphql.ts',
    'api/_lib/slug.ts',
    'src/__tests__/filterGames.test.ts',
    'src/types/vitest-axe.d.ts',
    'src/data/games.ts',
    'src/index.css',
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
      'api/graphql.ts',
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
  it('prints the in-scope files one per line', async () => {
    expect(await main('src/App.tsx\nREADME.md\napi/graphql.ts\n', configText)).toBe('src/App.tsx\napi/graphql.ts\n');
  });

  it('prints nothing when no file is in scope', async () => {
    expect(await main('README.md\n', configText)).toBe('');
  });

  it('leaves out, given the base, what changed only in formatting', async () => {
    const io = {
      before: () => 'a',
      now: () => 'A',
      format: async (text) => text.toUpperCase(),
    };
    expect(await main('src/App.tsx\napi/graphql.ts\n', configText, io)).toBe('');
  });
});

describe('substantive', () => {
  // Formatting here upper-cases, so "x" at the base formats to "X".
  const format = async (text) => (text === 'unreadable' ? null : text.toUpperCase());
  const run = (before, now) => substantive(['src/a.ts'], { before: () => before, now: () => now, format });

  it('drops a file whose base version formats to it exactly', async () => {
    expect(await run('x = 1', 'X = 1')).toEqual([]);
  });

  it('keeps a file with a real change', async () => {
    expect(await run('x = 1', 'X = 2')).toEqual(['src/a.ts']);
  });

  it('keeps a file new to the branch, with no base version', async () => {
    expect(await run(null, 'X = 1')).toEqual(['src/a.ts']);
  });

  it("keeps a file whose base version Prettier can't read", async () => {
    expect(await run('unreadable', 'UNREADABLE')).toEqual(['src/a.ts']);
  });

  it('keeps the order it was given', async () => {
    const io = { before: (f) => f, now: (f) => f, format: async () => 'other' };
    expect(await substantive(['b', 'a'], io)).toEqual(['b', 'a']);
  });
});

describe('formatAs', () => {
  it("formats with the repository's config for the file", async () => {
    expect(await formatAs('const a = "x"', path.resolve('src/utils/x.ts'))).toBe("const a = 'x';\n");
  });

  it("is null for what Prettier can't parse", async () => {
    expect(await formatAs('const = ;', path.resolve('src/utils/x.ts'))).toBeNull();
  });
});

describe('command line', () => {
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });

  it('reads the diff on stdin and stryker.config.json from the cwd', () => {
    const out = run('src/App.tsx\nREADME.md\napi/graphql.ts\n');
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('src/App.tsx\napi/graphql.ts\n');
  });

  it('succeeds with no output when no file is in scope', () => {
    const out = run('README.md\n');
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('');
  });
});

// A real history in a throwaway repo: the base on main, the change on a
// branch. The user's git config is kept out, as are inherited GIT_*
// variables: run from a git hook, GIT_DIR would point every command here,
// the script's own included, at the repository being pushed instead.
describe('command line, against a base', () => {
  const dirs = [];
  const inherited = Object.keys(process.env).filter((key) => key.startsWith('GIT_'));
  beforeAll(() => {
    for (const key of inherited) vi.stubEnv(key, undefined);
    // The script's own git calls, run in this process, too.
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  });
  afterAll(() => vi.unstubAllEnvs());
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !inherited.includes(key))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'ignore' });
  const write = (cwd, files) => {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      writeFileSync(path.join(cwd, name), text);
    }
  };

  /** A repo whose topic branch reformats one file, changes one and adds one. */
  function repo() {
    const cwd = mkdtempSync(path.join(tmpdir(), 'mutate-scope-'));
    dirs.push(cwd);
    git(cwd, 'init', '-q', '-b', 'main');
    write(cwd, {
      'stryker.config.json': JSON.stringify({ mutate: ['src/**/*.ts'] }),
      '.prettierrc.json': JSON.stringify({ singleQuote: true }),
      'src/reformatted.ts': 'export const a = "x"\n',
      'src/changed.ts': "export const b = 'y';\n",
    });
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'base');
    git(cwd, 'checkout', '-q', '-b', 'topic');
    write(cwd, {
      'src/reformatted.ts': "export const a = 'x';\n",
      'src/changed.ts': "export const b = 'z';\n",
      'src/new.ts': 'export const c = 1;\n',
    });
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'change');
    return cwd;
  }

  it('reads the base version at the merge base, and the file as it is now', async () => {
    const cwd = repo();
    const io = gitIo('main', cwd);
    expect(io.before('src/reformatted.ts')).toBe('export const a = "x"\n');
    expect(io.before('src/new.ts')).toBeNull();
    expect(io.now('src/reformatted.ts')).toBe("export const a = 'x';\n");
    expect(await io.format('export const a = "x"', 'src/reformatted.ts')).toBe("export const a = 'x';\n");
    expect(await main('src/reformatted.ts\nsrc/changed.ts\nsrc/new.ts\n', '{"mutate":["src/**/*.ts"]}', io)).toBe(
      'src/changed.ts\nsrc/new.ts\n',
    );
  });

  it('mutates the real change and the new file, not the reformatted one', () => {
    const cwd = repo();
    const out = spawnSync(process.execPath, [script], {
      cwd,
      env: { ...env, MUTATE_BASE: 'main' },
      input: 'src/reformatted.ts\nsrc/changed.ts\nsrc/new.ts\nREADME.md\n',
      encoding: 'utf8',
    });
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    expect(out.stdout).toBe('src/changed.ts\nsrc/new.ts\n');
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spawnSync = vi.fn();
const existsSync = vi.fn();
vi.mock('node:child_process', () => ({ spawnSync }));
vi.mock('node:fs', () => ({ existsSync }));

const { main } = await import('./gif.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const besideClone = path.resolve(root, '..', 'ci');

/**
 * The commands run, in order, as [command, args].
 *
 * @returns {[string, string[]][]}
 */
const commands = () => spawnSync.mock.calls.map(([command, args]) => [command, args]);

/**
 * Sets what's on disk (the paths that exist) and how each command ends.
 *
 * @param {string[]} paths
 * @param {{ pull?: number, clone?: number, tool?: number | null }} statuses
 */
function given(paths, { pull = 0, clone = 0, tool = 0 } = {}) {
  existsSync.mockImplementation((p) => paths.includes(p));
  spawnSync.mockImplementation((command, args) => {
    if (command === 'git') return { status: args.includes('pull') ? pull : clone };
    return { status: tool };
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  spawnSync.mockReset();
  existsSync.mockReset();
});

describe('main', () => {
  const cli = path.join(besideClone, 'gif', 'cli.mjs');

  it('updates the clone beside this checkout, then runs its tool with the arguments and APP_ROOT', () => {
    given([path.join(besideClone, '.git'), cli], { tool: 3 });
    const env = { HOME: '/home/someone' };

    expect(main(['scripts/gif-scenarios/example.ts', '--side-by-side'], env)).toBe(3);

    expect(commands()).toEqual([
      ['git', ['-C', besideClone, 'pull', '--ff-only', '--quiet']],
      [process.execPath, [cli, 'scripts/gif-scenarios/example.ts', '--side-by-side']],
    ]);
    expect(spawnSync.mock.calls[1][2]).toEqual({
      stdio: 'inherit',
      env: { HOME: '/home/someone', APP_ROOT: root },
    });
    expect(env).toEqual({ HOME: '/home/someone' });
  });

  it('runs the clone as it is when the pull fails, saying so', () => {
    given([path.join(besideClone, '.git'), cli], { pull: 1 });

    expect(main(['a.ts'], {})).toBe(0);

    expect(console.warn).toHaveBeenCalledWith(`gif: couldn't update ${besideClone}; running it as it is`);
    expect(commands().at(-1)).toEqual([process.execPath, [cli, 'a.ts']]);
  });

  it('clones jbhirsh/ci when there is no clone, then runs it', () => {
    given([cli]);

    expect(main(['a.ts'], {})).toBe(0);

    expect(commands()).toEqual([
      ['git', ['clone', '--quiet', 'https://github.com/jbhirsh/ci', besideClone]],
      [process.execPath, [cli, 'a.ts']],
    ]);
  });

  it('fails without running anything more when the clone fails', () => {
    given([], { clone: 128 });

    expect(main(['a.ts'], {})).toBe(1);

    expect(console.error).toHaveBeenCalledWith(`gif: couldn't clone jbhirsh/ci into ${besideClone}`);
    expect(commands()).toEqual([['git', ['clone', '--quiet', 'https://github.com/jbhirsh/ci', besideClone]]]);
  });

  it('runs the clone CI_TOOLING_DIR names as it is, with no git', () => {
    const other = path.resolve('elsewhere/ci');
    const otherCli = path.join(other, 'gif', 'cli.mjs');
    given([otherCli], { tool: 2 });

    expect(main(['a.ts'], { CI_TOOLING_DIR: 'elsewhere/ci' })).toBe(2);

    expect(commands()).toEqual([[process.execPath, [otherCli, 'a.ts']]]);
    expect(spawnSync.mock.calls[0][2].env).toEqual({ CI_TOOLING_DIR: 'elsewhere/ci', APP_ROOT: root });
  });

  it('fails when the clone has no GIF tool, without running it', () => {
    given([], {});

    expect(main(['a.ts'], { CI_TOOLING_DIR: '/tmp/not-ci' })).toBe(1);

    expect(console.error).toHaveBeenCalledWith(
      `gif: ${path.join('/tmp/not-ci', 'gif', 'cli.mjs')} isn't there: is /tmp/not-ci a clone of jbhirsh/ci?`,
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('fails when the tool ends with no status (killed by a signal)', () => {
    given([cli], { tool: null });

    expect(main([], { CI_TOOLING_DIR: besideClone })).toBe(1);
  });

  it('reads CI_TOOLING_DIR from the process environment by default', () => {
    vi.stubEnv('CI_TOOLING_DIR', '/tmp/from-env');
    given([path.join('/tmp/from-env', 'gif', 'cli.mjs')]);

    expect(main(['a.ts'])).toBe(0);

    expect(commands()).toEqual([[process.execPath, [path.join('/tmp/from-env', 'gif', 'cli.mjs'), 'a.ts']]]);
  });
});

// Records a PR's before/after GIFs in one command:
//
//   npm run pr-gif -- <scenario.ts> [--name <dir>] [--base <ref>] [--after-only]
//                     [--side-by-side] [--width <px>] [--fps <n>] [--fixtures]
//                     [--keep] [--publish]
//
// It builds the app twice, from <ref> (origin/main by default, checked out
// in a temporary worktree sharing this node_modules) and from this working
// tree, uncommitted changes included. Each build is served with `vite
// preview`, the scenario is played against it in Chromium with the pointer
// and key presses drawn in (scripts/pr-gif.ts), and the GIFs land in
// pr-gif/<name>/ (gitignored): before.gif and after.gif, or one
// side-by-side.gif with --side-by-side.
//   - --after-only skips the base, for UI that is new.
//   - The window is the scenario's, or a phone's (402 × 874, the newest iPhone Pro's screen), as the site is
//     designed phone first.
//   - Width: each GIF is the scenario's width, or the window's up to 700; a
//     side-by-side one is two of those, each up to 496. --width overrides
//     either.
//   - --fps caps the frame rate, 15 by default. A GIF over 5 MB, which a PR
//     may not show, is warned of: fewer frames or a narrower GIF is the cure.
//   - --keep keeps the work directory (the builds and frames) to look at.
//   - --publish commits the GIFs to the pr-screenshots branch, pushes it, and
//     prints the Markdown for the PR's "Visual changes", linked by that
//     commit's SHA so a later push can't change what the PR shows.
//
// The page looks as it does on the live site: the wishlist and its votes
// are the live site's (LIVE, read with GETs only), the BoardGameGeek art is
// loaded, and recording waits for the pictures in view. Nothing is sent to
// it: any other API call is stubbed (not signed in; a POST is refused
// unless the scenario's setup routes it). --fixtures stubs the reads too,
// with nothing on the wishlist, for a recording that can't change with the
// live data.
//
// A scenario is a module whose default export is a Scenario (pr-gif.ts):
// the page, the clip, and what to do. scripts/pr-gif-example.ts is one. The
// browser is Playwright's Chromium, or PLAYWRIGHT_CHROMIUM_EXECUTABLE.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page, type Request } from '@playwright/test';
import { framesToGif, recordFrames, showPointer, sideBySide, waitForPictures, type Scenario } from './pr-gif.ts';
import { PHONE, defaultWidth, markdown, parseOptions, repoFromRemote, type Options } from './record-pr-gif-options.ts';

const ROOT = resolve(import.meta.dirname, '..');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/** The live site, whose wishlist and votes the recordings show (smoke.yml's TARGET_URL). */
const LIVE = 'https://board-games-silk.vercel.app';

function git(args: string[], cwd = ROOT): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Builds the app at `cwd` into `outDir`, without the Sentry source-map upload a token in the shell would set off. */
function build(cwd: string, outDir: string): void {
  console.log(`pr-gif: building ${cwd === ROOT ? 'this working tree' : 'the base'}`);
  const env = { ...process.env };
  delete env.SENTRY_AUTH_TOKEN;
  execFileSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd,
    env,
    stdio: 'inherit',
  });
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

/** Serves a build with `vite preview` (added to `servers`, to be stopped) and resolves with its origin once it answers. */
async function serve(outDir: string, servers: ChildProcess[]): Promise<string> {
  const port = await freePort();
  const server = spawn(
    process.execPath,
    [VITE, 'preview', '--outDir', outDir, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: ROOT,
      stdio: 'ignore',
    },
  );
  servers.push(server);
  const origin = `http://127.0.0.1:${port}`;
  for (let tries = 0; tries < 100; tries++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited with ${server.exitCode}`);
    try {
      if ((await fetch(origin)).ok) return origin;
    } catch {
      // Not listening yet.
    }
    await new Promise((wait) => setTimeout(wait, 200));
  }
  throw new Error(`vite preview didn't answer on ${origin}`);
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/** The GraphQL operation a request to /api/graphql names, and its variables. */
function operation(request: Request): { name: string; variables: Record<string, unknown> } | null {
  const body: unknown = request.method() === 'POST' ? request.postDataJSON() : null;
  if (typeof body !== 'object' || body === null || !('operationName' in body)) return null;
  const { operationName, variables }: { operationName?: unknown; variables?: unknown } = body;
  if (typeof operationName !== 'string') return null;
  return {
    name: operationName,
    variables: typeof variables === 'object' && variables !== null ? { ...variables } : {},
  };
}

/** The reads a recording takes from the live site: the wishlist's suggestions and vote counts. */
const LIVE_READS = new Set(['Suggestions', 'WishlistVotes']);

/**
 * The app's API (GraphQL at /api/graphql, answered by operation name).
 * Playwright tries the newest route first, so the catch-alls go in first and
 * a scenario's own routes, added after these, win.
 *   - Off this origin, only pictures load (the BoardGameGeek art), unless
 *     `fixtures`; anything else is aborted. They're fetched from Node rather
 *     than by the browser: BoardGameGeek's image server answers headless
 *     Chromium with a 400, where it serves Node the same request, and a
 *     blank box isn't what the page shows.
 *   - The wishlist and its vote counts are read from the live site, unless
 *     `fixtures` (or the live site can't be reached, which it warns of):
 *     then nothing is on the wishlist and every count is 0.
 *   - Not signed in. Any other operation (a vote, a suggestion) is refused.
 */
async function stubApi(page: Page, origin: string, fixtures: boolean): Promise<void> {
  const api = (url: URL) => url.origin === origin && url.pathname === '/api/graphql';
  await page.route(
    (url) => url.origin !== origin,
    async (route) => {
      if (fixtures || route.request().resourceType() !== 'image') return route.abort('blockedbyclient');
      try {
        return await route.fulfill({ response: await route.fetch() });
      } catch {
        return route.abort('failed');
      }
    },
  );
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ status: 501 }),
  );
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith('/_vercel/'),
    (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.route(api, (route) => {
    const op = operation(route.request());
    if (op?.name === 'Session') return route.fulfill(json({ data: { session: { admin: false } } }));
    if (op?.name === 'Suggestions') return route.fulfill(json({ data: { suggestions: [] } }));
    if (op?.name === 'WishlistVotes') {
      const ids = Array.isArray(op.variables.ids) ? op.variables.ids : [];
      return route.fulfill(
        json({ data: { wishlistVotes: { counts: ids.map((id: unknown) => ({ id, count: 0 })), myVotes: [] } } }),
      );
    }
    return route.fallback();
  });
  if (fixtures) return;
  let warned = false;
  await page.route(api, async (route) => {
    const op = operation(route.request());
    if (!op || !LIVE_READS.has(op.name)) return route.fallback();
    try {
      const response = await route.fetch({ url: `${LIVE}/api/graphql` });
      if (response.ok()) return await route.fulfill({ response });
    } catch {
      // Out of reach: the stub's empty answer.
    }
    // Said once, so a recording that isn't of the live data is never taken for it.
    if (!warned)
      console.warn(`pr-gif: ${LIVE} didn't answer ${op.name}, so this recording shows the stub's empty wishlist`);
    warned = true;
    return route.fallback();
  });
}

/** Plays the scenario against the app at `origin`, leaving its frames in `dir`. */
async function record(
  browser: Browser,
  scenario: Scenario,
  origin: string,
  dir: string,
  options: Options,
): Promise<void> {
  const context = await browser.newContext({
    viewport: scenario.viewport ?? PHONE,
    // Chrome's screencast sends frames at 1×, whatever the scale factor.
    deviceScaleFactor: 1,
    colorScheme: scenario.colorScheme ?? 'light',
    reducedMotion: 'no-preference',
    // A service worker answers requests before page.route sees them.
    serviceWorkers: 'block',
  });
  try {
    await showPointer(context);
    const page = await context.newPage();
    await stubApi(page, origin, options.fixtures);
    await scenario.setup?.(page);
    await page.goto(origin + (scenario.path ?? '/'));
    await scenario.ready?.(page);
    await waitForPictures(page);
    const clip = typeof scenario.clip === 'function' ? await scenario.clip(page) : scenario.clip;
    const stop = await recordFrames(page, clip, dir, { fps: options.fps });
    try {
      await scenario.play(page);
    } finally {
      const { sent, stills, seconds } = await stop();
      console.log(`pr-gif: ${sent} frames painted over ${seconds.toFixed(1)} s, ${stills} kept`);
    }
  } finally {
    await context.close();
  }
}

/** Commits the GIFs to pr-screenshots under `name` (in a worktree added to `trees`, to be removed), pushes, and returns that commit. */
function publish(gifs: string[], name: string, work: string, trees: string[]): string {
  git(['fetch', '--quiet', 'origin', 'pr-screenshots']);
  const shots = join(work, 'pr-screenshots');
  git(['worktree', 'add', '--quiet', '--detach', shots, 'origin/pr-screenshots']);
  trees.push(shots);
  mkdirSync(join(shots, name), { recursive: true });
  for (const gif of gifs) cpSync(gif, join(shots, name, basename(gif)));
  git(['add', ...gifs.map((gif) => `${name}/${basename(gif)}`)], shots);
  git(['commit', '--quiet', '-m', `Add ${name} GIFs`], shots);
  git(['push', '--quiet', 'origin', 'HEAD:pr-screenshots'], shots);
  return git(['rev-parse', 'HEAD'], shots);
}

/** Fails before any building if ffmpeg, or the drawtext filter a side-by-side GIF's labels need, is missing. */
function checkFfmpeg(sideBySide: boolean): void {
  let filters: string;
  try {
    filters = execFileSync('ffmpeg', ['-hide_banner', '-filters'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    throw new Error('pr-gif needs ffmpeg on the PATH', { cause: error });
  }
  if (sideBySide && !/\sdrawtext\s/.test(filters)) {
    throw new Error(
      "this ffmpeg has no drawtext filter (it's built without libfreetype), which --side-by-side labels with",
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  checkFfmpeg(options.sideBySide);
  const scenario = ((await import(pathToFileURL(resolve(options.scenario)).href)) as { default: Scenario }).default;
  // Before anything is pushed, so a remote it can't read stops the run first.
  const repo = options.publish ? repoFromRemote(git(['remote', 'get-url', 'origin'])) : '';
  const out = join(ROOT, 'pr-gif', options.name);
  mkdirSync(out, { recursive: true });

  const work = mkdtempSync(join(tmpdir(), 'pr-gif-'));
  const servers: ChildProcess[] = [];
  const trees: string[] = [];
  let browser: Browser | undefined;
  // Each step on its own, so one that fails can't keep the rest from running
  // or hide the error that stopped the run. Started once: a second call (the
  // finally below, after an interruption) waits for the first to finish.
  let cleaning: Promise<void> | undefined;
  const cleanUp = () =>
    (cleaning ??= (async () => {
      for (const server of servers) server.kill();
      await browser?.close().catch(() => {});
      for (const tree of trees) {
        try {
          git(['worktree', 'remove', '--force', tree]);
        } catch {
          // Gone already.
        }
      }
      if (options.keep) console.log(`pr-gif: kept ${work}`);
      else rmSync(work, { recursive: true, force: true });
    })());
  // Interrupted, the run may not reach the finally below: clean up here, and
  // exit once that's done. What the interruption breaks on its way out (a
  // page closed under a step) is no news.
  const interrupted = (signal: NodeJS.Signals) => {
    stopping = true;
    void cleanUp().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const sides: { side: 'before' | 'after'; dist: string }[] = [];
    if (!options.afterOnly) {
      const [remote, ...branch] = options.base.split('/');
      if (branch.length > 0) {
        try {
          git(['fetch', '--quiet', remote, branch.join('/')]);
        } catch {
          console.warn(`pr-gif: couldn't fetch ${options.base}; using the copy here`);
        }
      }
      const base = join(work, 'base');
      git(['worktree', 'add', '--quiet', '--detach', base, options.base]);
      trees.push(base);
      symlinkSync(join(ROOT, 'node_modules'), join(base, 'node_modules'));
      build(base, join(work, 'before'));
      sides.push({ side: 'before', dist: join(work, 'before') });
    }
    build(ROOT, join(work, 'after'));
    sides.push({ side: 'after', dist: join(work, 'after') });

    // Ctrl-C is this script's to handle: Playwright's own would close the
    // browser under the cleanup above.
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      handleSIGINT: false,
      handleSIGTERM: false,
    });
    for (const { side, dist } of sides) {
      const origin = await serve(dist, servers);
      console.log(`pr-gif: recording ${side}`);
      await record(browser, scenario, origin, join(work, `frames-${side}`), options);
      servers.pop()!.kill();
    }

    const gifs: string[] = [];
    if (options.sideBySide) {
      gifs.push(join(out, 'side-by-side.gif'));
      const width = options.width ?? defaultWidth((scenario.viewport ?? PHONE).width, true);
      sideBySide(join(work, 'frames-before'), join(work, 'frames-after'), gifs[0], { width });
    } else {
      for (const { side } of sides) {
        gifs.push(join(out, `${side}.gif`));
        const width = options.width ?? scenario.width ?? defaultWidth((scenario.viewport ?? PHONE).width, false);
        framesToGif(join(work, `frames-${side}`), gifs.at(-1)!, { width });
      }
    }
    for (const gif of gifs) {
      const mb = statSync(gif).size / 1e6;
      console.log(`pr-gif: wrote ${gif} (${mb.toFixed(1)} MB)`);
      if (mb > 5)
        console.warn(
          'pr-gif: over 5 MB, which a PR may not show: try a lower --fps, a narrower --width or a shorter scenario',
        );
    }
    console.log('pr-gif: look through them before publishing.');

    if (options.publish) {
      const sha = publish(gifs, options.name, work, trees);
      console.log(
        `\nFor the PR description:\n\n${markdown({ repo, sha, name: options.name, gifs: gifs.map((gif) => basename(gif)) })}\n`,
      );
    }
  } finally {
    await cleanUp();
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

let stopping = false;
await main().catch((error: unknown) => {
  if (!stopping) throw error;
});

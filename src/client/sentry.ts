// Error reporting, with Sentry's SDK (src/instrument.ts) loaded once the page
// is up rather than in the main bundle: it was the largest part of it, ahead
// of React. Report through here, never '@sentry/react' directly, or the SDK
// is pulled back into the bundle every visit downloads (vite.config.ts fails
// the build if it is).
//   - startSentry(), run before the app's own modules (src/startSentry.ts),
//     catches uncaught errors and rejections, and fetches the SDK when the
//     browser is next idle (after the first render, which it comes before;
//     a few seconds on at most), or at once on the first report, so a page
//     in trouble isn't kept waiting.
//   - What happens before the SDK is in, a report or an uncaught error, is
//     queued and sent once it is, the uncaught ones marked unhandled as
//     Sentry's own handlers would; from then on its handlers take over.
//   - The SDK's breadcrumbs (clicks, fetches, console) start when it does,
//     so an error in the first moments carries fewer of them, and the page
//     load's trace is measured from the navigation's timings, which the
//     browser keeps.
//   - Without a DSN (dev, tests, a preview without one) nothing loads and
//     every report is dropped. A failed fetch of the SDK (offline, or a newer
//     deploy replaced its chunk) keeps the queue for a report to try again,
//     once 10 seconds have passed: an error repeating every frame mustn't
//     fetch every frame. The queue keeps the first 20 reports, the ones most
//     likely to say what went wrong, and drops any after.

type Sdk = Pick<typeof import('../instrument'), 'captureException' | 'captureMessage'>;
type Report = (sdk: Sdk) => void;

// How long the SDK waits for the browser to be idle before loading anyway.
const IDLE_WAIT_MS = 3000;
// How long after a failed fetch of the SDK before another is tried.
const RETRY_MS = 10_000;
// The most reports kept while the SDK isn't in.
const MAX_QUEUED = 20;

let started = false;
const queue: Report[] = [];
let sdk: Sdk | undefined;
let loading: Promise<void> | undefined;
let failedAt = -Infinity;

function onError(event: ErrorEvent): void {
  const error: unknown = event.error ?? event.message;
  report((s) => s.captureException(error, { mechanism: { handled: false, type: 'auto.browser.global_handlers.onerror' } }));
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason;
  report((s) => s.captureException(reason, { mechanism: { handled: false, type: 'auto.browser.global_handlers.onunhandledrejection' } }));
}

/** Fetches the SDK, once, and sends what was queued; not again soon after a failure. */
function load(): Promise<void> {
  if (!loading && Date.now() - failedAt < RETRY_MS) return Promise.resolve();
  loading ??= import('../instrument').then(
    (module) => {
      sdk = module;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      for (const send of queue.splice(0)) send(module);
    },
    () => {
      loading = undefined;
      failedAt = Date.now();
    },
  );
  return loading;
}

function report(send: Report): void {
  if (sdk) send(sdk);
  else if (started) {
    if (queue.length < MAX_QUEUED) queue.push(send);
    void load();
  }
}

/**
 * Starts error reporting: catches uncaught errors until the SDK is in, and
 * schedules its loading. Nothing without a DSN.
 */
export function startSentry(dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN): void {
  if (!dsn || started) return;
  started = true;
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: IDLE_WAIT_MS });
  else setTimeout(() => void load(), IDLE_WAIT_MS);
}

/** Reports an error caught by the app: Sentry's captureException. */
export function captureException(error: unknown, context?: Parameters<Sdk['captureException']>[1]): void {
  report((s) => s.captureException(error, context));
}

/** Reports something gone wrong that isn't an error thrown: Sentry's captureMessage. */
export function captureMessage(message: string, context?: Parameters<Sdk['captureMessage']>[1]): void {
  report((s) => s.captureMessage(message, context));
}

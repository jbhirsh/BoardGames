import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";

type Replay = ReturnType<typeof import("./sentryReplay").replayIntegration>;

/** The replay integration, once added. */
let replay: Replay | undefined;
let loading: Promise<void> | undefined;

// How long an error event waits for replay to load, so it can carry the
// replay's id, before it goes without.
const REPLAY_WAIT_MS = 3000;
// Replay's own limits: a session idle this long, or running this long, is
// over and won't be continued.
const REPLAY_IDLE_MS = 15 * 60 * 1000;
const REPLAY_MAX_MS = 60 * 60 * 1000;

/**
 * Session replay, fetched (from our own origin, src/sentryReplay.ts) and
 * added once, on the first error, so only sessions that hit an error are
 * recorded and the replay code isn't in the main bundle.
 *
 * Added after init with replaysOnErrorSampleRate set, replay starts in
 * buffer mode, which would send only if a further error followed. flush()
 * sends what it has and switches to session mode (start() does nothing
 * while buffering), so the rest of the session is recorded. The cost:
 * replay records only from the moment it loads, so it never shows the
 * lead-up to the first error. Loading it at start-up would catch that, but
 * put rrweb back in every visit's bundle.
 *
 * Without a DSN nothing is sent, so nothing is recorded either.
 */
export function loadReplay(): Promise<void> {
  if (!Sentry.getClient()?.getDsn()) return Promise.resolve();
  loading ??= import("./sentryReplay").then(
    ({ replayIntegration }) => {
      // Replay allows one instance a page, so once constructed it is never
      // tried again, whatever fails from here.
      try {
        const integration = replayIntegration();
        Sentry.addIntegration(integration);
        replay = integration;
        integration.flush().catch(() => {});
      } catch {
        // Go without.
      }
    },
    // Offline, or a newer deploy has replaced the chunk: go without, and
    // let a later error try again.
    () => { loading = undefined },
  );
  return loading;
}

/**
 * An event at error level or above (Sentry's default when none is set), an
 * exception or a message; not a warning. Not "has an exception": the SDK
 * attaches a stack to messages too, as a synthetic exception.
 */
function startsReplay(event: ErrorEvent): boolean {
  const level = event.level ?? "error";
  return level === "error" || level === "fatal";
}

/**
 * A replay this tab was recording before a reload (replay keeps its session
 * in sessionStorage): load replay again so the recording carries on.
 */
function resumeReplay(): void {
  try {
    const session = JSON.parse(sessionStorage.getItem("sentryReplaySession") ?? "null") as
      { segmentId?: number; lastActivity?: number; started?: number } | null;
    const now = Date.now();
    if (session && (session.segmentId ?? 0) > 0
      && now - (session.lastActivity ?? 0) < REPLAY_IDLE_MS
      && now - (session.started ?? 0) < REPLAY_MAX_MS) {
      void loadReplay();
    }
  } catch {
    // No sessionStorage, or nothing readable in it.
  }
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Called for error events only, never for transactions. The one that
  // starts replay waits for it (briefly), so it is linked to the replay.
  async beforeSend(event) {
    if (!startsReplay(event)) return event;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      loadReplay(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, REPLAY_WAIT_MS) }),
    ]);
    clearTimeout(timer);
    const replayId = replay?.getReplayId();
    if (replayId) event.tags = { ...event.tags, replayId };
    return event;
  },
});

resumeReplay();

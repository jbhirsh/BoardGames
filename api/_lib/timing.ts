// Where a request's time goes, read straight off its response: each phase
// timed with phase() during the request is written into the response's
// `Server-Timing` header (api/graphql.ts), so `curl -i` or the browser's
// dev tools show it, and jbhirsh/ci's probe (jbhirsh/ci#151) reads it on
// each deployment (#354).
//
// An instance's first API request also carries `cold`, and `loaded`: the
// time from the process's start to the end of loading the function's
// modules (markLoaded(), called once at load). Which request is first
// isn't known in advance (Vercel's own health check may start the instance
// before any of ours), so the flag, not the request's order, says what was
// cold. Requests that arrive while the first is still starting (Fluid
// compute shares an instance) aren't cold themselves, and the first-use
// work they wait on (the database opening) is timed only in the request
// that started it.
//
// Imports only Node's own modules: no Sentry yet (#354's later PR makes
// each phase a span too), nothing of the app's.

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

/** One timed phase of a request. */
export interface Phase {
  name: string;
  ms: number;
}

/** What a response's `Server-Timing` says. */
export interface Timing {
  /** Whether this was the instance's first API request. */
  cold: boolean;
  /** On a cold request, the time from process start to the end of loading. */
  loadedMs?: number;
  phases: readonly Phase[];
  /** The request's time so far: when headers go out, everything before them. */
  totalMs: number;
}

const store = new AsyncLocalStorage<Phase[]>();
let loadedAt: number | undefined;
let served = false;

/** Notes that the function's modules have loaded: call once, at the end of the entry's module body. */
export function markLoaded(now: number = performance.now()): void {
  loadedAt ??= now;
}

/**
 * Runs one request with a fresh list of phases, and returns what its
 * `Server-Timing` should say so far. The returned function may be called
 * more than once (when headers go out, which can be before the work ends):
 * each call reads the phases recorded by then.
 */
export function timeRequest<T>(work: (timing: () => Timing) => Promise<T>): Promise<T> {
  const phases: Phase[] = [];
  const cold = !served;
  served = true;
  const start = performance.now();
  const timing = (): Timing => ({
    cold,
    ...(cold && loadedAt !== undefined ? { loadedMs: loadedAt } : {}),
    phases,
    totalMs: performance.now() - start,
  });
  return store.run(phases, () => work(timing));
}

/**
 * Times `work` as the phase `name` of the request it runs in, and passes
 * its result or error through. Outside a request it only runs the work.
 */
export async function phase<T>(name: string, work: () => Promise<T> | T): Promise<T> {
  const phases = store.getStore();
  const start = performance.now();
  try {
    return await work();
  } finally {
    phases?.push({ name, ms: performance.now() - start });
  }
}

/** phase() for work that doesn't wait: times it and returns its result as it is. */
export function phaseSync<T>(name: string, work: () => T): T {
  const phases = store.getStore();
  const start = performance.now();
  try {
    return work();
  } finally {
    phases?.push({ name, ms: performance.now() - start });
  }
}

// A header field's metric name is an RFC 9110 token.
const NOT_TOKEN = /[^!#$%&'*+.^_`|~0-9A-Za-z-]/g;

/**
 * A phase name as a `Server-Timing` metric name: anything but a token
 * character becomes `-`. The names are this function's own literals; this
 * keeps the header's syntax whatever one is renamed to.
 */
export function metricName(name: string): string {
  return name.replace(NOT_TOKEN, '-') || '-';
}

/** A duration as the header writes it: milliseconds to one decimal, never negative or not a number. */
export function durationText(ms: number): string {
  return Number.isFinite(ms) && ms > 0 ? String(Math.round(ms * 10) / 10) : '0';
}

/**
 * The `Server-Timing` header for a request's timing: `cold, loaded;dur=…`
 * first when cold, then each phase in the order it ended, then `total`.
 */
export function serverTimingHeader({ cold, loadedMs, phases, totalMs }: Timing): string {
  const entries: string[] = [];
  if (cold) entries.push('cold');
  if (cold && loadedMs !== undefined) entries.push(`loaded;dur=${durationText(loadedMs)}`);
  for (const { name, ms } of phases) entries.push(`${metricName(name)};dur=${durationText(ms)}`);
  entries.push(`total;dur=${durationText(totalMs)}`);
  return entries.join(', ');
}

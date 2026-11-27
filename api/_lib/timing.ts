// Where a request's time goes, read straight off its response: each phase
// timed with phase() during the request, and each GraphQL field that did
// work, are written into the response's `Server-Timing` header
// (api/graphql.ts), so `curl -i` or the browser's dev tools show it, and
// jbhirsh/ci's probe (jbhirsh/ci#151) reads it on each deployment (#354).
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
// Fields are timed by timeField(), which api/_resolvers/index.ts wraps
// around every field with a resolver of its own when it builds the schema
// (GraphQL's own `graphql:resolve` events aren't used: Yoga executes with
// @graphql-tools/executor, which never publishes them). A plain property
// read has no resolver, so it never shows. A field resolved once per
// list item is added up by its path without the item numbers
// (`games.wishlist.0.votes` and `games.wishlist.1.votes` are one entry),
// with how many times it ran and its slowest call, so a list that makes one
// database call per item (the N+1 shape) shows as one large entry. The
// header carries every root field and up to FIELDS_SHOWN others of at least
// FIELD_SHOWN_MS in all, slowest first, each named by at most
// FIELD_NAME_LENGTH characters: a path holds the client's own aliases,
// which GraphQL lets be any length, and the number of root fields is held
// by limits.ts's cap on aliases, so a large query can't swell the header.
// Paths and type names are GraphQL names (the parser accepts nothing else),
// and no field's arguments or value is ever read.
//
// Each phase also records when it started, and each field when its first
// call started, in ms from the request's start (timeRequest()), so the
// probe's waterfall can place them and show what ran side by side: fields
// resolved together start together. The header writes it as `start=`, to
// one decimal; a field that ran more than once also has `span=`, from its
// first call's start to its last call's end. A part is recorded when it
// ends, on a clock that only moves forward, so neither reaches past the
// request's `total`. `loaded` has none: it ends before the request starts.
//
// Imports only Node's own modules: no Sentry yet (#354's later PR makes
// each phase a span too), nothing of the app's.

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

/** One timed phase of a request. */
export interface Phase {
  name: string;
  ms: number;
  /** When it started, in ms from the request's start: phase() always records it. */
  startMs?: number;
}

/** One field's time in a request, added up across the times it ran. */
export interface FieldTime {
  /** Its response path without list item numbers, such as `games.wishlist.votes`. */
  path: string;
  /** The schema's `Type.field`, such as `Games.wishlist`. */
  label: string;
  ms: number;
  calls: number;
  slowestMs: number;
  /** When its first call started, in ms from the request's start: timeField() always records it. */
  startMs?: number;
  /**
   * From its first call's start to its last call's end, with startMs: less
   * than `ms` when calls ran side by side (a list's items resolving
   * together), as `ms` adds every call up.
   */
  spanMs?: number;
}

/** What a response's `Server-Timing` says. */
export interface Timing {
  /** Whether this was the instance's first API request. */
  cold: boolean;
  /** On a cold request, the time from process start to the end of loading. */
  loadedMs?: number;
  phases: readonly Phase[];
  /** The fields the header shows: every root field, then the slowest others (fieldsShown). */
  fields: readonly FieldTime[];
  /** The request's time so far: when headers go out, everything before them. */
  totalMs: number;
}

/** How many fields besides the root ones a header shows, at most. */
export const FIELDS_SHOWN = 10;
/** A field besides a root one shows once its time in a request reaches this. */
export const FIELD_SHOWN_MS = 1;
/** The most characters a field's entry name (`field.<path>`) takes in the header. */
export const FIELD_NAME_LENGTH = 64;

interface Request {
  /** When it started, on performance.now()'s clock. */
  start: number;
  phases: Phase[];
  fields: Map<string, FieldTime>;
}

const store = new AsyncLocalStorage<Request>();
let loadedAt: number | undefined;
let served = false;

/** Notes that the function's modules have loaded: call once, at the end of the entry's module body. */
export function markLoaded(now: number = performance.now()): void {
  loadedAt ??= now;
}

/**
 * Runs one request with a fresh list of phases and fields, and returns what
 * its `Server-Timing` should say so far. The returned function may be called
 * more than once (when headers go out, which can be before the work ends):
 * each call reads what was recorded by then.
 */
export function timeRequest<T>(work: (timing: () => Timing) => Promise<T>): Promise<T> {
  const start = performance.now();
  const request: Request = { start, phases: [], fields: new Map() };
  const cold = !served;
  served = true;
  const timing = (): Timing => ({
    cold,
    ...(cold && loadedAt !== undefined ? { loadedMs: loadedAt } : {}),
    phases: request.phases,
    fields: fieldsShown([...request.fields.values()]),
    totalMs: performance.now() - start,
  });
  return store.run(request, () => work(timing));
}

/**
 * Times `work` as the phase `name` of the request it runs in, and passes
 * its result or error through. Outside a request it only runs the work.
 */
export async function phase<T>(name: string, work: () => Promise<T> | T): Promise<T> {
  const request = store.getStore();
  const start = performance.now();
  try {
    return await work();
  } finally {
    request?.phases.push({ name, ms: performance.now() - start, startMs: start - request.start });
  }
}

/** phase() for work that doesn't wait: times it and returns its result as it is. */
export function phaseSync<T>(name: string, work: () => T): T {
  const request = store.getStore();
  const start = performance.now();
  try {
    return work();
  } finally {
    request?.phases.push({ name, ms: performance.now() - start, startMs: start - request.start });
  }
}

/** A field's response path as the header names it: its list item numbers dropped. */
export function fieldPath(responsePath: string): string {
  return responsePath
    .split('.')
    .filter((key) => !/^\d+$/.test(key))
    .join('.');
}

/**
 * Adds one call of a field to a request's totals. Calls are added as they
 * end, which isn't the order they started, so the field keeps the earliest
 * start and the latest end of any call, as its start and span.
 */
export function addFieldCall(
  fields: Map<string, FieldTime>,
  call: { responsePath: string; label: string; ms: number; startMs?: number },
): void {
  const path = fieldPath(call.responsePath);
  const known = fields.get(path);
  if (known) {
    known.ms += call.ms;
    known.calls += 1;
    known.slowestMs = Math.max(known.slowestMs, call.ms);
    if (call.startMs !== undefined && known.startMs !== undefined && known.spanMs !== undefined) {
      const endMs = Math.max(known.startMs + known.spanMs, call.startMs + call.ms);
      known.startMs = Math.min(known.startMs, call.startMs);
      known.spanMs = endMs - known.startMs;
    }
  } else {
    const startMs = call.startMs === undefined ? {} : { startMs: call.startMs, spanMs: call.ms };
    fields.set(path, { path, label: call.label, ms: call.ms, calls: 1, slowestMs: call.ms, ...startMs });
  }
}

/** The fields a header shows: every root field, then up to FIELDS_SHOWN others of at least FIELD_SHOWN_MS, slowest first. */
export function fieldsShown(fields: readonly FieldTime[]): FieldTime[] {
  const isRoot = (field: FieldTime) => !field.path.includes('.');
  const others = fields
    .filter((field) => !isRoot(field) && field.ms >= FIELD_SHOWN_MS)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, FIELDS_SHOWN);
  return [...fields.filter(isRoot), ...others];
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

/**
 * Times one call of a field as part of the request it runs in, whether its
 * resolver answers at once or with a promise, and passes its result or
 * error through. Outside a request it only runs the resolver.
 */
export function timeField<T>(label: string, responsePath: string, resolve: () => T): T {
  const request = store.getStore();
  if (!request) return resolve();
  const start = performance.now();
  const done = () =>
    addFieldCall(request.fields, {
      responsePath,
      label,
      ms: performance.now() - start,
      startMs: start - request.start,
    });
  let result: T;
  try {
    result = resolve();
  } catch (err) {
    done();
    throw err;
  }
  // Any thenable counts: a resolver may hand back a query builder unawaited.
  if (!isThenable(result)) {
    done();
    return result;
  }
  return Promise.resolve(result).then(
    (value: unknown) => {
      done();
      return value;
    },
    (err: unknown) => {
      done();
      throw err;
    },
  ) as T;
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
 * first when cold, then each phase in the order it ended, as
 * `<name>;dur=…;start=…`, then each field shown as
 * `field.<path>;dur=…;desc="<Type.field>";calls=…` (and `;slowest=…;span=…`
 * when it ran more than once) and `;start=…`, then `total`. A repeated
 * field's `dur` adds up its calls, which shows what a list's N+1 calls
 * cost; its `span`, first start to last end, is where it sits in the
 * request's time. The counts are parameters of their own, not words in
 * `desc`, so a comma never appears inside an entry for a reader that splits
 * entries at commas. Browsers show only `dur` and `desc`, so the counts,
 * spans and starts are for raw readers such as the probe.
 */
export function serverTimingHeader({ cold, loadedMs, phases, fields, totalMs }: Timing): string {
  const entries: string[] = [];
  const startText = (startMs: number | undefined) => (startMs === undefined ? '' : `;start=${durationText(startMs)}`);
  if (cold) entries.push('cold');
  if (cold && loadedMs !== undefined) entries.push(`loaded;dur=${durationText(loadedMs)}`);
  for (const { name, ms, startMs } of phases) {
    entries.push(`${metricName(name)};dur=${durationText(ms)}${startText(startMs)}`);
  }
  for (const { path, label, ms, calls, slowestMs, startMs, spanMs } of fields) {
    const span = calls > 1 && spanMs !== undefined ? `;span=${durationText(spanMs)}` : '';
    const slowest = calls > 1 ? `;slowest=${durationText(slowestMs)}${span}` : '';
    const name = metricName(`field.${path}`).slice(0, FIELD_NAME_LENGTH);
    entries.push(`${name};dur=${durationText(ms)};desc="${label}";calls=${calls}${slowest}${startText(startMs)}`);
  }
  entries.push(`total;dur=${durationText(totalMs)}`);
  return entries.join(', ');
}

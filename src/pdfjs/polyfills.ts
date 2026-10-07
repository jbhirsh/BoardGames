// pdf.js's modern build calls a few JavaScript methods newer than many
// phones' browsers. These stand in for exactly those, and only where a
// browser doesn't have them; the page and pdf.js's worker both import this.

type Upsert = {
  has(key: unknown): boolean;
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
};

export function getOrInsert(this: Upsert, key: unknown, value: unknown): unknown {
  if (!this.has(key)) this.set(key, value);
  return this.get(key);
}

export function getOrInsertComputed(this: Upsert, key: unknown, compute: (key: unknown) => unknown): unknown {
  if (!this.has(key)) this.set(key, compute(key));
  return this.get(key);
}

/**
 * Neumaier summation: compensates for the rounding a plain sum loses. Not
 * exact to the spec at the edges (Infinity, overflow, -0), which pdf.js never
 * reaches: it sums lengths and widths.
 */
export function sumPrecise(values: Iterable<number>): number {
  let sum = 0;
  let lost = 0;
  for (const x of values) {
    const t = sum + x;
    lost += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
    sum = t;
  }
  return sum + lost;
}

export function promiseTry<T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve) => resolve(fn(...args)));
}

export function urlParse(url: string | URL, base?: string | URL): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function toBase64(this: Uint8Array): string {
  let binary = '';
  for (const byte of this) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function toHex(this: Uint8Array): string {
  return Array.from(this, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function transferToFixedLength(this: ArrayBuffer, length = this.byteLength): ArrayBuffer {
  const copy = new Uint8Array(length);
  copy.set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
  return copy.buffer;
}

export async function bytes(this: Response | Blob): Promise<Uint8Array> {
  return new Uint8Array(await this.arrayBuffer());
}

export function intersection<T>(this: Set<T>, other: { has(value: T): boolean }): Set<T> {
  return new Set([...this].filter((value) => other.has(value)));
}

// Iterator helpers (iterator.filter(…).toArray() and the like), which pdf.js
// calls on Map and Set iterators. Before Safari 18.4 there is not even an
// Iterator global, and pdf.js reads Iterator.prototype as it loads.
type It = Iterator<unknown> & { [Symbol.iterator](): It };
type Fn = (value: unknown, index: number) => unknown;

function* map(this: It, fn: Fn) {
  let i = 0;
  for (const value of this) yield fn(value, i++);
}
function* filter(this: It, fn: Fn) {
  let i = 0;
  for (const value of this) if (fn(value, i++)) yield value;
}
function* flatMap(this: It, fn: (value: unknown, index: number) => Iterable<unknown>) {
  let i = 0;
  for (const value of this) yield* fn(value, i++);
}
function* take(this: It, limit: number) {
  if (limit <= 0) return;
  let left = limit;
  for (const value of this) {
    yield value;
    if (--left === 0) return;
  }
}
function* drop(this: It, count: number) {
  let left = count;
  for (const value of this) if (left > 0) left--; else yield value;
}

export const iteratorHelpers = {
  map,
  filter,
  flatMap,
  take,
  drop,
  toArray(this: It) {
    return [...this];
  },
  forEach(this: It, fn: Fn) {
    let i = 0;
    for (const value of this) fn(value, i++);
  },
  some(this: It, fn: Fn) {
    let i = 0;
    for (const value of this) if (fn(value, i++)) return true;
    return false;
  },
  every(this: It, fn: Fn) {
    let i = 0;
    for (const value of this) if (!fn(value, i++)) return false;
    return true;
  },
  find(this: It, fn: Fn) {
    let i = 0;
    for (const value of this) if (fn(value, i++)) return value;
    return undefined;
  },
};

function define(target: object, name: string, value: unknown) {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

define(Map.prototype, 'getOrInsert', getOrInsert);
define(Map.prototype, 'getOrInsertComputed', getOrInsertComputed);
define(WeakMap.prototype, 'getOrInsert', getOrInsert);
define(WeakMap.prototype, 'getOrInsertComputed', getOrInsertComputed);
define(Math, 'sumPrecise', sumPrecise);
define(Promise, 'try', promiseTry);
define(URL, 'parse', urlParse);
define(Uint8Array, 'fromBase64', fromBase64);
define(Uint8Array.prototype, 'toBase64', toBase64);
define(Uint8Array.prototype, 'toHex', toHex);
define(Promise, 'withResolvers', withResolvers);
define(ArrayBuffer.prototype, 'transferToFixedLength', transferToFixedLength);
define(Response.prototype, 'bytes', bytes);
define(Blob.prototype, 'bytes', bytes);
define(Set.prototype, 'intersection', intersection);

// The prototype every built-in iterator inherits from.
const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())) as object;
if (!('Iterator' in globalThis)) {
  function Iterator() {}
  Iterator.prototype = iteratorPrototype;
  define(globalThis, 'Iterator', Iterator);
}
for (const [name, fn] of Object.entries(iteratorHelpers)) define(iteratorPrototype, name, fn);

import { describe, it, expect } from 'vitest';
import {
  bytes, fromBase64, getOrInsert, getOrInsertComputed, intersection, iteratorHelpers, promiseTry, sumPrecise,
  toBase64, toHex, transferToFixedLength, urlParse, withResolvers,
} from '../pdfjs/polyfills';

describe('pdf.js polyfills', () => {
  it('installs each method where the runtime lacks it', () => {
    const has = (target: object, name: string) => typeof (target as Record<string, unknown>)[name];
    expect(has(Map.prototype, 'getOrInsertComputed')).toBe('function');
    expect(has(WeakMap.prototype, 'getOrInsert')).toBe('function');
    expect(has(Math, 'sumPrecise')).toBe('function');
    expect(has(Uint8Array, 'fromBase64')).toBe('function');
  });

  it('getOrInsert keeps an existing value and stores a missing one', () => {
    const map = new Map([['a', 1]]);
    expect(getOrInsert.call(map, 'a', 2)).toBe(1);
    expect(getOrInsert.call(map, 'b', 3)).toBe(3);
    expect(map.get('b')).toBe(3);
  });

  it('getOrInsertComputed computes only for a missing key', () => {
    const map = new WeakMap<object, number>();
    const key = {};
    let calls = 0;
    const compute = () => ++calls;
    expect(getOrInsertComputed.call(map, key, compute)).toBe(1);
    expect(getOrInsertComputed.call(map, key, compute)).toBe(1);
    expect(calls).toBe(1);
  });

  it('sumPrecise keeps what a plain sum rounds away', () => {
    expect(sumPrecise([1e20, 1, -1e20])).toBe(1);
    expect(sumPrecise([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumPrecise([])).toBe(0);
  });

  it('promiseTry resolves a value and rejects a throw', async () => {
    await expect(promiseTry((a) => (a as number) + 1, 1)).resolves.toBe(2);
    await expect(promiseTry(() => { throw new Error('no'); })).rejects.toThrow('no');
  });

  it('urlParse returns null instead of throwing', () => {
    expect(urlParse('/rules/x.pdf', 'https://example.com')?.href).toBe('https://example.com/rules/x.pdf');
    expect(urlParse('not a url')).toBeNull();
  });

  it('converts bytes to and from base64, and to hex', () => {
    const bytes = new Uint8Array([0, 15, 255, 72, 105]);
    const text = toBase64.call(bytes);
    expect(text).toBe('AA//SGk=');
    expect(Array.from(fromBase64(text))).toEqual([0, 15, 255, 72, 105]);
    expect(toHex.call(bytes)).toBe('000fff4869');
  });

  it('withResolvers hands out a promise and its settlers', async () => {
    const { promise, resolve } = withResolvers<number>();
    resolve(7);
    await expect(promise).resolves.toBe(7);
    const failing = withResolvers<number>();
    failing.reject(new Error('no'));
    await expect(failing.promise).rejects.toThrow('no');
  });

  it('transferToFixedLength copies into a buffer of the given length', () => {
    const source = new Uint8Array([1, 2, 3, 4]).buffer;
    expect([...new Uint8Array(transferToFixedLength.call(source, 2))]).toEqual([1, 2]);
    expect([...new Uint8Array(transferToFixedLength.call(source, 6))]).toEqual([1, 2, 3, 4, 0, 0]);
    expect(transferToFixedLength.call(source).byteLength).toBe(4);
  });

  it('bytes reads a body or blob as a Uint8Array', async () => {
    const blob = new Blob([new Uint8Array([5, 6])]);
    expect([...await bytes.call(blob)]).toEqual([5, 6]);
  });

  it('intersection keeps what both sets have', () => {
    expect([...intersection.call(new Set([1, 2, 3]), new Set([2, 3, 4]))]).toEqual([2, 3]);
  });

  it('gives iterators the helpers pdf.js calls on them', () => {
    const it = () => new Set([1, 2, 3, 4])[Symbol.iterator]() as never;
    const h = iteratorHelpers;
    expect([...h.map.call(it(), (v) => (v as number) * 2)]).toEqual([2, 4, 6, 8]);
    expect([...h.filter.call(it(), (v) => (v as number) % 2 === 0)]).toEqual([2, 4]);
    expect([...h.flatMap.call(it(), (v) => [v, v])]).toHaveLength(8);
    expect([...h.take.call(it(), 2)]).toEqual([1, 2]);
    expect([...h.take.call(it(), 0)]).toEqual([]);
    expect([...h.drop.call(it(), 3)]).toEqual([4]);
    expect(h.toArray.call(it())).toEqual([1, 2, 3, 4]);
    const seen: unknown[] = [];
    h.forEach.call(it(), (v, i) => seen.push([v, i]));
    expect(seen[3]).toEqual([4, 3]);
    expect(h.some.call(it(), (v) => v === 3)).toBe(true);
    expect(h.some.call(it(), (v) => v === 9)).toBe(false);
    expect(h.every.call(it(), (v) => (v as number) > 0)).toBe(true);
    expect(h.every.call(it(), (v) => (v as number) > 1)).toBe(false);
    expect(h.find.call(it(), (v) => (v as number) > 2)).toBe(3);
    expect(h.find.call(it(), (v) => (v as number) > 9)).toBeUndefined();
    expect(typeof (globalThis as Record<string, unknown>).Iterator).toBe('function');
  });
});

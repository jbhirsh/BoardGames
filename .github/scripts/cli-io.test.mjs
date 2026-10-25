// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeIo } from './cli-io.mjs';

describe('nodeIo', () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const scratch = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cli-io-'));
    dirs.push(dir);
    return dir;
  };

  it('writes a file in a directory it makes, appends to it and reads it back', () => {
    const io = nodeIo();
    const file = path.join(scratch(), 'a', 'b', 'out.txt');
    io.write(file, 'one\n');
    io.append(file, 'two\n');
    expect(io.read(file)).toBe('one\ntwo\n');
    expect(readFileSync(file, 'utf8')).toBe('one\ntwo\n');
  });

  it('reads a missing file as null', () => {
    expect(nodeIo().read(path.join(scratch(), 'missing'))).toBeNull();
  });

  it('carries the environment it is given, else the process', () => {
    expect(nodeIo({ A: '1' }).env).toEqual({ A: '1' });
    expect(nodeIo().env).toBe(process.env);
  });

  it('prints to the console', () => {
    const io = nodeIo();
    expect(io.log).toBe(console.log);
    expect(io.error).toBe(console.error);
  });
});

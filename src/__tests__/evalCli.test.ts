import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GOLDEN_FILE,
  DEFAULT_THRESHOLD,
  parseCliArgs,
  parseEnvFile,
} from '../../eval/cli';

describe('parseCliArgs', () => {
  it('returns the documented defaults with no arguments', () => {
    expect(parseCliArgs([])).toEqual({ file: DEFAULT_GOLDEN_FILE, threshold: DEFAULT_THRESHOLD });
    expect(DEFAULT_GOLDEN_FILE).toBe('eval/golden-set.json');
    expect(DEFAULT_THRESHOLD).toBe(0.9);
  });

  it('parses --file', () => {
    expect(parseCliArgs(['--file', 'tmp/smoke.json']).file).toBe('tmp/smoke.json');
  });

  it('parses --threshold, including the 0 and 1 boundaries', () => {
    expect(parseCliArgs(['--threshold', '0.75']).threshold).toBe(0.75);
    expect(parseCliArgs(['--threshold', '0']).threshold).toBe(0);
    expect(parseCliArgs(['--threshold', '1']).threshold).toBe(1);
  });

  it('parses both flags together in any order', () => {
    expect(parseCliArgs(['--threshold', '0.5', '--file', 'x.json'])).toEqual({
      file: 'x.json',
      threshold: 0.5,
    });
  });

  it('rejects --file without a path', () => {
    expect(() => parseCliArgs(['--file'])).toThrow('--file requires a path');
    expect(() => parseCliArgs(['--file', '--threshold'])).toThrow('--file requires a path');
  });

  it('rejects --threshold without a value', () => {
    expect(() => parseCliArgs(['--threshold'])).toThrow('--threshold requires a numeric argument');
  });

  it('rejects non-numeric and out-of-range thresholds', () => {
    expect(() => parseCliArgs(['--threshold', 'high'])).toThrow('between 0 and 1');
    expect(() => parseCliArgs(['--threshold', '1.5'])).toThrow('between 0 and 1');
    expect(() => parseCliArgs(['--threshold', '-0.1'])).toThrow('between 0 and 1');
  });

  it('rejects unknown arguments', () => {
    expect(() => parseCliArgs(['--verbose'])).toThrow('unknown argument "--verbose"');
  });
});

describe('parseEnvFile', () => {
  it('parses simple KEY=value lines', () => {
    expect(parseEnvFile('GEMINI_API_KEY=abc123\nOTHER=x')).toEqual({
      GEMINI_API_KEY: 'abc123',
      OTHER: 'x',
    });
  });

  it('ignores blank lines and # comments', () => {
    expect(parseEnvFile('# secrets\n\nA=1\n  # more\nB=2\n')).toEqual({ A: '1', B: '2' });
  });

  it('strips matching single or double quotes around values', () => {
    expect(parseEnvFile('A="quoted value"\nB=\'single\'')).toEqual({
      A: 'quoted value',
      B: 'single',
    });
  });

  it('supports an optional export prefix', () => {
    expect(parseEnvFile('export A=1')).toEqual({ A: '1' });
  });

  it('keeps = characters inside the value', () => {
    expect(parseEnvFile('A=abc=def==')).toEqual({ A: 'abc=def==' });
  });

  it('handles CRLF line endings and surrounding whitespace', () => {
    expect(parseEnvFile('A = 1 \r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('skips malformed lines and invalid key names', () => {
    expect(parseEnvFile('not a var\n=nokey\n1BAD=x\nGOOD=1')).toEqual({ GOOD: '1' });
  });

  it('later assignments win', () => {
    expect(parseEnvFile('A=1\nA=2')).toEqual({ A: '2' });
  });
});

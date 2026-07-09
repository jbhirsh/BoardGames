// Pure CLI-argument and .env-file parsing for the eval harness.
// No I/O in this module — everything here is unit-tested from src/__tests__.

export const DEFAULT_GOLDEN_FILE = 'eval/golden-set.json';
export const DEFAULT_THRESHOLD = 0.9;

export interface CliOptions {
  file: string;
  threshold: number;
}

/** Parses `--file <path>` and `--threshold <0..1>`; throws on anything else. */
export function parseCliArgs(argv: string[]): CliOptions {
  let file = DEFAULT_GOLDEN_FILE;
  let threshold = DEFAULT_THRESHOLD;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--file requires a path argument');
      }
      file = value;
    } else if (arg === '--threshold') {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) {
        throw new Error('--threshold requires a numeric argument');
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`--threshold must be a number between 0 and 1, got "${value}"`);
      }
      threshold = parsed;
    } else {
      throw new Error(`unknown argument "${arg}" (supported: --file <path>, --threshold <0..1>)`);
    }
  }
  return { file, threshold };
}

/**
 * Minimal .env parser: KEY=value lines, optional `export ` prefix, optional
 * single/double quotes around the value, `#` comments and blank lines ignored.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const unprefixed = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = unprefixed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = unprefixed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = unprefixed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

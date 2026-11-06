// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { extractText } from 'unpdf';
import { extractFile, run, withPageMarkers, withoutCardPrint } from './extract-rules-text.mjs';

vi.mock('unpdf', () => ({ extractText: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

// A page's worth of text: over the 200 characters a page with real text has.
const page = (word) => `${word} `.repeat(50).trim();

let dir;
let dirs;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rules-text-'));
  dirs = { rulesDir: join(dir, 'rules'), outputDir: join(dir, 'rules-text') };
  mkdirSync(dirs.rulesDir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.mocked(extractText).mockReset();
  vi.mocked(execFileSync).mockReset();
});

/** A file in the rules dir whose bytes name the text unpdf finds in it (see `extractsTo`). */
const addPdf = (name) => writeFileSync(join(dirs.rulesDir, name), name);
/** unpdf reading each file as `texts[its name]`, one page per entry; a string is one merged page. */
const extractsTo = (texts) =>
  vi.mocked(extractText).mockImplementation((bytes) => {
    const text = texts[Buffer.from(bytes).toString()];
    if (text instanceof Error) return Promise.reject(text);
    return Promise.resolve({ text, totalPages: Array.isArray(text) ? text.length : 1 });
  });
const read = (name) => readFileSync(join(dirs.outputDir, name), 'utf8');

describe('withPageMarkers', () => {
  it('heads each page with its number in the PDF', () => {
    expect(withPageMarkers(['one', 'two'])).toBe('[Page 1]\none\n\n[Page 2]\ntwo');
  });
});

describe('withoutCardPrint', () => {
  it('drops Rio Grande’s art credits and print slugs', () => {
    const text = [
      'Each player draws a card.',
      'Illustration: Ryan Laukat © 2021 Rio Grande Games',
      'treasure_2nd02.indd 68 7/12/21 12:43 AM',
      'treasure_2nd02.indd 68b 7/12/21 12:43 AM 7/12/21',
      'Then discards one.',
    ].join('\n');
    expect(withoutCardPrint(text)).toBe('Each player draws a card.\nThen discards one.');
  });

  it('keeps the text a slug runs into', () => {
    expect(withoutCardPrint('treasure_2nd02.indd 68 7/12/21 12:43 AMHand size is five.')).toBe('Hand size is five.');
  });

  it('leaves a credit or slug alone mid-line, and any other line', () => {
    const text = 'See Illustration: Ryan Laukat © 2021 Rio Grande Games\nfile.indd is not a slug';
    expect(withoutCardPrint(text)).toBe(text);
  });
});

describe('extractFile', () => {
  beforeEach(() => mkdirSync(dirs.outputDir));

  it('writes a PDF with text to its .txt, page by page, without card print', async () => {
    addPdf('dominion.pdf');
    extractsTo({ 'dominion.pdf': [page('buy'), `Illustration: A B © 2021 Rio Grande Games\n${page('gain')}`] });

    expect(await extractFile('dominion.pdf', dirs)).toBe(true);
    const text = `[Page 1]\n${page('buy')}\n\n[Page 2]\n${page('gain')}`;
    expect(read('dominion.txt')).toBe(text);
    expect(console.log).toHaveBeenCalledWith(`dominion.pdf -> dominion.txt (${Buffer.byteLength(text)} bytes)`);
  });

  it('takes merged text as one page', async () => {
    addPdf('sheet.pdf');
    extractsTo({ 'sheet.pdf': page('house') });

    expect(await extractFile('sheet.pdf', dirs)).toBe(true);
    expect(read('sheet.txt')).toBe(`[Page 1]\n${page('house')}`);
  });

  it('leaves a PDF with too little text per page, on average, to OCR', async () => {
    addPdf('scan.pdf');
    // 249 characters over two pages: one page's worth, not two.
    extractsTo({ 'scan.pdf': [page('word'), ''] });

    expect(await extractFile('scan.pdf', dirs)).toBe(false);
    expect(readdirSync(dirs.outputDir)).toEqual([]);
    expect(console.log).toHaveBeenCalledWith(
      `scan.pdf -> ${withPageMarkers([page('word'), '']).trim().length} chars, needs OCR`,
    );
  });

  it('leaves a PDF unpdf can’t read to OCR', async () => {
    addPdf('odd.pdf');
    extractsTo({ 'odd.pdf': new Error('bad XRef') });

    expect(await extractFile('odd.pdf', dirs)).toBe(false);
    expect(readdirSync(dirs.outputDir)).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('odd.pdf -> error: bad XRef');
  });
});

describe('run', () => {
  it('extracts every PDF in the rules dir, then OCRs those with no text', async () => {
    for (const name of ['azul.pdf', 'scan.pdf', 'odd.pdf', 'notes.txt']) addPdf(name);
    extractsTo({ 'azul.pdf': [page('tile')], 'scan.pdf': [''], 'odd.pdf': new Error('bad XRef') });
    const ocr = vi.fn();

    await run({ ...dirs, ocr });

    expect(extractText).toHaveBeenCalledTimes(3);
    expect(readdirSync(dirs.outputDir)).toEqual(['azul.txt']);
    expect(ocr).toHaveBeenCalledOnce();
    expect(ocr.mock.calls[0][0].toSorted()).toEqual(['odd.pdf', 'scan.pdf']);
    expect(console.log).toHaveBeenCalledWith('Found 3 PDF file(s) in public/rules/');
    expect(console.log).toHaveBeenCalledWith('\nRunning OCR on 2 file(s)...');
    expect(console.log).toHaveBeenLastCalledWith('Done.');
  });

  it('OCRs in a child process running ocr-pdfs.mjs, by default', async () => {
    addPdf('scan.pdf');
    extractsTo({ 'scan.pdf': [''] });

    await run(dirs);

    expect(execFileSync).toHaveBeenCalledWith('node', [join(import.meta.dirname, 'ocr-pdfs.mjs'), 'scan.pdf'], {
      stdio: 'inherit',
    });
  });

  it('runs no OCR when every PDF has text', async () => {
    addPdf('azul.pdf');
    extractsTo({ 'azul.pdf': [page('tile')] });

    await run(dirs);

    expect(execFileSync).not.toHaveBeenCalled();
    expect(read('azul.txt')).toBe(`[Page 1]\n${page('tile')}`);
  });
});

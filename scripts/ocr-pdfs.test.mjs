// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import { ocrFile, run } from './ocr-pdfs.mjs';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
vi.mock('pdf-to-img', () => ({ pdf: vi.fn() }));

/** pdf-to-img's document: its page images, one by one, and how many there are. */
function fakeDoc(pages) {
  return {
    length: pages.length,
    async *[Symbol.asyncIterator]() {
      yield* pages;
    },
  };
}

/** A worker that reads each page image (a string here) back as its text. */
const fakeWorker = () => ({
  recognize: vi.fn((image) => Promise.resolve({ data: { text: `text of ${image}` } })),
  terminate: vi.fn(() => Promise.resolve()),
});

let dir;
let dirs;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocr-pdfs-'));
  dirs = { rulesDir: join(dir, 'rules'), outputDir: join(dir, 'out', 'rules-text') };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.mocked(createWorker).mockReset();
  vi.mocked(pdf).mockReset();
});

const read = (name) => readFileSync(join(dirs.outputDir, name), 'utf8');

describe('ocrFile', () => {
  beforeEach(() => mkdirSync(dirs.outputDir, { recursive: true }));

  it('writes each page’s text under its page marker, rendered at twice the size', async () => {
    vi.mocked(pdf).mockResolvedValue(fakeDoc(['p1', 'p2']));
    const worker = fakeWorker();
    await ocrFile('azul.pdf', worker, dirs);

    expect(pdf).toHaveBeenCalledWith(join(dirs.rulesDir, 'azul.pdf'), { scale: 2 });
    expect(worker.recognize.mock.calls.map(([image]) => image)).toEqual(['p1', 'p2']);
    expect(read('azul.txt')).toBe('[Page 1]\ntext of p1\n\n[Page 2]\ntext of p2');
    expect(console.log).toHaveBeenCalledWith('azul.pdf OCR page 2/2...');
    expect(console.log).toHaveBeenCalledWith('azul.pdf -> azul.txt (40 bytes)');
  });

  it('logs a file that fails and writes nothing for it', async () => {
    vi.mocked(pdf).mockRejectedValue(new Error('not a PDF'));
    await ocrFile('broken.pdf', fakeWorker(), dirs);

    expect(console.error).toHaveBeenCalledWith('broken.pdf -> OCR error: not a PDF');
    expect(readdirSync(dirs.outputDir)).toEqual([]);
  });
});

describe('run', () => {
  it('OCRs each file named with one worker, going on past one that fails', async () => {
    const worker = fakeWorker();
    vi.mocked(createWorker).mockResolvedValue(worker);
    vi.mocked(pdf).mockImplementation((path) =>
      path.endsWith('bad.pdf') ? Promise.reject(new Error('unreadable')) : Promise.resolve(fakeDoc([path])),
    );

    await run(['bad.pdf', 'good.pdf'], dirs);

    expect(createWorker).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledWith('eng');
    expect(readdirSync(dirs.outputDir)).toEqual(['good.txt']);
    expect(read('good.txt')).toBe(`[Page 1]\ntext of ${join(dirs.rulesDir, 'good.pdf')}`);
    expect(console.error).toHaveBeenCalledWith('bad.pdf -> OCR error: unreadable');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('starts no worker when no files are named, but still makes the output dir', async () => {
    await run([], dirs);

    expect(createWorker).not.toHaveBeenCalled();
    expect(readdirSync(dirs.outputDir)).toEqual([]);
    expect(console.log).toHaveBeenCalledWith('No files to OCR.');
  });
});

// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import { addTextLayer, baselineAt, run } from './add-text-layer.mjs';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
// The real pdf.js reads the fixtures' text and coordinates; only drawing a
// page, which needs a canvas, is stubbed.
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importActual) => {
  const actual = await importActual();
  return {
    getDocument: vi.fn((options) => ({
      promise: actual.getDocument(options).promise.then((doc) => ({
        numPages: doc.numPages,
        getPage: async (n) => {
          const page = await doc.getPage(n);
          page.render = () => ({ promise: Promise.resolve() });
          return page;
        },
        canvasFactory: {
          create: (width, height) => ({ canvas: { toBuffer: (type) => `${type} ${width}x${height}` } }),
        },
      })),
    })),
  };
});

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'text-layer-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.mocked(createWorker).mockReset();
  vi.mocked(getDocument).mockClear();
});

/** Writes a PDF of 300x400pt pages to the rules dir, each with the given text drawn on it ('' for a blank scan). */
async function writePdf(name, pageTexts) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([300, 400]);
    if (text) page.drawText(text, { x: 20, y: 200, size: 12, font });
  }
  const bytes = await doc.save();
  writeFileSync(join(dir, name), bytes);
  return bytes;
}

/** The text pdf.js finds on each page of a PDF, with where it starts and how wide it is, in points. */
async function textOf(bytes) {
  const actual = await vi.importActual('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await actual.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    pages.push(
      items
        .filter((item) => item.str.trim())
        .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width })),
    );
  }
  return pages;
}

/** A tesseract line: its box and baseline in image pixels, and its words as [text, confidence, x0, x1]. */
const line = ({ top, baseline, words }) => ({
  bbox: { x0: 60, y0: top, x1: 1200, y1: baseline + 12 },
  baseline: { x0: 60, y0: baseline, x1: 1200, y1: baseline },
  words: words.map(([text, confidence, x0, x1]) => ({ text, confidence, bbox: { x0, x1 } })),
});

/** A worker reading every page as these lines. */
const fakeWorker = (lines) => ({
  recognize: vi.fn(() => Promise.resolve({ data: { blocks: [{ paragraphs: [{ lines }] }] } })),
  terminate: vi.fn(() => Promise.resolve()),
});

describe('baselineAt', () => {
  it('follows a sloping baseline, and takes a vertical one at its start', () => {
    const sloping = { baseline: { x0: 0, y0: 100, x1: 200, y1: 120 } };
    expect(baselineAt(sloping, 0)).toBe(100);
    expect(baselineAt(sloping, 100)).toBe(110);
    expect(baselineAt({ baseline: { x0: 50, y0: 30, x1: 50, y1: 90 } }, 80)).toBe(30);
  });
});

describe('addTextLayer', () => {
  it('leaves a PDF with text alone, on any page', async () => {
    const bytes = await writePdf('rules.pdf', ['', 'Setup']);
    const worker = fakeWorker([]);

    await addTextLayer('rules.pdf', worker, dir);

    expect(worker.recognize).not.toHaveBeenCalled();
    expect(new Uint8Array(readFileSync(join(dir, 'rules.pdf')))).toEqual(bytes);
    expect(console.log).toHaveBeenCalledWith('rules.pdf: has text, left alone');
  });

  it('writes the words it reads over where they are on the page', async () => {
    await writePdf('scan.pdf', ['', '']);
    // The 300x400pt page is drawn at 6x (2400px tall), so 6px is a point.
    const worker = fakeWorker([
      line({
        top: 600,
        baseline: 708,
        words: [
          ['Hello', 90, 60, 300],
          ['smudge', 20, 320, 340], // too unsure
          ['—', 95, 340, 350], // no letter or digit
          ['x', 90, 620, 620], // no width
        ],
      }),
      line({ top: 1200, baseline: 1308, words: [['go→', 90, 360, 600]] }), // the arrow Helvetica can't write
      line({ top: 1800, baseline: 1800, words: [['flat', 90, 60, 120]] }), // no height above its baseline
    ]);

    await addTextLayer('scan.pdf', worker, dir);

    expect(worker.recognize).toHaveBeenCalledTimes(2);
    expect(worker.recognize).toHaveBeenCalledWith('image/png 1800x2400', {}, { blocks: true });
    const written = readFileSync(join(dir, 'scan.pdf'));
    const pages = await textOf(written);
    expect(pages).toHaveLength(2);
    for (const words of pages) {
      expect(words.map((w) => w.str)).toEqual(['Hello', 'go']);
      // Each starts on its baseline (400 - 708/6 = 282pt up), stretched to its printed width.
      const [hello, go] = words;
      expect(hello).toEqual({ str: 'Hello', x: expect.closeTo(10), y: expect.closeTo(282), width: expect.closeTo(40) });
      expect(go).toEqual({ str: 'go', x: expect.closeTo(60), y: expect.closeTo(182), width: expect.closeTo(40) });
    }
    expect(console.log).toHaveBeenCalledWith('scan.pdf: page 1/2, 2 words');
    expect(console.log).toHaveBeenLastCalledWith(
      expect.stringMatching(/^scan\.pdf: 4 words, .* MB -> .* MB, text now found$/),
    );
  });
});

describe('run', () => {
  it('goes through every PDF in the rules dir, in order, with one worker', async () => {
    await writePdf('b.pdf', ['B']);
    await writePdf('a.pdf', ['A']);
    writeFileSync(join(dir, 'notes.txt'), 'not a PDF');
    const worker = fakeWorker([]);
    vi.mocked(createWorker).mockResolvedValue(worker);

    await run([], dir);

    expect(createWorker).toHaveBeenCalledExactlyOnceWith('eng');
    expect(vi.mocked(console.log).mock.calls).toEqual([
      ['a.pdf: has text, left alone'],
      ['b.pdf: has text, left alone'],
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('takes only the files named', async () => {
    await writePdf('a.pdf', ['A']);
    await writePdf('b.pdf', ['B']);
    vi.mocked(createWorker).mockResolvedValue(fakeWorker([]));

    await run(['b.pdf'], dir);

    expect(vi.mocked(console.log).mock.calls).toEqual([['b.pdf: has text, left alone']]);
    expect(getDocument).toHaveBeenCalledOnce();
  });
});

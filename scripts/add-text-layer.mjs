// Scanned rulebooks are pictures of pages: there's no text in them to search,
// select or read aloud. This OCRs each page and writes the words back into the
// PDF as invisible text laid over where they appear, the way a scanner's
// "searchable PDF" does; the page images are left as they are. Only PDFs with
// no text at all are touched, so running it again changes nothing.
//
//   npm run rules-text-layer                 # every rulebook with no text
//   npm run rules-text-layer -- suspicion.pdf

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
// pdf.js's legacy build: it is the one pdf.js supports in Node, where it
// sets up a canvas to draw on (the app uses the modern build, which needs a
// browser's). This only runs on a developer's machine; nothing here ships.
// One pdf.js does the rendering, the text check and the coordinates: two
// copies in one process (unpdf's, pdf-to-img's) trip over each other.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from "pdf-lib";

const RULES_DIR = join(import.meta.dirname, "..", "public", "rules");
// Render each page about this many pixels on its long side: small pages (One
// Night's are 342pt wide) need it for tesseract to read their print.
const TARGET_PX = 3000;
// Below this, a "word" is usually a smudge or a bit of artwork.
const MIN_CONFIDENCE = 40;
// Helvetica's cap height as a share of its size: turns a line's height above
// its baseline into a font size.
const CAP_HEIGHT = 0.72;

const open = (bytes) => getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;

async function hasText(bytes) {
  const doc = await open(bytes);
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await (await doc.getPage(n)).getTextContent();
    if (items.some((item) => item.str?.trim())) return true;
  }
  return false;
}

/** A page drawn as a PNG, at the given scale, for tesseract to read. */
async function renderPage(page, viewport, canvasFactory) {
  const { canvas } = canvasFactory.create(viewport.width, viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas.toBuffer("image/png");
}

/** The word with any character Helvetica's encoding can't write dropped. */
function encodable(font, word) {
  return [...word].filter((ch) => {
    try {
      font.encodeText(ch);
      return true;
    } catch {
      return false;
    }
  }).join("");
}

/** Where a line's baseline sits at x, in image pixels. */
function baselineAt(line, x) {
  const { x0, y0, x1, y1 } = line.baseline;
  return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

async function addTextLayer(file, worker) {
  const path = join(RULES_DIR, file);
  const bytes = await readFile(path);
  if (await hasText(bytes)) {
    console.log(`${file}: has text, left alone`);
    return;
  }

  const doc = await open(bytes);
  const out = await PDFDocument.load(bytes);
  const font = await out.embedFont(StandardFonts.Helvetica);
  let total = 0;

  for (const [i, page] of out.getPages().entries()) {
    const source = await doc.getPage(i + 1);
    const base = source.getViewport({ scale: 1 });
    const scale = Math.min(6, Math.max(2, TARGET_PX / Math.max(base.width, base.height)));
    // The viewport the page is drawn with, page rotation included, also
    // takes the image's pixels back to PDF points.
    const viewport = source.getViewport({ scale });
    const toPdf = (x, y) => viewport.convertToPdfPoint(x, y);
    const image = await renderPage(source, viewport, doc.canvasFactory);
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const key = page.node.newFontDictionary(font.name, font.ref);
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
    let words = 0;

    for (const line of data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines))) {
      const lineHeight = baselineAt(line, line.bbox.x0) - line.bbox.y0;
      if (lineHeight <= 0) continue;
      for (const word of line.words) {
        const text = encodable(font, word.text.trim());
        if (word.confidence < MIN_CONFIDENCE || !/[\p{L}\p{N}]/u.test(text)) continue;
        const { x0, x1 } = word.bbox;
        // The word's baseline, start to end, and the line's height above it,
        // all in PDF space (on a rotated page they don't run along x and y).
        const [sx, sy] = toPdf(x0, baselineAt(line, x0));
        const [ex, ey] = toPdf(x1, baselineAt(line, x1));
        const [tx, ty] = toPdf(x0, baselineAt(line, x0) - lineHeight);
        const along = Math.hypot(ex - sx, ey - sy);
        const up = Math.hypot(tx - sx, ty - sy);
        if (along === 0 || up === 0) continue;
        const size = up / CAP_HEIGHT;
        // Stretch the text to the word's printed width, so a highlight over
        // it lands on the word.
        const stretch = along / font.widthOfTextAtSize(text, size);
        ops.push(
          setFontAndSize(key, size),
          setTextMatrix(
            ((ex - sx) / along) * stretch, ((ey - sy) / along) * stretch,
            (tx - sx) / up, (ty - sy) / up,
            sx, sy,
          ),
          showText(font.encodeText(text)),
        );
        words++;
      }
    }
    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
    total += words;
    console.log(`${file}: page ${i + 1}/${out.getPageCount()}, ${words} words`);
  }

  await writeFile(path, await out.save());
  const after = await readFile(path);
  console.log(`${file}: ${total} words, ${(bytes.length / 1e6).toFixed(2)} MB -> ${(after.length / 1e6).toFixed(2)} MB, text now ${await hasText(after) ? "found" : "MISSING"}`);
}

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : (await readdir(RULES_DIR)).filter((f) => f.endsWith(".pdf")).sort();

const worker = await createWorker("eng");
for (const file of files) await addTextLayer(file, worker);
await worker.terminate();

// OCRs image-only rulebooks to rules-text/*.txt, for the ones
// ./extract-rules-text.mjs found no text in: it runs this in a child process
// (tesseract.js and pdf-to-img's pdf.js apart from its own unpdf), passing
// the files' names in public/rules/. With none, it writes nothing.
//
//   node scripts/ocr-pdfs.mjs azul.pdf suspicion.pdf
//
// A file that fails is reported and skipped; the rest still run.
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';

const RULES_DIR = join(import.meta.dirname, '..', 'public', 'rules');
const OUTPUT_DIR = join(import.meta.dirname, '..', 'rules-text');

/**
 * OCRs one PDF in `rulesDir` to its .txt in `outputDir`, each page headed
 * "[Page N]" as extract-rules-text.mjs writes them. An error is logged, not
 * thrown, so one bad file doesn't stop the rest.
 */
export async function ocrFile(file, worker, { rulesDir, outputDir }) {
  const pdfPath = join(rulesDir, file);
  const outName = basename(file, '.pdf') + '.txt';

  try {
    const doc = await pdf(pdfPath, { scale: 2 });
    const pages = [];
    let pageNum = 0;

    for await (const pageImage of doc) {
      pageNum++;
      console.log(`${file} OCR page ${pageNum}/${doc.length}...`);
      const { data } = await worker.recognize(pageImage);
      pages.push(data.text);
    }

    const finalText = pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join('\n\n');
    await writeFile(join(outputDir, outName), finalText);
    console.log(`${file} -> ${outName} (${Buffer.byteLength(finalText)} bytes)`);
  } catch (err) {
    console.error(`${file} -> OCR error: ${err.message}`);
  }
}

/** OCRs `files` (names in `rulesDir`) with one tesseract worker. */
export async function run(files, dirs = { rulesDir: RULES_DIR, outputDir: OUTPUT_DIR }) {
  await mkdir(dirs.outputDir, { recursive: true });
  if (files.length === 0) {
    console.log('No files to OCR.');
    return;
  }

  const worker = await createWorker('eng');
  for (const file of files) await ocrFile(file, worker, dirs);
  await worker.terminate();
}

if (import.meta.main) await run(process.argv.slice(2));

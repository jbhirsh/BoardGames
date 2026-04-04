import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { createWorker } from "tesseract.js";
import { pdf } from "pdf-to-img";

const RULES_DIR = join(import.meta.dirname, "..", "public", "rules");
const OUTPUT_DIR = join(import.meta.dirname, "..", "rules-text");

await mkdir(OUTPUT_DIR, { recursive: true });

const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("No files to OCR.");
  process.exit(0);
}

const worker = await createWorker("eng");

for (const file of files) {
  const pdfPath = join(RULES_DIR, file);
  const outName = basename(file, ".pdf") + ".txt";

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

    const finalText = pages.join("\n\n");
    await writeFile(join(OUTPUT_DIR, outName), finalText);
    console.log(`${file} -> ${outName} (${Buffer.byteLength(finalText)} bytes)`);
  } catch (err) {
    console.error(`${file} -> OCR error: ${err.message}`);
  }
}

await worker.terminate();

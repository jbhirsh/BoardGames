import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { extractText } from "unpdf";

const RULES_DIR = join(import.meta.dirname, "..", "public", "rules");
const OUTPUT_DIR = join(import.meta.dirname, "..", "rules-text");
const MIN_CHARS = 1000;

await mkdir(OUTPUT_DIR, { recursive: true });

const files = (await readdir(RULES_DIR)).filter((f) => f.endsWith(".pdf"));
console.log(`Found ${files.length} PDF file(s) in public/rules/`);

const needsOcr = [];

// Step 1: Try unpdf text extraction for all files
for (const file of files) {
  const pdfPath = join(RULES_DIR, file);
  const outName = basename(file, ".pdf") + ".txt";

  try {
    const buffer = await readFile(pdfPath);
    const result = await extractText(new Uint8Array(buffer));
    const text = Array.isArray(result.text)
      ? result.text.join("\n\n")
      : result.text;

    if (text.trim().length >= MIN_CHARS) {
      await writeFile(join(OUTPUT_DIR, outName), text);
      console.log(`${file} -> ${outName} (${Buffer.byteLength(text)} bytes)`);
    } else {
      console.log(`${file} -> ${text.trim().length} chars, needs OCR`);
      needsOcr.push(file);
    }
  } catch (err) {
    console.error(`${file} -> error: ${err.message}`);
    needsOcr.push(file);
  }
}

// Step 2: OCR the rest in a child process (separate from unpdf/pdfjs-dist)
if (needsOcr.length > 0) {
  console.log(`\nRunning OCR on ${needsOcr.length} file(s)...`);
  execFileSync(
    "node",
    [join(import.meta.dirname, "ocr-pdfs.mjs"), ...needsOcr],
    { stdio: "inherit" }
  );
}

console.log("Done.");

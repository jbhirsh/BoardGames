import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { extractText } from "unpdf";

const RULES_DIR = join(import.meta.dirname, "..", "public", "rules");
const OUTPUT_DIR = join(import.meta.dirname, "..", "rules-text");
// A page with real text runs to hundreds of characters; an image-only scan
// gives next to none. Judge per page, so a one-page house-rules sheet of a few
// hundred characters isn't mistaken for a scan and sent to OCR.
const MIN_CHARS_PER_PAGE = 200;

// Each page opens with "[Page N]" (its page in the PDF, as #page=N opens it),
// so the rules assistant can cite where a rule is: api/_lib/rulesAssistant.ts
// asks for "(p. N)" and the chat links it to that page.
const pageMarker = (n) => `[Page ${n}]\n`;
const withPageMarkers = (pages) => pages.map((t, i) => pageMarker(i + 1) + t).join("\n\n");

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
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    const text = withPageMarkers(pages);

    if (pages.join("\n\n").trim().length >= MIN_CHARS_PER_PAGE * result.totalPages) {
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

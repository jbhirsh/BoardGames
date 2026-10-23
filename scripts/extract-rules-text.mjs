// The rules assistant's text: every rulebook in public/rules/*.pdf, extracted
// with unpdf (or, for an image-only PDF, OCR'd with tesseract.js by
// ./ocr-pdfs.mjs), to rules-text/*.txt, which vercel.json bundles into the
// api/chat.ts function.
//
//   npm run rules-text
//
// Give a newly added scan an OCR text layer first (npm run rules-text-layer,
// ./add-text-layer.mjs), so it is searchable in the reader too. A scan whose
// OCR is too noisy to answer from (the Monster Box sheets, Cranium) carries a
// hand transcription as text pages after its scanned ones, so this reads the
// transcription and never OCRs over it (Cranium's scanned pages also had
// their garbled text layer removed); the Dominion books end with typed pages
// of what they print only as pictures, card costs and coin amounts.
// src/__tests__/rulesTextQuality.test.ts fails a file below a words-per-page
// or dictionary-word floor, above a stray-letter ceiling, or sharing most of
// its text with another.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractText } from 'unpdf';

const RULES_DIR = join(import.meta.dirname, '..', 'public', 'rules');
const OUTPUT_DIR = join(import.meta.dirname, '..', 'rules-text');
// A page with real text runs to hundreds of characters; an image-only scan
// gives next to none. The test is the whole PDF's text against this much per
// page (an average across its pages, not each page on its own), so a one-page
// house-rules sheet of a few hundred characters isn't mistaken for a scan and
// sent to OCR.
const MIN_CHARS_PER_PAGE = 200;

// Each page opens with "[Page N]" (its page in the PDF, as #page=N opens it),
// so the rules assistant can cite where a rule is: api/_lib/rulesAssistant.ts
// asks for "(p. N)" and the chat links it to that page.
const pageMarker = (n) => `[Page ${n}]\n`;
const withPageMarkers = (pages) => pages.map((t, i) => pageMarker(i + 1) + t).join('\n\n');

// Rio Grande's Dominion books picture whole cards, and each picture carries
// its print-file slug ("treasure_2nd02.indd 68 7/12/21 12:43 AM") and art
// credit ("Illustration: Ryan Laukat © 2021 Rio Grande Games"): a fifth of
// the base book's words, and nothing a rules question needs. A slug can run
// into the next line's text ("...12:43 AMHand"), so it is cut from the start
// of a line and the rest kept, unless the rest is a scrap of another date.
const PRINT_SLUG = /^[\w ]+\.indd \d+[a-z]* \d{1,2}\/\d{1,2}\/\d{2} \d{1,2}:\d{2} [AP]M/;
const ART_CREDIT = /^Illustration: [\p{L} .'-]+ © ?\d{4} Rio Grande Games$/u;
const withoutCardPrint = (text) =>
  text
    .split('\n')
    .flatMap((line) => {
      if (ART_CREDIT.test(line)) return [];
      if (!PRINT_SLUG.test(line)) return [line];
      const rest = line.replace(PRINT_SLUG, '').trim();
      return /^[\d/: ]*$/.test(rest) ? [] : [rest];
    })
    .join('\n');

await mkdir(OUTPUT_DIR, { recursive: true });

const files = (await readdir(RULES_DIR)).filter((f) => f.endsWith('.pdf'));
console.log(`Found ${files.length} PDF file(s) in public/rules/`);

const needsOcr = [];

// Step 1: Try unpdf text extraction for all files
for (const file of files) {
  const pdfPath = join(RULES_DIR, file);
  const outName = basename(file, '.pdf') + '.txt';

  try {
    const buffer = await readFile(pdfPath);
    const result = await extractText(new Uint8Array(buffer));
    const pages = (Array.isArray(result.text) ? result.text : [result.text]).map(withoutCardPrint);
    const text = withPageMarkers(pages);

    if (pages.join('\n\n').trim().length >= MIN_CHARS_PER_PAGE * result.totalPages) {
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
  execFileSync('node', [join(import.meta.dirname, 'ocr-pdfs.mjs'), ...needsOcr], { stdio: 'inherit' });
}

console.log('Done.');

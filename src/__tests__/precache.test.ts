import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PDFJS_DECODERS, savedWhen } from '../utils/precache';

describe('savedWhen', () => {
  it("saves the app at install, every page's code with it", () => {
    expect(savedWhen('assets/index-abc.js', 'chunk')).toBe('install');
    expect(savedWhen('assets/RulesPage-abc.js', 'chunk')).toBe('install');
    expect(savedWhen('assets/PdfReader-abc.js', 'chunk')).toBe('install');
    expect(savedWhen('assets/index-abc.css', 'asset')).toBe('install');
  });

  it("saves pdf.js's worker, a script built as an asset, with the reader", () => {
    expect(savedWhen('assets/worker-abc.js', 'asset')).toBe('reader');
  });

  it('saves the decoders the rulebooks need with the reader', () => {
    for (const file of PDFJS_DECODERS) expect(savedWhen(`pdfjs/${file}`, 'asset')).toBe('reader');
  });

  it("leaves the rest of pdf.js's files to be saved if they are ever fetched", () => {
    expect(savedWhen('pdfjs/wasm/openjpeg_nowasm_fallback.js', 'asset')).toBe('fetched');
    expect(savedWhen('pdfjs/wasm/jbig2_nowasm_fallback.js', 'asset')).toBe('fetched');
    expect(savedWhen('pdfjs/wasm/LICENSE_OPENJPEG', 'asset')).toBe('fetched');
    expect(savedWhen('pdfjs/standard_fonts/FoxitSymbol.pfb', 'asset')).toBe('fetched');
    expect(savedWhen('pdfjs/standard_fonts/LiberationSans-Regular.ttf', 'asset')).toBe('fetched');
    // Only the decoder itself, wherever else the name turns up.
    expect(savedWhen('pdfjs/iccs/openjpeg.wasm', 'asset')).toBe('fetched');
    expect(savedWhen('assets/wasm/openjpeg.wasm', 'asset')).toBe('install');
  });

  it('names the decoders for the images the rulebooks hold', () => {
    // JPEG 2000 (Catan, Azul), JBIG2 and CCITT fax (Ticket to Ride), ICC colour and CMYK.
    expect([...PDFJS_DECODERS].sort()).toEqual([
      'iccs/CGATS001Compat-v2-micro.icc',
      'wasm/jbig2.wasm',
      'wasm/openjpeg.wasm',
      'wasm/qcms_bg.wasm',
    ]);
  });

  it('names decoders pdf.js still ships', () => {
    // vite.config.ts copies them from here; a rename would leave the reader without one offline.
    for (const file of PDFJS_DECODERS) {
      const [dir, name] = file.split('/');
      expect(readdirSync(join(process.cwd(), 'node_modules/pdfjs-dist', dir))).toContain(name);
    }
  });
});

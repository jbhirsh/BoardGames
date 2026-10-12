// When the service worker (src/sw/sw.ts) saves each file of the build for
// offline use. vite.config.ts sorts the build's output with this and writes
// the lists into sw.js.

/**
 * The pdf.js files the rulebook reader needs offline, under /pdfjs/. These
 * are the decoders its worker fetches for the rulebooks' images: JPEG 2000
 * (openjpeg: 7 Wonders, Azul, Catan, Hogwarts Battle, Mysterium), JBIG2
 * and CCITT fax (jbig2: Codenames, Cranium, both Tickets to Ride), ICC
 * colour (qcms), and the profile for CMYK images. The rest of /pdfjs/ is
 * never fetched by a browser with WebAssembly and its own fonts: the
 * fallbacks for no WebAssembly, the licences, and the standard fonts. pdf.js
 * uses the system's fonts, and fetches its own only for Symbol and
 * ZapfDingbats, which no rulebook leaves out.
 */
export const PDFJS_DECODERS: readonly string[] = [
  'wasm/openjpeg.wasm',
  'wasm/jbig2.wasm',
  'wasm/qcms_bg.wasm',
  'iccs/CGATS001Compat-v2-micro.icc',
];

/**
 * The wishlist's box art, under public/ (`npm run wishlist-art`): not saved
 * at install, since its 39 files come to 608 KB, more than the collection's
 * 30 (577 KB), for a list behind the Want toggle that a visitor may never
 * open. The service worker saves each one as it is fetched (src/sw/shell.ts,
 * marked with the build's hash of the file, which vite.config.ts writes in),
 * so an update drops a copy whose file has changed or gone.
 */
export const WISHLIST_ART_DIR = 'images/wishlist';

/** When a file of the build is saved for offline use. */
export type SavedWhen =
  /** At install: the app, every page's code included, so each page works offline after one visit. */
  | 'install'
  /**
   * With the first rulebook saved: pdf.js's worker and decoders, which only
   * someone reading a rulebook needs, and which outweigh the rest of the
   * app's code.
   */
  | 'reader'
  /** When fetched, if ever: the runtime cache. */
  | 'fetched';

/**
 * When the build's file `name` (its path in dist/) is saved. `type` is how
 * the bundler emitted it. A script emitted as an asset is a worker's: Vite
 * builds each worker in a build of its own, and pdf.js's is the app's only
 * worker.
 */
export function savedWhen(name: string, type: 'chunk' | 'asset'): SavedWhen {
  if (name.startsWith('pdfjs/')) return PDFJS_DECODERS.includes(name.slice('pdfjs/'.length)) ? 'reader' : 'fetched';
  if (type === 'asset' && name.endsWith('.js')) return 'reader';
  return 'install';
}

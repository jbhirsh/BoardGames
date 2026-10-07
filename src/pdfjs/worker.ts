// pdf.js's worker, with the polyfills it needs installed first (imports run
// in order, so they are in place before the worker's code does).
import './polyfills';
import 'pdfjs-dist/build/pdf.worker.mjs';

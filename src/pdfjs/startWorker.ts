// Starts pdf.js's worker (our entry, ./worker.ts). Kept out of the component
// so its options stay a literal Vite can read: the bundler resolves the
// worker from them, and Stryker's mutation switches would hide them.
export function startWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// pdf.js loads its image decoders (JPEG 2000, JBIG2, colour profiles) and the
// standard fonts at run time, by URL, so they can't go through the bundle.
// Serve them at /pdfjs/<dir>/ in dev and copy them into the build.
const PDFJS = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
const PDFJS_ASSETS: Record<string, (file: string) => boolean> = {
  // quickjs is pdf.js's sandbox for scripted forms, which rulebooks don't use.
  wasm: (file) => !file.startsWith('quickjs'),
  standard_fonts: () => true,
}

function pdfjsAssets(): Plugin {
  const files = () => Object.entries(PDFJS_ASSETS).flatMap(([dir, keep]) =>
    readdirSync(join(PDFJS, dir)).filter(keep).map((file) => `${dir}/${file}`))
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        if (!files().includes(path)) return next()
        res.setHeader('Content-Type', extname(path) === '.wasm' ? 'application/wasm' : 'application/octet-stream')
        res.end(readFileSync(join(PDFJS, path)))
      })
    },
    generateBundle() {
      for (const path of files()) {
        this.emitFile({ type: 'asset', fileName: `pdfjs/${path}`, source: readFileSync(join(PDFJS, path)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
  },
  // pdf.js's worker (src/pdfjs/worker.ts) is an ES module.
  worker: {
    format: 'es',
  },
  // Vercel advertises byte ranges on static files, and the phone reader
  // relies on them to fetch only the pages it shows. The preview server
  // serves ranges but doesn't say so; say it, so e2e runs match production.
  preview: {
    headers: { 'Accept-Ranges': 'bytes' },
  },
  plugins: [
    react(),
    pdfjsAssets(),
    sentryVitePlugin({
      org: "solo-23",
      project: "game_room",
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // e2e/ holds the Playwright suite (`npm run test:e2e`), which drives a
    // real browser; its *.spec.ts files are not Vitest tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      // vitest's defaults plus Cobertura, which ci.yml uploads to GitHub for
      // the code coverage rule on main.
      reporter: ['text', 'html', 'clover', 'json', 'cobertura'],
      exclude: ['e2e/**', 'playwright.config.ts'],
      thresholds: {
        perFile: true,
        lines: 80,
      },
    },
  },
})

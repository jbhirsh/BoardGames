import { createHash } from 'node:crypto'
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

// public/ files saved at install, beside the build's own: the collection's
// box art, the word checker's list, the favicons and the manifest (the
// home-screen icons are copied on install). Rulebooks
// are saved one by one as they're opened (src/sw/sw.ts), not here.
const PRECACHE_PUBLIC: Record<string, (file: string) => boolean> = {
  '': (file) => /^(favicon-|apple-touch-icon).*\.png$|\.webmanifest$/.test(file),
  images: (file) => file.endsWith('.webp'),
  words: (file) => file === 'enable.txt',
}

// The service worker (src/sw/sw.ts), bundled to /sw.js with the files it
// saves at install, a version naming that saved copy (a hash of index.html
// and every one of them, so a build that changes none keeps it) and a hash of
// each rulebook, so a saved one is dropped once its file changes.
function serviceWorker(): Plugin {
  let publicDir = ''
  const hashOf = (...parts: (string | Uint8Array)[]) => {
    const hash = createHash('sha256')
    for (const part of parts) hash.update(part)
    return hash.digest('hex').slice(0, 12)
  }
  return {
    name: 'service-worker',
    apply: 'build',
    // After vite emits index.html, which the version covers.
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: fileURLToPath(new URL('./src/sw/sw.ts', import.meta.url)), fileName: 'sw.js' })
    },
    generateBundle(_, bundle) {
      const sw = bundle['sw.js']
      const html = bundle['index.html']
      if (sw?.type !== 'chunk' || html?.type !== 'asset') throw new Error('service worker or index.html missing from the build')
      // A classic worker can't import: code shared with the app would be split
      // into a chunk sw.js imports, and registration would fail.
      if (sw.imports.length || sw.dynamicImports.length) throw new Error('sw.js must not share code with the app')
      const files = new Map<string, string | Uint8Array>()
      for (const [name, file] of Object.entries(bundle)) {
        if (name === 'sw.js' || name === 'index.html' || name.endsWith('.map')) continue
        files.set(`/${name}`, file.type === 'chunk' ? file.code : file.source)
      }
      for (const [dir, keep] of Object.entries(PRECACHE_PUBLIC)) {
        for (const file of readdirSync(join(publicDir, dir)).filter(keep)) {
          files.set(`/${dir ? `${dir}/` : ''}${file}`, readFileSync(join(publicDir, dir, file)))
        }
      }
      const paths = [...files.keys()].sort()
      const version = hashOf(html.source, ...paths.flatMap((path) => [path, files.get(path)!]))
      const rulebooks = Object.fromEntries(readdirSync(join(publicDir, 'rules')).filter((file) => file.endsWith('.pdf'))
        .map((file) => [`/rules/${file}`, hashOf(readFileSync(join(publicDir, 'rules', file)))]))
      sw.code = `const __PRECACHE__=${JSON.stringify(paths)},__SW_VERSION__=${JSON.stringify(version)},__RULEBOOKS__=${JSON.stringify(rulebooks)};${sw.code}`
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
    serviceWorker(),
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

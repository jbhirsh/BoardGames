// main.tsx's first import, so error reporting (client/sentry.ts) is catching
// before any other module runs: one that throws as it loads, taking the page
// down before main.tsx's own code runs, is reported all the same.
import { startSentry } from './client/sentry'

startSentry()

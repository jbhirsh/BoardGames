// main.tsx's first import, so error reporting (client/sentry.ts) is catching
// before the app's own modules run (the libraries in chunks the entry
// imports run first): one that throws as it loads, taking the page down
// before main.tsx's own code runs, is reported all the same.
import { startSentry } from './client/sentry'

startSentry()

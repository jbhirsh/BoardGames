// Sentry's session replay (rrweb and its recorder), about a third of
// Sentry's weight. instrument.ts imports this module dynamically, only once
// an error has been reported, so it builds into a chunk of its own and stays
// out of the bundle every visit downloads.
export { replayIntegration } from '@sentry/react';

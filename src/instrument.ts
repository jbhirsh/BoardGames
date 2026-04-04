import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://0555fa542a1eb1b3da2a4892a8472c43@o4511157588918272.ingest.us.sentry.io/4511158568353792",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

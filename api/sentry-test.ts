import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: "https://0555fa542a1eb1b3da2a4892a8472c43@o4511157588918272.ingest.us.sentry.io/4511158568353792",
  tracesSampleRate: 1.0,
});

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    throw new Error("Sentry backend test error from Game Room");
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return res.status(500).json({ error: "Test error sent to Sentry" });
  }
}

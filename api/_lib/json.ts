// The JSON-only rule for POSTs to /api/graphql (api/graphql.ts and
// jsonOnly in _resolvers/index.ts).

/** A request's headers as Node hands them over. */
export type Headers = Record<string, string | string[] | undefined>;

/**
 * The second CSRF layer. The first is the session cookie's SameSite=Lax,
 * which keeps it off any cross-site POST. Behind that, a cross-site form
 * can only send urlencoded, multipart or text/plain bodies; JSON needs a
 * CORS preflight the API never answers. So every owner mutation must be
 * JSON, judged by the media type itself (parameters dropped), so a value
 * like "text/plain; x=application/json" doesn't pass.
 */
export function isJsonRequest(headers: Headers): boolean {
  const ct = headers['content-type'];
  const value = Array.isArray(ct) ? ct[0] : ct;
  return typeof value === 'string' && value.split(';')[0].trim().toLowerCase() === 'application/json';
}

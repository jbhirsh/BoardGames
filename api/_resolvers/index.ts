// The API's GraphQL server: the SDL (api/_schema.graphql) joined to these
// resolvers on GraphQL Yoga, which api/graphql.ts serves as the one Vercel
// function. Each resolver checks what the old endpoint did, in the same
// order (a per-IP limit first, then the input, then the owner's session),
// and runs under guarded() with that endpoint's label and time limit.
//
// CSRF: every POST must be JSON, judged on the request as it arrived
// (jsonOnly below; Vercel parses a form body into an object, which Yoga
// would then read as JSON), Yoga's CSRF prevention refuses a GET without
// its header, a GET carries only queries (limits.ts), CORS is off so no
// preflight is ever answered, and the session cookie is SameSite=Lax.
// limits.ts also bounds a document's size, aliases and depth.

import { readFileSync } from 'node:fs';
import { createSchema, createYoga, type Plugin } from 'graphql-yoga';
// Renamed: it is a Yoga plugin, not a React hook.
import { useCSRFPrevention as csrfPrevention } from '@graphql-yoga/plugin-csrf-prevention';
import type { LookupResult } from '../_lib/bgg.js';
import { isJsonRequest, type Headers } from '../_lib/session.js';
import * as auth from './auth.js';
import { askRules, type AskRulesInput } from './chat.js';
import { buildContext, limit, requireAdmin, type ApiContext, type ApiDeps } from './context.js';
import { ApiError, guarded } from './errors.js';
import { limits } from './limits.js';
import * as suggestions from './suggestions.js';
import { castVote, readVotes } from './votes.js';

const typeDefs = readFileSync(new URL('../_schema.graphql', import.meta.url), 'utf8');

// The old endpoints' labels and time limits (their maxDuration).
const VOTES = ['votes api error:', 10_000] as const;
const SUGGESTIONS = ['suggestions api error:', 15_000] as const;
const AUTH = ['auth api error:', 15_000] as const;

interface EmailedParent {
  item: suggestions.Suggestion;
}

/** A lookup as the schema's Preview reads it: details only when it found the game. */
const preview = (result: LookupResult) =>
  result.outcome === 'found' ? { outcome: result.outcome, details: result.details } : { outcome: result.outcome };

/** GraphQL leaves an absent argument out and passes null for an explicit null; the services tell the two apart. */
type Maybe<T> = T | null | undefined;

const Query = {
  session: (_: unknown, __: unknown, ctx: ApiContext) => guarded(...AUTH, async () => ({ admin: await ctx.admin() })),

  wishlistVotes: (_: unknown, args: { ids: string[]; anonId?: Maybe<string> }, ctx: ApiContext) =>
    guarded(...VOTES, async () => {
      await limit(ctx, ctx.deps.limiters.votes);
      return readVotes(ctx.deps.redis, args.ids, args.anonId);
    }),

  suggestions: (_: unknown, __: unknown, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, () => suggestions.approvedList(ctx.deps.suggestions)),

  pendingSuggestions: (_: unknown, __: unknown, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await requireAdmin(ctx, false);
      return suggestions.pendingList(ctx.deps.suggestions);
    }),

  // A read, but it calls BoardGameGeek on the owner's behalf: JSON only, as
  // it was when it was a POST.
  previewGame: (_: unknown, args: { game: string }, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await requireAdmin(ctx);
      return preview(await suggestions.previewGame(ctx.deps.suggestions, args.game));
    }),

  signInLinkLive: (_: unknown, args: { token: string }, ctx: ApiContext) =>
    guarded(...AUTH, () => auth.signInLinkLive(ctx.deps.auth.redis, args.token)),

  emailedSuggestion: (_: unknown, args: { id: string; token: string }, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async (): Promise<EmailedParent> => ({
      item: await suggestions.openEmailed(ctx.deps.suggestions, args.id, args.token),
    })),
};

const EmailedSuggestion = {
  suggestion: (parent: EmailedParent) => parent.item,
  preview: (parent: EmailedParent, args: { game?: Maybe<string> }, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      const result = await suggestions.previewEmailed(ctx.deps.suggestions, parent.item, args.game);
      return result && preview(result);
    }),
};

const Mutation = {
  vote: (_: unknown, args: { itemId: string; anonId: string; vote: number }, ctx: ApiContext) =>
    guarded(...VOTES, async () => {
      await limit(ctx, ctx.deps.limiters.votes);
      return castVote(ctx.deps.redis, args);
    }),

  // Each new suggestion sends the owner an email, so creation is bounded
  // tightly per IP. Reads and the token-gated decisions are unlimited.
  suggestGame: (_: unknown, args: suggestions.SuggestInput, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await limit(ctx, ctx.deps.limiters.suggest);
      return suggestions.suggestGame(ctx.deps.suggestions, args);
    }),

  decideSuggestion: (
    _: unknown,
    args: { id: string; decision: 'approve' | 'deny'; token?: Maybe<string>; game?: Maybe<string>; details?: unknown },
    ctx: ApiContext,
  ) =>
    guarded(...SUGGESTIONS, async () => {
      // The emailed token authorises a decision on its own; without one it
      // is the owner's, from the site.
      const token = args.token ?? undefined;
      if (token === undefined) await requireAdmin(ctx);
      const game = args.game ?? undefined;
      return suggestions.decideSuggestion(ctx.deps.suggestions, { ...args, token, game });
    }),

  addGame: (_: unknown, args: suggestions.AddInput, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await requireAdmin(ctx);
      return suggestions.addGame(ctx.deps.suggestions, args);
    }),

  editSuggestion: (_: unknown, args: suggestions.EditInput, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await requireAdmin(ctx);
      return suggestions.editSuggestion(ctx.deps.suggestions, args);
    }),

  removeSuggestion: (_: unknown, args: { id: string }, ctx: ApiContext) =>
    guarded(...SUGGESTIONS, async () => {
      await requireAdmin(ctx);
      await suggestions.removeSuggestion(ctx.deps.suggestions, args.id);
      return true;
    }),

  // Each link request sends an email, so it is bounded tightly per IP.
  requestSignInLink: (_: unknown, args: { email: string }, ctx: ApiContext) =>
    guarded(...AUTH, async () => {
      await limit(ctx, ctx.deps.limiters.signInLink);
      await auth.requestSignInLink(ctx.deps.auth, args.email, ctx.defer);
      return true;
    }),

  verifySignIn: (_: unknown, args: { token: string }, ctx: ApiContext) =>
    guarded(...AUTH, async () => {
      ctx.setCookie(await auth.verifySignIn(ctx.deps.auth, args.token));
      return { admin: true };
    }),

  // JSON only, like every other owner mutation: a cross-site form could
  // otherwise clear the cookie out from under the owner (see isJsonRequest).
  logout: (_: unknown, __: unknown, ctx: ApiContext) =>
    guarded(...AUTH, async () => {
      if (!ctx.json) throw new ApiError(403, 'owner actions must be sent as JSON');
      ctx.setCookie(await auth.logout(ctx.deps.redis, ctx.headers));
      return true;
    }),
};

const Subscription = {
  askRules: {
    subscribe: (_: unknown, args: AskRulesInput, ctx: ApiContext) => askRules(ctx.deps.chat, ctx.ip, args),
    resolve: (chunk: string) => chunk,
  },
};

// The schema's enums by the values the services use.
const enums = {
  SuggestionStatus: {
    PENDING: 'pending',
    APPROVED: 'approved',
    DENIED: 'denied',
    UNSENT: 'unsent',
    REMOVED: 'removed',
  },
  Source: { FRIEND: 'friend', OWNER: 'owner' },
  Decision: { APPROVE: 'approve', DENY: 'deny' },
  LookupOutcome: {
    FOUND: 'found',
    NO_MATCH: 'no-match',
    NO_TOKEN: 'no-token',
    REFUSED: 'refused',
    UNAVAILABLE: 'unavailable',
  },
  Role: { USER: 'user', MODEL: 'model' },
};

const schema = createSchema<ApiContext>({
  typeDefs,
  resolvers: { Query, Mutation, Subscription, EmailedSuggestion, ...enums },
});

/** The request's headers as a plain record, as the session and rate-limit helpers read them. */
const headerRecord = (headers: globalThis.Headers): Headers => Object.fromEntries(headers.entries());

/** What Yoga's server context holds when api/graphql.ts serves a Node request. */
interface NodeServerContext {
  req?: { headers: Headers; socket?: { remoteAddress?: string } };
}

/**
 * A POST whose body isn't JSON is refused before anything reads it.
 * api/graphql.ts makes the same check on the Node request's own headers,
 * which on Vercel are what arrived: Vercel parses a form body into an
 * object, and Yoga's adapter then labels the request JSON.
 */
const jsonOnly: Plugin = {
  onRequest({ request, endResponse }) {
    if (request.method === 'POST' && !isJsonRequest(headerRecord(request.headers))) endResponse(notJson());
  },
};

/** The answer to a POST that isn't JSON. */
export const notJson = () => Response.json({ errors: [{ message: 'Requests must be sent as JSON' }] }, { status: 415 });

/**
 * The API as a Yoga server, its dependencies built on first use (so a
 * missing environment variable fails a request, not the function's load).
 * In `production` the schema can't be introspected.
 */
export function createApi(getDeps: () => ApiDeps, { production = false }: { production?: boolean } = {}) {
  const cookies = new WeakMap<Request, string[]>();
  const setCookies: Plugin = {
    onResponse({ request, response }) {
      for (const value of cookies.get(request) ?? []) response.headers.append('Set-Cookie', value);
    },
  };
  return createYoga<NodeServerContext, ApiContext>({
    schema,
    graphqlEndpoint: '/api/graphql',
    graphiql: false,
    landingPage: false,
    cors: false,
    logging: 'warn',
    plugins: [jsonOnly, csrfPrevention(), limits({ production }), setCookies],
    context: ({ request, req, waitUntil }) =>
      buildContext(getDeps(), {
        method: request.method,
        headers: req?.headers ?? headerRecord(request.headers),
        remoteAddress: req?.socket?.remoteAddress,
        setCookie: (value) => cookies.set(request, [...(cookies.get(request) ?? []), value]),
        defer: (work) => waitUntil(work),
      }),
  });
}

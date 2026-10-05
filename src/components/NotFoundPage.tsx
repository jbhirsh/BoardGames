import { useEffect } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import * as Sentry from '@sentry/react';

interface Props {
  title?: string;
  message?: string;
}

/**
 * A page for an address that leads nowhere, set like the home page's hero.
 * A caller's title names the tab too; the default heading is playful, so
 * the tab says plainly what happened instead.
 */
export default function NotFoundPage({
  title,
  message = "There's nothing at this address. The link may be old, or it has a typo.",
}: Props) {
  return (
    <main className="hero not-found">
      <title>{`${title ?? 'Page not found'} · The Game Room`}</title>
      {/* The SPA answers every path with 200, so keep these pages out of search. */}
      <meta name="robots" content="noindex" />
      <h1>{title ?? 'This box is empty'}</h1>
      <p className="hero-sub">{message}</p>
      <div className="hero-actions">
        <Link to="/" className="pick-btn">Browse the collection</Link>
      </div>
    </main>
  );
}

/**
 * The router's error page. Unknown addresses are caught by the catch-all
 * route, so anything here is a thrown error: a 404 response reads as not
 * found, and anything else is reported to Sentry.
 */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) Sentry.captureException(error);
  }, [error, notFound]);

  return notFound
    ? <NotFoundPage />
    : <NotFoundPage title="Something went wrong" message="This page hit a snag. Try reloading, or head back to the collection." />;
}

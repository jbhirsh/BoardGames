import { Suspense, type ReactNode } from 'react';
import { useParams, type Params } from 'react-router';
import BackLink from './BackLink';
import { pageClass } from './sharedClasses';

interface Props {
  /** What shows while the page's code loads: its header in grey (RouteFallback). */
  fallback: ReactNode;
  /**
   * Whether the address opens the page (utils/subPages.ts). Where it doesn't,
   * the page's code draws its full-screen not-found page, with no frame.
   */
  opens?: (params: Params) => boolean;
  /** The page, loaded on first open (lazyPages.ts). */
  children: ReactNode;
}

/**
 * What every page but the home page sits in: its column and the Back link,
 * then the page, loaded behind its grey header. The Back link is outside the
 * page's Suspense boundary, so it is one element from the first paint on:
 * when the fallback's own link gave way to the page's, a press begun on one
 * and ended on the other went to neither (a click goes to the nearest
 * element both halves landed on), and Back did nothing.
 */
export default function PageFrame({ fallback, opens, children }: Props) {
  const params = useParams();
  if (opens && !opens(params)) return <Suspense fallback={null}>{children}</Suspense>;
  return (
    <div className={pageClass}>
      <BackLink />
      <Suspense fallback={fallback}>{children}</Suspense>
    </div>
  );
}

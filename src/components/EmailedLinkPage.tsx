import type { ReactNode } from 'react';
import BackLink from './BackLink';
import { pageClass, pageHeaderClass, pageTitleClass } from './sharedClasses';
import { signInPanelClass } from './signInClasses';

/**
 * The page an emailed link opens (EmailedDecisionPage, SignInConfirmPage):
 * its heading and one panel, centred as one column the panel's width
 * (440px at most) under the back link, which stays at the page's left edge
 * where every page has it. Its link carried a token, so it asks
 * not to be indexed and sends no referrer, as the API's own pages did.
 */
export default function EmailedLinkPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={pageClass}>
      <title>{`${title} · The Game Room`}</title>
      <meta name="robots" content="noindex" />
      <meta name="referrer" content="no-referrer" />
      <header className={pageHeaderClass}>
        <BackLink />
        <h1 className={`${pageTitleClass} mx-auto max-w-110`}>{title}</h1>
      </header>
      <div className={`${signInPanelClass} mx-auto`}>{children}</div>
    </div>
  );
}

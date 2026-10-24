import type { ReactNode } from 'react';
import BackLink from './BackLink';

/**
 * The page an emailed link opens (EmailedDecisionPage, SignInConfirmPage):
 * its heading and one panel, centred as one column under the back link,
 * which stays where every page has it. Its link carried a token, so it asks
 * not to be indexed and sends no referrer, as the API's own pages did.
 */
export default function EmailedLinkPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rules-page">
      <title>{`${title} · The Game Room`}</title>
      <meta name="robots" content="noindex" />
      <meta name="referrer" content="no-referrer" />
      <header className="rules-header">
        <BackLink />
        <h1 className="rules-game-name emailed-column">{title}</h1>
      </header>
      <div className="signin-panel emailed-column">{children}</div>
    </div>
  );
}

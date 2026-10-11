import type { ReactNode } from 'react';
import { ErrorIcon, InfoIcon, WarningIcon } from './Icons';

export type NoticeTone = 'info' | 'warning' | 'error';

const ICONS: Record<NoticeTone, () => ReactNode> = { info: InfoIcon, warning: WarningIcon, error: ErrorIcon };

/**
 * The site's one-line message: what happened, in the tone's colours (the
 * --info-, --warn- and --danger- tokens in App.css) with an icon, so colour
 * is never the only signal, and an optional action. Announced politely, or
 * at once for an error; `live` false leaves that to a live region around
 * it, which would otherwise announce it a second time.
 */
export default function Notice({ tone, children, action, live = true }: {
  tone: NoticeTone;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  live?: boolean;
}) {
  const Icon = ICONS[tone];
  let role: 'alert' | 'status' | undefined;
  if (live) role = tone === 'error' ? 'alert' : 'status';
  return (
    <div className={`notice notice-${tone}`} role={role}>
      <span className="notice-icon"><Icon /></span>
      <span className="notice-text">{children}</span>
      {action && <button type="button" className="notice-action" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

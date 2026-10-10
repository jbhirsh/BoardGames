import type { ReactNode } from 'react';
import { ErrorIcon, InfoIcon, WarningIcon } from './Icons';

export type NoticeTone = 'info' | 'warning' | 'error';

const ICONS: Record<NoticeTone, () => ReactNode> = { info: InfoIcon, warning: WarningIcon, error: ErrorIcon };

/**
 * The site's one-line message: what happened, in the tone's colours (the
 * --info-, --warn- and --danger- tokens in App.css) with an icon, so colour
 * is never the only signal, and an optional action. Announced politely, or
 * at once for an error.
 */
export default function Notice({ tone, children, action }: {
  tone: NoticeTone;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const Icon = ICONS[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon"><Icon /></span>
      <span className="notice-text">{children}</span>
      {action && <button type="button" className="notice-action" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

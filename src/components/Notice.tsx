import type { ReactNode } from 'react';
import { ErrorIcon, InfoIcon, WarningIcon } from './Icons';

export type NoticeTone = 'info' | 'warning' | 'error';

const ICONS: Record<NoticeTone, () => ReactNode> = { info: InfoIcon, warning: WarningIcon, error: ErrorIcon };
const toneClasses: Record<NoticeTone, string> = {
  info: 'border-info-border bg-info-bg text-info-fg',
  warning: 'border-warn-border bg-warn-bg text-warn-fg',
  error: 'border-danger-border bg-danger-bg text-danger-fg',
};

/**
 * The site's one-line message: what happened, in the tone's colours (the
 * --color-info-, -warn- and -danger- tokens in index.css) with an icon, so colour
 * is never the only signal, and an optional action. Announced politely, or
 * at once for an error; `live` false leaves that to a live region around
 * it, which would otherwise announce it a second time. Use it rather than
 * a one-off coloured box: noticeTokens.test.ts holds its tokens to 4.5:1 in
 * both themes.
 */
export default function Notice({
  tone,
  children,
  action,
  live = true,
  className = '',
}: {
  tone: NoticeTone;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  live?: boolean;
  /** Its margin, where it sits. */
  className?: string;
}) {
  const Icon = ICONS[tone];
  let role: 'alert' | 'status' | undefined;
  if (live) role = tone === 'error' ? 'alert' : 'status';
  return (
    <div
      className={`notice notice-${tone} flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-[13px] leading-[1.45] ${toneClasses[tone]} ${className}`}
      role={role}
    >
      <span className="flex flex-none">
        <Icon />
      </span>
      <span className="notice-text min-w-0 flex-1">{children}</span>
      {action && (
        <button
          type="button"
          className="flex-none cursor-pointer rounded-[999px] border border-current px-3 py-1.5 font-semibold hover:bg-current/10"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

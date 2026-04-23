import type { MouseEventHandler } from 'react';

// Decorative click-to-dismiss layer for modals. A plain <div> intentionally —
// Escape and an explicit close button handle keyboard dismissal.
export default function Backdrop({ onClick }: { onClick: MouseEventHandler<HTMLDivElement> }) {
  return <div className="pick-backdrop" aria-hidden="true" onClick={onClick} />;
}

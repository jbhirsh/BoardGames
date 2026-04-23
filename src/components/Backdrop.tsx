import type { MouseEventHandler } from 'react';

// Decorative mouse-dismiss div — Escape and the close button cover keyboard dismissal.
export default function Backdrop({ onClick }: { onClick: MouseEventHandler<HTMLDivElement> }) {
  return <div className="pick-backdrop" aria-hidden="true" onClick={onClick} />;
}

import type { MouseEventHandler } from 'react';

// Decorative mouse-dismiss div — Escape and the close button cover keyboard dismissal.
export default function Backdrop({ onClick }: { onClick: MouseEventHandler<HTMLDivElement> }) {
  return (
    <div
      className="pick-backdrop absolute inset-0 cursor-pointer bg-black/50 backdrop-blur-[6px]"
      aria-hidden="true"
      onClick={onClick}
    />
  );
}

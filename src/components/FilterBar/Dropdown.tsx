import { pillClass } from './pillClasses';
import { useRef, useCallback, useEffect, useId, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

interface Props {
  id: string;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
}

export default function Dropdown({ id, label, isActive, isOpen, onToggle, children, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (isOpen) onToggle();
  }, [isOpen, onToggle]);

  useClickOutside(ref, close);

  // Escape shuts an open panel and puts focus back on its pill.
  const pillRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onToggle();
      pillRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onToggle]);
  const panelId = useId();

  return (
    <div
      className="relative shrink-0"
      ref={ref}
      style={style}
      // Tabbing out of an open dropdown shuts it, as a click elsewhere does,
      // so it never sits open behind something else (the picker's dialog).
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (isOpen && next && !e.currentTarget.contains(next)) onToggle();
      }}
    >
      <button
        ref={pillRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className={pillClass(isActive, isOpen)}
        onClick={onToggle}
      >
        {label}
        <span
          className={`inline-flex size-3 shrink-0 items-center [transition:transform_0.2s,opacity_0.18s] ${isOpen ? 'transform-[rotate(180deg)] opacity-[0.7]' : 'opacity-[0.4]'}`}
        >
          <svg
            className="size-3 align-middle text-text3 [transition:transform_0.22s_cubic-bezier(0.16,1,0.3,1),color_0.15s]"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 4l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div
          className="[pointer-events:all] absolute top-[calc(100%+7px)] left-0 z-300 min-w-55 origin-top-left transform-[translateY(0)_scale(1)] overflow-hidden rounded-control border border-border bg-surface opacity-100 shadow-(--shadow-lg) [transition:opacity_0.17s_cubic-bezier(0.16,1,0.3,1),transform_0.17s_cubic-bezier(0.16,1,0.3,1)]"
          id={panelId}
          data-dd={id}
        >
          {children}
        </div>
      )}
    </div>
  );
}

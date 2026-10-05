import { useRef, useCallback, useEffect, useId, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

interface Props {
  id: string;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClear: (e: React.MouseEvent) => void;
  children: ReactNode;
  style?: React.CSSProperties;
}

export default function Dropdown({ id, label, isActive, isOpen, onToggle, onClear, children, style }: Props) {
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
      className="dd-wrap"
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
        className={`dd-btn${isOpen ? ' open' : ''}${isActive ? ' active' : ''}`}
        onClick={onToggle}
      >
        {label}
        <span className="dd-arrow">
          <svg className="row-chevron" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {isActive && (
        <button className="dd-clear-x" onClick={onClear}>
          {'\u2715'}
        </button>
      )}
      {isOpen && (
        <div className="dd-panel open" id={panelId} data-dd={id}>
          {children}
        </div>
      )}
    </div>
  );
}

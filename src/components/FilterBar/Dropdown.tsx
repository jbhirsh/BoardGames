import { useRef, useCallback, type ReactNode } from 'react';
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

  return (
    <div className="dd-wrap" ref={ref} style={style}>
      <button
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
        <div className="dd-panel open" data-dd={id}>
          {children}
        </div>
      )}
    </div>
  );
}

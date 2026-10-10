export function ChevronIcon() {
  return (
    <svg className="row-chevron" viewBox="0 0 12 12" fill="none">
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function YouTubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z" />
    </svg>
  );
}

export function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 2a1 1 0 0 1 1-1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.5 9.5h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="5" y="6.5" width="6" height="1.5" rx=".5" fill="currentColor" opacity=".35" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 9 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A dial: how heavy a game is to learn. Three quarters of the clock's circle,
 * so it fills its box as the icons beside it do.
 */
export function GaugeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M4.1 11.9a5.5 5.5 0 1 1 7.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 8l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

export function AiRulesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" style={{ overflow: 'visible' }}>
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H10l4 4v9.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 14.5V2.5z" />
      <path d="M10 1l4 4h-3a1 1 0 0 1-1-1V1z" fill="currentColor" opacity=".3" />
      <rect x="4.5" y="6" width="7" height="1.4" rx=".7" fill="var(--surface, #fff)" />
      <rect x="4.5" y="8.5" width="7" height="1.4" rx=".7" fill="var(--surface, #fff)" />
      <rect x="4.5" y="11" width="5" height="1.4" rx=".7" fill="var(--surface, #fff)" />
      <path d="M12 8l1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5Z" fill="var(--surface, #fff)" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function CalculatorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="4" y="3" width="8" height="3" rx=".5" fill="currentColor" opacity=".3" />
      <circle cx="5.5" cy="9" r=".9" fill="currentColor" />
      <circle cx="8" cy="9" r=".9" fill="currentColor" />
      <circle cx="10.5" cy="9" r=".9" fill="currentColor" />
      <circle cx="5.5" cy="12" r=".9" fill="currentColor" />
      <circle cx="8" cy="12" r=".9" fill="currentColor" />
      <circle cx="10.5" cy="12" r=".9" fill="currentColor" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M1 4h14M1 8h14M1 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 2h2l1.6 8.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L14.5 5H4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="12" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function TrendIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 12l3.5-4 3 2.5L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 4H14v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Half light, half dark: follow the system's setting. */
export function AutoThemeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  );
}

/** The Notice component's tones: an i, an exclamation in a triangle, an x. */
export function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r=".9" fill="currentColor" />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7.1 2.4a1 1 0 0 1 1.8 0l5.6 10.2a1 1 0 0 1-.9 1.4H2.4a1 1 0 0 1-.9-1.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.2v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r=".9" fill="currentColor" />
    </svg>
  );
}

export function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

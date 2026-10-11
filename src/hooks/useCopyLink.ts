import { useEffect, useRef, useState } from 'react';

/**
 * Copies a link to the clipboard and reports `copied` for a moment after,
 * so the button can say "Copied!". The active filters' Share link and the
 * wishlist's Share wishlist both use it, each with its own URL.
 */
export function useCopyLink(): { copied: boolean; copy: (url: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  async function copy(url: string) {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard errors are transient permission denials; a fresh user gesture can retry
    }
  }

  return { copied, copy };
}

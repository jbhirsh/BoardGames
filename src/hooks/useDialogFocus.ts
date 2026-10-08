import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), button:not([disabled]), ' +
  '[contenteditable]:not([contenteditable="false"]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Keyboard handling for a modal dialog while it is open: focus moves to the
 * dialog, Escape closes it, and Tab and Shift+Tab cycle through what is
 * inside rather than leaving it. The dialog itself takes tabIndex={-1} so it
 * can hold focus before anything inside does.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    dialog?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!dialog.contains(active) || active === dialog) {
        // The dialog isn't in the focusables list: send Tab and Shift+Tab
        // to the first and last control.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref, open, onClose]);
}

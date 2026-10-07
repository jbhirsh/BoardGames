import { useMediaQuery } from './useMediaQuery';

// The same width as the stylesheet's phone block (App.css, max-width:520px).
const PHONE = '(max-width: 520px)';

/** True at phone widths, following the viewport as it turns or resizes. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE);
}

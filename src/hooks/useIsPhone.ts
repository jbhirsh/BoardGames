import { useMediaQuery } from './useMediaQuery';

// The same width as the stylesheet's phone classes (max-sm:, under the sm
// breakpoint's 521px in src/index.css).
const PHONE = '(max-width: 520px)';

/** True at phone widths, following the viewport as it turns or resizes. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE);
}

import { useEffect, useRef, type RefObject } from 'react';
import { useFilter } from '../context/useFilter';
import type { FilterState } from '../data/types';

/**
 * Scrolls a section's top back under the sticky header if it has gone above it.
 *
 * The header is measured here rather than read from the `--thead-top` that
 * useStickyOffset publishes: that comes from a ResizeObserver, which only
 * reports on the next frame, so right after a filter change that adds or
 * drops the active-tag row it still holds the old height. The header is
 * found by its data attribute, as its class is styling's.
 */
export function keepSectionInView(section: HTMLElement) {
  const header = document.querySelector<HTMLElement>('[data-sticky-header]');
  const headerHeight = header?.offsetHeight ?? 0;
  const sectionTop = section.getBoundingClientRect().top;
  if (sectionTop < headerHeight) {
    const targetY = window.scrollY + sectionTop - headerHeight;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'instant' });
  }
}

/**
 * What a section lists depends on: every field of the filter state but the
 * view, so a field added later counts without being named here. Switching
 * between grid and table leaves the reader where they are. By value (the
 * keyword set sorted, so the order tags were picked in doesn't matter), so
 * an action that leaves the filters as they were doesn't count as a change.
 */
const contentsKey = (state: FilterState) =>
  JSON.stringify({ ...state, keywords: [...state.keywords].sort(), view: null });

/**
 * When a filter change shrinks a section, the document can get short enough
 * that the section's header ends up above the viewport, under the sticky
 * filter bar. This scrolls it back into place. The first render is skipped
 * (nothing shrank yet), and so is an inactive section: the hidden half of the
 * Own/Want toggle has no geometry to correct.
 */
export function useKeepSectionInView(sectionRef: RefObject<HTMLElement | null>, active = true) {
  const { state } = useFilter();
  const contents = contentsKey(state);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!active) return;
    const section = sectionRef.current;
    if (section) keepSectionInView(section);
  }, [active, sectionRef, contents]);
}

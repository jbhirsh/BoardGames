import { useEffect, useRef, type RefObject } from 'react';
import { useFilter } from '../context/useFilter';

/**
 * When a filter change shrinks a section, the document can get short enough
 * that the section's header ends up above the viewport, under the sticky
 * filter bar. This scrolls it back into place. The first render is skipped
 * (nothing shrank yet), and so is an inactive section: the hidden half of the
 * Own/Want toggle has no geometry to correct.
 */
export function useKeepSectionInView(sectionRef: RefObject<HTMLElement | null>, active = true) {
  const { state } = useFilter();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!active) return;
    const section = sectionRef.current;
    if (!section) return;
    const header = document.querySelector('.sticky-header') as HTMLElement | null;
    const headerHeight = header?.offsetHeight ?? 0;
    const sectionTop = section.getBoundingClientRect().top;
    if (sectionTop < headerHeight) {
      const targetY = window.scrollY + sectionTop - headerHeight;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'instant' });
    }
  }, [active, sectionRef, state.duration, state.players, state.keywords, state.keywordMode, state.search, state.sort]);
}

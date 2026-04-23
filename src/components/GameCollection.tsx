import { useEffect, useRef } from 'react';
import { useFilter } from '../context/useFilter';
import ViewToggle from './ViewToggle';
import GridView from './GridView';
import ListView from './ListView';
import RandomPicker from './RandomPicker';

export default function GameCollection() {
  const { state, filteredGames } = useFilter();
  const sectionRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const section = sectionRef.current;
    if (!section) return;
    const header = document.querySelector('.sticky-header') as HTMLElement | null;
    const headerHeight = header?.offsetHeight ?? 0;
    const sectionTop = section.getBoundingClientRect().top;
    if (sectionTop < headerHeight) {
      const targetY = window.scrollY + sectionTop - headerHeight;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'instant' });
    }
  }, [state.duration, state.players, state.keywords, state.keywordMode, state.search, state.sort]);

  return (
    <section ref={sectionRef}>
      <div className="sec-hd">
        <h2 className="sec-title">Our Collection</h2>
        <span className="sec-count">{filteredGames.length} games</span>
        <div className="sec-right">
          <RandomPicker />
          <ViewToggle />
        </div>
      </div>
      {state.view === 'grid' ? <GridView /> : <ListView />}
    </section>
  );
}

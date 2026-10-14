import { useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { GAMES } from '../data/games';
import { useFilter } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import { REDUCED_MOTION, useMediaQuery } from '../hooks/useMediaQuery';
import { filterWishlist } from '../utils/filterGames';
import { focusTarget } from '../client/focus';
import { ownCovers, wantCovers, SECONDS_PER_COVER, STILL_COUNT, type HeroCover } from '../utils/heroCovers';
import { PauseIcon, PlayIcon } from './Icons';

// The first covers on screen load with the page. The rest wait (lazy)
// until it has settled, then all load: a lazy image in the clipped row
// only starts once it is already gliding into view, and would show its
// blank matte for a moment.
const EAGER = 8;
const WARM_MS = 1500;

/**
 * Takes the reader to a game's card or row: scrolled to the top of the
 * view, under the sticky bar (their scroll-margin), with focus on its name
 * or its row's toggle so a keyboard user carries on from there, and a
 * brief ring to show which one it is. Before the wishlist has loaded its
 * entries aren't on the page yet, so the section itself stands in.
 */
function jumpTo(anchor: string) {
  const target = document.getElementById(anchor);
  const landing = target ?? document.getElementById('collection')!;
  landing.scrollIntoView({ block: 'start' });
  focusTarget(landing, target ? 'item' : 'title', { preventScroll: true });
  if (!target) return;
  target.classList.remove('jump-arrive');
  // Read layout so the ring starts over when the same cover is clicked twice.
  void target.offsetWidth;
  target.classList.add('jump-arrive');
  target.addEventListener('animationend', () => target.classList.remove('jump-arrive'), { once: true });
}

/**
 * The hero's covers, gliding sideways in an endless row: every game in the
 * collection, or on the wishlist while the Own/Want toggle shows it. The
 * row is drawn twice side by side and slid left by one copy's width, so
 * the loop never jumps; the second copy is hidden from screen readers and
 * the Tab order, so each game is met once. Each cover takes the reader to
 * its game in the list below. The row is one Tab stop, as a toolbar is,
 * with the arrow keys (and Home, End) between its covers, so the filters
 * stay a few Tabs from the top rather than thirty.
 *
 * It holds still while pointed at, while a cover has focus, while off
 * screen or in a background tab, and for good with its pause button
 * (WCAG 2.2.2). For people who ask for less motion it doesn't move at all:
 * the favourites stand in a still row, as the shelf did, and there is
 * nothing to pause.
 */
export default function CoverCarousel({ want }: { want: boolean }) {
  const { state, dispatch, filteredGames } = useFilter();
  const { items } = useWishlistItems();
  const still = useMediaQuery(REDUCED_MOTION);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const [warm, setWarm] = useState(false);
  // The cover the row's Tab stop is on: the last one a key moved to.
  const [active, setActive] = useState(0);
  const reelRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const covers = useMemo(() => (want ? wantCovers(items) : ownCovers(GAMES)), [want, items]);
  const shown = still ? covers.slice(0, STILL_COUNT) : covers;
  const stop = Math.min(active, shown.length - 1);

  // Off screen or in a hidden tab there is no one to see it move.
  useEffect(() => {
    if (still) return;
    let offscreen = false;
    const update = () => setIdle(offscreen || document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      offscreen = !entry.isIntersecting;
      update();
    });
    io.observe(reelRef.current!);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [still]);

  useEffect(() => {
    const timer = setTimeout(() => setWarm(true), WARM_MS);
    return () => clearTimeout(timer);
  }, []);

  const show = (cover: HeroCover) => {
    // A game the filters hide has no card to go to: clear them (as the
    // bar's Clear all does, keeping the view and the list) so it has one.
    const listed = want
      ? filterWishlist(items, state).some((w) => w.id === cover.id)
      : filteredGames.some((g) => g.slug === cover.id);
    if (!listed) flushSync(() => dispatch({ type: 'CLEAR_ALL' }));
    jumpTo(cover.anchor);
  };

  // A cover Tabbed to may be off the visible stretch, or under its faded
  // ends. The row can't scroll (it clips), so wind the animation, which
  // focus has paused, to the time that puts the cover in the middle. Not
  // for a click's focus, though: the row would jump out from under the
  // pointer between press and release, and the click would go nowhere.
  const reveal = (e: FocusEvent<HTMLElement>) => {
    const anim = trackRef.current!.getAnimations?.()[0];
    if (!anim || !e.currentTarget.matches(':focus-visible')) return;
    const li = e.currentTarget.parentElement!;
    const view = viewRef.current!.getBoundingClientRect();
    const box = li.getBoundingClientRect();
    // The faded ends: App.css's --reel-fade, clamp(40px, 12vw, 200px), on a
    // row as wide as the screen.
    const fade = Math.min(200, Math.max(40, view.width * 0.12));
    if (box.left >= view.left + fade && box.right <= view.right - fade) return;
    const half = trackRef.current!.scrollWidth / 2;
    const offset = li.offsetLeft + li.offsetWidth / 2 - view.width / 2;
    const lap = Number(anim.effect!.getComputedTiming().duration);
    anim.currentTime = ((((offset % half) + half) % half) / half) * lap;
  };

  const move = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: shown.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = (to + shown.length) % shown.length;
    setActive(next);
    e.currentTarget.closest('ul')!.querySelectorAll<HTMLElement>('.hero-reel-cover')[next].focus();
  };

  const list = (copy: boolean) => (
    <ul
      className="hero-reel-list"
      aria-label={copy ? undefined : want ? 'Wishlist covers' : 'Collection covers'}
      aria-hidden={copy || undefined}
    >
      {shown.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            className="hero-reel-cover"
            aria-label={`Show ${c.name} in the list`}
            title={c.name}
            tabIndex={copy || i !== stop ? -1 : 0}
            onClick={() => show(c)}
            // A click on the hidden copy mustn't leave focus inside it.
            onMouseDown={copy ? (e) => e.preventDefault() : undefined}
            onFocus={copy ? undefined : reveal}
            onKeyDown={copy ? undefined : (e) => move(e, i)}
          >
            <img
              src={c.img}
              alt=""
              width={120}
              height={120}
              decoding="async"
              loading={warm || (!copy && i < EAGER) ? undefined : 'lazy'}
            />
          </button>
        </li>
      ))}
    </ul>
  );

  const lap = { '--reel-lap': `${covers.length * SECONDS_PER_COVER}s` } as CSSProperties;
  const classes = ['hero-reel', still && 'hero-reel--still', paused && 'is-paused', idle && 'is-idle'].filter(Boolean).join(' ');

  return (
    <div ref={reelRef} className={classes} style={lap}>
      {/* First in the Tab order, ahead of the covers; App.css sets it under the row. */}
      {!still && (
        <button
          type="button"
          className="hero-reel-toggle"
          aria-label={paused ? 'Play cover carousel' : 'Pause cover carousel'}
          title={paused ? 'Play' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      )}
      <div ref={viewRef} className="hero-reel-view">
        {/* Keyed on the list, so a switch starts the new row from its first cover. */}
        <div ref={trackRef} className="hero-reel-track" key={want ? 'want' : 'own'}>
          {list(false)}
          {!still && list(true)}
        </div>
      </div>
    </div>
  );
}

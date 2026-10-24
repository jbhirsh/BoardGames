import type { ReactNode } from 'react';
import type { Game } from '../data/types';
import BackLink from './BackLink';
import { pageDescClass, pageHeaderClass, pageTitleClass } from './sharedClasses';

interface Props {
  /** The page's heading. */
  title: string;
  /** The line under it. */
  desc: string;
  /**
   * The game whose box art leads the title row, or `true` for a grey box
   * the art's size, which is all the header shows of it while loading.
   */
  art?: Pick<Game, 'img' | 'name'> | boolean;
  /**
   * Draws the header as the page's stand-in while its code loads
   * (RouteFallback): the heading and its line are grey bars the size of
   * their words, the row is hidden from screen readers, and a status says
   * the page is loading.
   */
  loading?: boolean;
  /** The buttons beside the title. */
  children?: ReactNode;
}

/**
 * The header of every sub-page: Back to the list, then the game's box art,
 * the page's name and a line under it, and the page's buttons. The loading
 * fallback draws the same header, so the page drops in without moving.
 */
// The box art, smaller on a phone.
const artClass =
  'rules-box-art size-16 shrink-0 rounded-control border border-border bg-art-matte object-cover filter-(--art-dim) sm:size-20';
// A loading page's words, in grey bars the length of the words to come.
const skeletonClass = 'skeleton-text rounded-md bg-bg3 box-decoration-clone text-transparent';

export default function PageHeader({ title, desc, art, loading = false, children }: Props) {
  return (
    // Loading, it all pulses in grey, the header restyling its parts so they
    // are the very ones the page draws.
    <header
      className={`${pageHeaderClass} ${loading ? '[&_.rules-box-art]:bg-bg3 [&_.rules-title-row]:animate-fallback-pulse' : ''}`}
    >
      <BackLink />
      {loading && (
        <p className="sr-only" role="status">
          Loading…
        </p>
      )}
      {/* On a phone the art and the title share a line, the buttons wrapping
          under them, so the description isn't squeezed into a word a line. */}
      <div
        className="rules-title-row flex flex-wrap items-start gap-3.5 sm:flex-nowrap sm:items-center sm:gap-5"
        aria-hidden={loading || undefined}
      >
        {art &&
          (loading || art === true ? (
            <div className={artClass} />
          ) : (
            <img src={art.img} alt={`${art.name} box art`} className={artClass} />
          ))}
        <div className="rules-title-info min-w-0 flex-[1_1_calc(100%-78px)] sm:flex-1">
          {loading ? (
            <>
              <div className={pageTitleClass}>
                <span className={skeletonClass}>{title}</span>
              </div>
              <div className={pageDescClass}>
                <span className={skeletonClass}>{desc}</span>
              </div>
            </>
          ) : (
            <>
              <h1 className={pageTitleClass}>{title}</h1>
              <p className={pageDescClass}>{desc}</p>
            </>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

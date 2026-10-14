import type { ReactNode } from 'react';
import type { Game } from '../data/types';
import BackLink from './BackLink';

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
export default function PageHeader({ title, desc, art, loading = false, children }: Props) {
  return (
    <header className="rules-header">
      <BackLink />
      {loading && <p className="sr-only" role="status">Loading…</p>}
      <div className="rules-title-row" aria-hidden={loading || undefined}>
        {art && (loading || art === true
          ? <div className="rules-box-art" />
          : <img src={art.img} alt={`${art.name} box art`} className="rules-box-art" />)}
        <div className="rules-title-info">
          {loading ? (
            <>
              <div className="rules-game-name"><span className="skeleton-text">{title}</span></div>
              <div className="rules-game-desc"><span className="skeleton-text">{desc}</span></div>
            </>
          ) : (
            <>
              <h1 className="rules-game-name">{title}</h1>
              <p className="rules-game-desc">{desc}</p>
            </>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

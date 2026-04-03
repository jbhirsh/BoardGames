import { Link } from 'react-router';
import type { Game, KeywordId } from '../data/types';
import { ytURL, rulesURL } from '../utils/urls';
import { sortedKw } from '../utils/filterGames';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import { YouTubeIcon, PdfIcon, UserIcon, ClockIcon } from './Icons';

interface Props {
  game: Game;
}

export default function GameCard({ game }: Props) {
  return (
    <div className="game-card">
      <div className="card-img">
        <img src={game.img} alt={`${game.name} box art`} loading="lazy" />
      </div>
      <div className="card-head">
        <div className="card-row1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="card-name">{game.name}</h3>
          <DurationPill cat={game.cat} />
        </div>
        <div className="card-meta">
          <span className="cmeta">
            <UserIcon /> {game.players}
          </span>
          <span className="cmeta">
            <ClockIcon /> {game.dur}
          </span>
        </div>
      </div>
      <div className="card-kw">
        {sortedKw(game.kw).map((kw) => (
          <KeywordPill key={kw} keyword={kw as KeywordId} />
        ))}
      </div>
      <div className="card-body">
        <p className="card-desc">{game.short}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '0 18px 16px' }}>
        {game.rules ? (
          <Link className="rules-btn" to={`/rules/${game.slug}`} title="Rules PDF">
            <PdfIcon />
          </Link>
        ) : (
          <a
            className="rules-btn"
            href={rulesURL(game.name)}
            onClick={(e) => { e.preventDefault(); window.open(rulesURL(game.name), '_blank'); }}
            title="Rules PDF"
          >
            <PdfIcon />
          </a>
        )}
        <a
          className="row-yt"
          href={ytURL(game.yt)}
          onClick={(e) => { e.preventDefault(); window.open(ytURL(game.yt), '_blank'); }}
          title="Watch Tutorial"
        >
          <YouTubeIcon />
        </a>
      </div>
    </div>
  );
}

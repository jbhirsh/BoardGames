import { Link } from 'react-router';
import type { Game, KeywordId } from '../data/types';
import { KW } from '../data/keywords';
import { useFilter } from '../context/FilterContext';
import { ytURL, rulesURL } from '../utils/urls';
import { sortedKw } from '../utils/filterGames';
import KeywordPill from './KeywordPill';
import { YouTubeIcon, AiRulesIcon, UserIcon, ClockIcon } from './Icons';

interface Props {
  game: Game;
}

export default function GameCard({ game }: Props) {
  const { state, dispatch } = useFilter();

  return (
    <div className="game-card">
      <div className="card-head">
        <img src={game.img} alt={`${game.name} box art`} className="card-corner-img" loading="lazy" />
        <h3 className="card-name">{game.name}</h3>
        <div className="card-meta">
          <span className="cmeta">
            <UserIcon /> {game.players}
          </span>
          <span className="cmeta">
            <ClockIcon /> {game.dur}
          </span>
        </div>
        <div className="card-kw">
          {sortedKw(game.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw as KeywordId}
              active={state.keywords.has(kw as KeywordId) || (!!state.search && KW[kw as KeywordId].toLowerCase().includes(state.search.toLowerCase().trim()))}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw as KeywordId })}
            />
          ))}
        </div>
      </div>
      <div className="card-body">
        <p className="card-desc">{game.short}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '0 18px 16px' }}>
        {game.rules ? (
          <Link className="rules-btn" to={`/rules/${game.slug}`} title="Rules">
            <AiRulesIcon /> Rules
          </Link>
        ) : (
          <a
            className="rules-btn"
            href={rulesURL(game.name)}
            onClick={(e) => { e.preventDefault(); window.open(rulesURL(game.name), '_blank'); }}
            title="Rules"
          >
            <AiRulesIcon /> Rules
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

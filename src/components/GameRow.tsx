import { Link } from 'react-router';
import type { Game, KeywordId } from '../data/types';
import { KW } from '../data/keywords';
import { useFilter } from '../context/useFilter';
import { ytURL, rulesURL } from '../utils/urls';
import { sortedKw } from '../utils/filterGames';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import { ChevronIcon, YouTubeIcon, AiRulesIcon, CalculatorIcon, SearchIcon } from './Icons';

interface Props {
  game: Game;
  isOpen: boolean;
  onToggle: () => void;
  showGroupBadge: boolean;
}

export default function GameRow({ game, isOpen, onToggle, showGroupBadge }: Props) {
  const { state, dispatch } = useFilter();
  const searchMatch = (kw: KeywordId) =>
    state.keywords.has(kw) || (!!state.search && KW[kw].toLowerCase().includes(state.search.toLowerCase().trim()));

  return (
    <>
      <tr className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle}>
        <td className="col-name">
          <div className="col-name-wrap">
            <span className="col-name">{game.name}</span>
            {showGroupBadge && <span className="group-badge">{game.group}</span>}
            <span className="mobile-short">{game.short}</span>
          </div>
        </td>
        <td className="col-hide col-players-h col-players">{game.players}</td>
        <td>
          <DurationPill
            cat={game.cat}
            className="row-dur"
            onClick={() => dispatch({ type: 'SET_DURATION', payload: game.cat })}
          />
        </td>
        <td className="col-hide col-short">{game.short}</td>
        <td className="col-hide col-tags col-kw">
          {sortedKw(game.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw as KeywordId}
              active={searchMatch(kw as KeywordId)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw as KeywordId })}
            />
          ))}
        </td>
        <td className="col-actions">
          <span>
            <ChevronIcon />
          </span>
        </td>
      </tr>
      <tr className="row-expand">
        <td colSpan={6} style={{ padding: 0 }}>
          <div className="row-expand-inner">
            <div className="row-expand-content">
              <div
                className="detail-section"
                dangerouslySetInnerHTML={{ __html: game.detail }}
              />
              <div className="row-expand-foot">
                {game.rules ? (
                  <Link
                    className="rules-link"
                    to={`/rules/${game.slug}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AiRulesIcon /> Rules
                  </Link>
                ) : (
                  <a
                    className="rules-link"
                    href={rulesURL(game.name)}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(rulesURL(game.name), '_blank'); }}
                  >
                    <AiRulesIcon /> Rules
                  </a>
                )}
                {game.slug === '7-wonders' && (
                  <Link
                    className="rules-link"
                    to={`/score/${game.slug}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CalculatorIcon /> Score
                  </Link>
                )}
                {game.slug === 'bananagrams' && (
                  <Link
                    className="rules-link"
                    to="/word-checker"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SearchIcon /> Word Checker
                  </Link>
                )}
                <a
                  className="row-yt"
                  href={ytURL(game.yt)}
                  aria-label={`Watch ${game.name} tutorial on YouTube`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(ytURL(game.yt), '_blank'); }}
                >
                  <YouTubeIcon />
                </a>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

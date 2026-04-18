import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { GAMES } from '../data/games';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';

export default function RulesPage() {
  const { slug } = useParams<{ slug: string }>();
  const game = GAMES.find(g => g.slug === slug);
  const [wordCheckerOpen, setWordCheckerOpen] = useState(false);

  if (!game) {
    return (
      <div className="rules-page">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <h1 className="rules-not-found">Game not found</h1>
      </div>
    );
  }

  return (
    <RulesChatProvider>
      <div className="rules-page">
        <header className="rules-header">
          <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
          <div className="rules-title-row">
            <img
              src={game.img}
              alt={`${game.name} box art`}
              className="rules-box-art"
            />
            <div className="rules-title-info">
              <h1 className="rules-game-name">{game.name}</h1>
              <p className="rules-game-desc">{game.short}</p>
            </div>
            <RulesChatToggle />
            {game.slug === 'bananagrams' && (
              <button
                className="rules-chat-toggle"
                onClick={() => setWordCheckerOpen(o => !o)}
              >
                {wordCheckerOpen ? 'Close Word Checker' : 'Word Checker'}
              </button>
            )}
          </div>
        </header>
        <RulesChatPanel slug={game.slug} gameName={game.name} />
        {wordCheckerOpen && <WordChecker />}
        <div className="rules-viewer">
          <iframe src={game.rules} title={`${game.name} rules`} />
        </div>
        <a href={game.rules} download className="rules-download">
          Download PDF
        </a>
      </div>
    </RulesChatProvider>
  );
}

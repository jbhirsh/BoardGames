import BackLink from './BackLink';
import { GAMES } from '../data/games';
import WordChecker from './WordChecker';

export default function WordCheckerPage() {
  const game = GAMES.find(g => g.slug === 'bananagrams');

  if (!game) return null;

  return (
    <div className="rules-page">
      <title>Word Checker · The Game Room</title>
      <header className="rules-header">
        <BackLink />
        <div className="rules-title-row">
          <img src={game.img} alt={`${game.name} box art`} className="rules-box-art" />
          <div className="rules-title-info">
            <h1 className="rules-game-name">Word Checker</h1>
            <p className="rules-game-desc">{game.name}</p>
          </div>
        </div>
      </header>

      <WordChecker />
    </div>
  );
}

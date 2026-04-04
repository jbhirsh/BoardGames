import { useParams, Link } from 'react-router';
import { GAMES } from '../data/games';
import RulesChat from './RulesChat';

export default function RulesPage() {
  const { slug } = useParams<{ slug: string }>();
  const game = GAMES.find(g => g.slug === slug);

  if (!game) {
    return (
      <div className="rules-page">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <h1 className="rules-not-found">Game not found</h1>
      </div>
    );
  }

  return (
    <div className="rules-page">
      <header className="rules-header">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <div className="rules-title-row">
          <img
            src={game.img}
            alt={`${game.name} box art`}
            className="rules-box-art"
          />
          <div>
            <h1 className="rules-game-name">{game.name}</h1>
            <p className="rules-game-desc">{game.short}</p>
          </div>
        </div>
      </header>
      <div className="rules-viewer">
        <iframe src={game.rules} title={`${game.name} rules`} />
      </div>
      <a href={game.rules} download className="rules-download">
        Download PDF
      </a>
      <RulesChat slug={game.slug} gameName={game.name} />
    </div>
  );
}

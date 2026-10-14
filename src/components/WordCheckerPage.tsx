import PageHeader from './PageHeader';
import { GAMES } from '../data/games';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import WordChecker from './WordChecker';

export default function WordCheckerPage() {
  const game = GAMES.find(g => g.slug === WORD_CHECKER_GAME);

  if (!game) return null;

  return (
    <div className="rules-page">
      <title>Word Checker · The Game Room</title>
      <PageHeader title="Word Checker" desc={game.name} art={game} />

      <WordChecker />
    </div>
  );
}

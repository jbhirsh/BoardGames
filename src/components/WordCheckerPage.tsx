import PageHeader from './PageHeader';
import { GAMES } from '../data/games';
import WordChecker from './WordChecker';

export default function WordCheckerPage() {
  const game = GAMES.find(g => g.slug === 'bananagrams');

  if (!game) return null;

  return (
    <div className="rules-page">
      <title>Word Checker · The Game Room</title>
      <PageHeader title="Word Checker" desc={game.name} art={game} />

      <WordChecker />
    </div>
  );
}

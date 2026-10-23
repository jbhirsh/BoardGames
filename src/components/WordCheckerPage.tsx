import PageHeader from './PageHeader';
import { GAMES } from '../data/games';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import WordChecker from './WordChecker';

/**
 * /word-checker: the word checker on a page of its own, for the game in
 * data/wordChecker.ts (Bananagrams), wearing its box art. Its card and
 * list row link here; its rules page opens the checker in place instead.
 * How a word is judged is WordChecker's.
 */
export default function WordCheckerPage() {
  const game = GAMES.find((g) => g.slug === WORD_CHECKER_GAME);

  if (!game) return null;

  return (
    <div className="rules-page">
      <title>Word Checker · The Game Room</title>
      <PageHeader title="Word Checker" desc={game.name} art={game} />

      <WordChecker />
    </div>
  );
}

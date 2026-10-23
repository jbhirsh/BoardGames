import { useParams } from 'react-router';
import { ALL_GAMES } from '../data/games';
import { scorePadFor } from '../data/scoreCalculators';
import NotFoundPage from './NotFoundPage';
import ScorePadFrame from './ScorePadFrame';
import SevenWondersPad from './SevenWondersPad';

/**
 * /score/:slug: the score pad for a game in data/scoreCalculators.ts;
 * anything else gets the not-found page. Each pad sits in the same frame
 * (ScorePadFrame: the header, the screen kept on) and keeps the game in
 * progress in localStorage, so it survives a reload. 7 Wonders is scored a
 * player at a time, the phone passed round the table, then Results, a sheet
 * like the printed pad (PlayerScorePad).
 */
export default function ScoreCalculatorPage() {
  const { slug = '', part } = useParams<{ slug: string; part?: string }>();
  const game = ALL_GAMES.find(g => g.slug === slug);
  const sub = part === undefined ? undefined : game?.subgames?.find(s => s.slug === part);
  const pad = scorePadFor(slug, part);

  if (!game || !pad || (part !== undefined && !sub)) {
    return <NotFoundPage title="No score calculator" message="There's no score calculator for that game. Pick a game from the collection to see what it has." />;
  }

  return (
    <ScorePadFrame name={sub?.name ?? game.name} art={game}>
      {pad.kind === 'seven-wonders' && <SevenWondersPad />}
    </ScorePadFrame>
  );
}

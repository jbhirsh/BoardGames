import { useParams } from 'react-router';
import { ALL_GAMES } from '../data/games';
import { scorePadFor } from '../data/scoreCalculators';
import NotFoundPage from './NotFoundPage';
import ScorePadFrame from './ScorePadFrame';
import SevenWondersPad from './SevenWondersPad';
import TicketToRidePad from './TicketToRidePad';
import DominionPad from './DominionPad';
import RoundScorePad from './RoundScorePad';

/**
 * /score/:slug/:part?: the score pad for a game in data/scoreCalculators.ts,
 * or (`part`) for a game inside one, a deck's Hearts at
 * /score/card-deck/hearts; anything else gets the not-found page. Each pad
 * sits in the same frame (ScorePadFrame: the header, the screen kept on)
 * and keeps the game in progress in localStorage, so it survives a reload.
 * The pads:
 *   - 7 Wonders, Ticket to Ride and Dominion are scored a player at a time,
 *     the phone passed round the table, then Results, a sheet like the
 *     printed pad (PlayerScorePad).
 *   - The card games run round by round, every player's score in one table
 *     to the game's target (RoundScorePad).
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
      {pad.kind === 'ticket-to-ride' && <TicketToRidePad />}
      {pad.kind === 'dominion' && <DominionPad />}
      {/* Keyed: Back from Golf to Hearts is the same route, and must not
          carry Golf's table (and save it as Hearts'). */}
      {pad.kind === 'rounds' && <RoundScorePad key={pad.game} game={pad.game} />}
    </ScorePadFrame>
  );
}

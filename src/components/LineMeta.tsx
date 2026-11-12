import type { ReactNode } from 'react';

interface Props {
  /** "2–4", or empty where a wishlist suggestion has none. */
  players: string;
  dur: string;
  /**
   * The difficulty's word (`difficultyWord`): "Light", or a deck's
   * "Light–Medium"; a grey bar while the games query is out.
   */
  difficulty: ReactNode;
  /**
   * Always say "players", wrapping between the parts where they don't fit
   * on one line: a wishlist line's text, beside its vote, is too narrow for
   * most of its lines to keep the word on one (170px on an iPhone Pro).
   */
  wrap?: boolean;
}

/**
 * The short line under a name on a phone's list (PhoneLine), a collection
 * game's and a wishlist entry's alike: "2–4 players · 30 min · Light",
 * leaving out what isn't known. A collection game's says "players" where the
 * line has room for it on one line (a container query on the line's text),
 * as on an iPhone Pro, and "2–4" where it wouldn't; a wishlist entry's
 * (`wrap`) always says it. A part never breaks inside itself.
 */
export default function LineMeta({ players, dur, difficulty, wrap = false }: Props) {
  const word = players === '1' ? 'player' : 'players';
  const parts = [
    {
      key: 'players',
      part: players && (
        <>
          {players}
          {/* "2–4 players" where every line's players, time and weight fit on
              one line with the word (232px of text on a 402px iPhone Pro, where
              Card Deck's, the longest, takes 224px), "2–4" where they wouldn't. */}
          <span className={wrap ? undefined : '[@container_(max-width:225px)]:hidden'}> {word}</span>
        </>
      ),
    },
    { key: 'dur', part: dur },
    { key: 'difficulty', part: difficulty },
  ].filter(({ part }) => part);
  return parts.map(({ key, part }, i) => (
    <span key={key}>
      {i > 0 && ' · '}
      <span className="whitespace-nowrap">{part}</span>
    </span>
  ));
}

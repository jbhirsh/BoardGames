import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { ALL_GAMES } from '../data/games';
import { scorePadLink } from '../data/scoreCalculators';
import { WORD_CHECKER_GAME } from '../data/wordChecker';
import { rulebooks } from '../utils/rulebooks';
import PageHeader from './PageHeader';
import { AiRulesIcon, CalculatorIcon } from './Icons';

interface Props {
  /** The page's heading, drawn as a bar its size (the words aren't shown). */
  title?: string;
  /** The line under the heading, likewise. */
  desc?: string;
  /** Whether the page's header has box art. */
  art?: boolean;
  /** Its header's buttons, the same elements, greyed and inert. */
  children?: ReactNode;
}

/**
 * What a page shows while its code loads (main.tsx loads every page but the
 * home page when it is first opened): its header in grey, with the Back link
 * working, so a slow connection shows where the page is going rather than a
 * blank screen. The bars are the header's own text, laid out in the page's
 * fonts and hidden, so they wrap where the page's would and the page drops in
 * without moving.
 */
export default function RouteFallback({ title = 'The Game Room', desc = 'Loading', art = true, children }: Props) {
  return (
    <div className="rules-page route-fallback" aria-busy="true">
      <PageHeader title={title} desc={desc} art={art} loading>
        {children}
      </PageHeader>
    </div>
  );
}

/**
 * The rules page's, sized by its game's name and rulebook line and the
 * buttons RulesPage puts beside them (the data is in the main bundle), since
 * on a phone a long name wraps and two buttons may stack.
 */
export function RulesFallback() {
  const { slug, part } = useParams<{ slug: string; part?: string }>();
  const game = ALL_GAMES.find((g) => g.slug === slug);
  const book = game && rulebooks(game).find((b) => b.part === part);
  if (!game || !book) return <RouteFallback />;
  return (
    <RouteFallback title={game.name} desc={book.short}>
      <button type="button" className="rules-chat-toggle" disabled><AiRulesIcon size={16} />AI Rules Assistant</button>
      {scorePadLink(game.slug, book.part) && <span className="rules-chat-toggle"><CalculatorIcon /> Score calculator</span>}
      {game.slug === WORD_CHECKER_GAME && <button type="button" className="rules-chat-toggle" disabled>Word Checker</button>}
    </RouteFallback>
  );
}

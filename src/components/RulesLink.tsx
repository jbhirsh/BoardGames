import { Link } from 'react-router';
import type { Game } from '../data/types';
import { useItemFilter } from '../context/useFilter';
import { FROM_LIST } from '../utils/fromList';
import { rulesPathFor } from '../utils/rulebooks';
import { rulesURL } from '../utils/urls';
import { AiRulesIcon } from './Icons';
import ExternalLink from './ExternalLink';

/**
 * A game's Rules action, the same on a card and on a list row's expanded
 * panel. Thirty of them share a page, so each is named for its game, and
 * the name starts with the word on the button (WCAG 2.5.3, label in name):
 * "Rules for Catan". The tooltip says the same, so no browser reads a
 * bare "Rules" after it as a description. The click stops at the link, so
 * the row it sits under doesn't toggle too. A game without a bundled
 * rulebook searches for one.
 */
export default function RulesLink({ game, className }: { game: Game; className: string }) {
  const filter = useItemFilter();
  const label = `Rules for ${game.name}`;
  const content = <><AiRulesIcon /> Rules</>;
  return game.rules ? (
    <Link
      className={className}
      to={rulesPathFor(game, filter)}
      state={FROM_LIST}
      aria-label={label}
      title={label}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </Link>
  ) : (
    <ExternalLink className={className} href={rulesURL(game.name)} aria-label={label} title={label}>
      {content}
    </ExternalLink>
  );
}

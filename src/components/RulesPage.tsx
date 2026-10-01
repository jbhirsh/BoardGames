import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import { GAMES } from '../data/games';
import { rulebooks, rulebookPath, chatParts, chatScope } from '../utils/rulebooks';
import { shownKind } from '../utils/subgames';
import RulesChatProvider, { RulesChatToggle, RulesChatPanel } from './RulesChat';
import WordChecker from './WordChecker';

// Scrolls the tab strip sideways to the chosen tab. scrollIntoView would also
// scroll the page to bring the strip itself into view.
function scrollIntoStrip(el: HTMLAnchorElement | null) {
  const strip = el?.parentElement;
  if (el && strip) strip.scrollLeft = Math.max(0, el.offsetLeft - strip.offsetLeft - 16);
}

export default function RulesPage() {
  const { slug, part } = useParams<{ slug: string; part?: string }>();
  const game = GAMES.find(g => g.slug === slug);
  const [wordCheckerOpen, setWordCheckerOpen] = useState(false);

  if (!game) {
    return (
      <div className="rules-page">
        <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
        <h1 className="rules-not-found">Game not found</h1>
      </div>
    );
  }

  // An unknown tab goes to the game's own rulebook rather than a not-found
  // page: the game is real, only the tab is wrong.
  const books = rulebooks(game);
  const book = books.find(b => b.part === part);
  if (!book) return <Navigate replace to={rulebookPath(game.slug)} />;

  return (
    <RulesChatProvider>
      <div className="rules-page">
        <header className="rules-header">
          <Link to="/" className="back-link">&larr; Back to The Game Room</Link>
          <div className="rules-title-row">
            <img
              src={game.img}
              alt={`${game.name} box art`}
              className="rules-box-art"
            />
            <div className="rules-title-info">
              <h1 className="rules-game-name">{game.name}</h1>
              <p className="rules-game-desc">{book.short}</p>
            </div>
            <RulesChatToggle />
            {game.slug === 'bananagrams' && (
              <button
                className="rules-chat-toggle"
                onClick={() => setWordCheckerOpen(o => !o)}
              >
                {wordCheckerOpen ? 'Close Word Checker' : 'Word Checker'}
              </button>
            )}
          </div>
        </header>
        {books.length > 1 && (
          <nav className="rules-books" aria-label="Rulebooks">
            {books.map(b => (
              <Link
                key={b.pdf}
                to={rulebookPath(game.slug, b.part)}
                className="rules-book"
                aria-current={b === book ? 'page' : undefined}
                // A deck has a dozen tabs; on a phone the chosen one can sit
                // past the edge of the strip, so bring it into view.
                ref={b === book ? scrollIntoStrip : undefined}
              >
                {b.label}
                {b.kind && shownKind(b.label, b.kind) && (
                  <span className={`kind-chip kind-${b.kind}`}>{b.kind}</span>
                )}
              </Link>
            ))}
          </nav>
        )}
        <RulesChatPanel slug={game.slug} gameName={game.name} parts={chatParts(game, book)} scope={chatScope(game, book)} />
        {wordCheckerOpen && <WordChecker />}
        <div className="rules-viewer">
          <iframe src={book.pdf} title={`${book.name} rules`} />
        </div>
        <a href={book.pdf} download className="rules-download">
          Download PDF
        </a>
      </div>
    </RulesChatProvider>
  );
}

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { GAMES } from '../data/games';
import { SLUG_RE } from '../../api/_lib/slug';
import { parseGoldenSet } from '../../eval/grading';

/**
 * Data-integrity guard for the games ↔ assets linkage.
 *
 * Each game references three files purely by convention — the `rules` PDF and
 * `img` the rules page renders, and `rules-text/<slug>.txt` the chat API reads
 * (via loadRulesText). Nothing else fails when one is missing: tsc, lint, and
 * the component suite all pass, then the /rules/:slug page shows a broken link
 * and the chat assistant throws ENOENT in production. This test turns that
 * silent runtime break into a red check when a game is added, removed, or its
 * slug renamed without its assets following.
 *
 * Paths resolve from process.cwd() (repo root), matching how the chat API and
 * rulesAssistant.test.ts locate rules-text at runtime.
 */
const PUBLIC = join(process.cwd(), 'public');
const RULES_DIR = join(PUBLIC, 'rules');
const RULES_TEXT_DIR = join(process.cwd(), 'rules-text');

describe('games ↔ assets integrity', () => {
  it('has no duplicate slugs', () => {
    const slugs = GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The slug becomes a filesystem path in the chat API (rules-text/<slug>.txt)
  // and a Redis key elsewhere, so it must satisfy the shared boundary regex or
  // the API rejects it with a 400 even when the file exists.
  it.each(GAMES.map((g) => [g.slug] as const))(
    'slug "%s" matches the chat/votes slug shape',
    (slug) => {
      expect(slug).toMatch(SLUG_RE);
    },
  );

  it.each(GAMES.map((g) => [g.slug, g] as const))(
    'game "%s" has its rules PDF, image, and rules-text',
    (slug, game) => {
      // `rules`/`img` are absolute-from-web-root ("/rules/x.pdf"); join maps
      // them under public/ (a leading slash in a later join arg is treated as
      // a separator, not a reset to the filesystem root).
      const pdf = join(PUBLIC, game.rules);
      expect(existsSync(pdf), `missing rules PDF: ${game.rules}`).toBe(true);

      const img = join(PUBLIC, game.img);
      expect(existsSync(img), `missing image: ${game.img}`).toBe(true);

      const text = join(RULES_TEXT_DIR, `${slug}.txt`);
      expect(existsSync(text), `missing rules-text/${slug}.txt`).toBe(true);
      // Empty grounding text means extraction/OCR silently produced nothing —
      // the chat would answer from an empty rulebook.
      expect(statSync(text).size, `empty rules-text/${slug}.txt`).toBeGreaterThan(0);
    },
  );

  // A game inside another one keeps its rulebook beside the parent's as
  // <parent>.<slug>.pdf, and its text as <parent>.<slug>.txt: the chat API
  // reads every rules-text/<parent>.*.txt along with the parent's own, so a
  // sub-game rulebook under any other name would never reach the assistant.
  const withRules = GAMES.flatMap((g) => [
    ...(g.moreRules ?? []).map((r) => [`${g.slug}.${r.slug}`, r.pdf] as const),
    ...(g.subgames ?? []).filter((s) => s.rules).flatMap((s) => [
      [`${g.slug}.${s.slug}`, s.rules!] as const,
      ...(s.moreRules ?? []).map((r) => [`${g.slug}.${r.slug}`, r.pdf] as const),
    ]),
  ]);

  // Its further rulebooks and the games inside it share one set of tabs and
  // one rules-text namespace, so their slugs must not collide.
  it.each(GAMES.filter((g) => g.subgames || g.moreRules).map((g) => [g.slug, g] as const))(
    'game "%s" names each extra rulebook and game inside it once, in the slug shape',
    (_slug, game) => {
      const subs = game.subgames ?? [];
      const subSlugs = [...(game.moreRules ?? []), ...subs, ...subs.flatMap((s) => s.moreRules ?? [])].map((s) => s.slug);
      expect(new Set(subSlugs).size).toBe(subSlugs.length);
      for (const s of subSlugs) expect(s).toMatch(SLUG_RE);
    },
  );

  it.each(withRules)(
    'extra rulebook "%s" has its rules PDF and rules-text',
    (key, rules) => {
      expect(rules).toBe(`/rules/${key}.pdf`);
      expect(existsSync(join(PUBLIC, rules)), `missing rules PDF: ${rules}`).toBe(true);
      const text = join(RULES_TEXT_DIR, `${key}.txt`);
      expect(existsSync(text), `missing rules-text/${key}.txt`).toBe(true);
      expect(statSync(text).size, `empty rules-text/${key}.txt`).toBeGreaterThan(0);
    },
  );

  // public/rules and rules-text hold game assets only (unlike public/images,
  // which also carries decorative art), so every file there must map to a
  // current slug — this catches a renamed slug that left its old files behind.
  it('has no orphaned rule PDFs or rules-text files', () => {
    const slugs = new Set([...GAMES.map((g) => g.slug), ...withRules.map(([key]) => key)]);

    const orphanPdfs = readdirSync(RULES_DIR)
      .filter((f) => f.endsWith('.pdf'))
      .filter((f) => !slugs.has(f.replace(/\.pdf$/, '')));
    expect(orphanPdfs, 'rule PDFs with no matching game').toEqual([]);

    const orphanText = readdirSync(RULES_TEXT_DIR)
      .filter((f) => f.endsWith('.txt'))
      .filter((f) => !slugs.has(f.replace(/\.txt$/, '')));
    expect(orphanText, 'rules-text files with no matching game').toEqual([]);
  });

  // Each page of a rules-text file opens with "[Page N]", its page in the
  // PDF: the assistant cites rules by it and the chat links "(p. N)" to
  // #page=N, so a missing or misnumbered marker sends a player to the wrong
  // page (scripts/extract-rules-text.mjs writes them).
  it.each(readdirSync(RULES_TEXT_DIR).filter((f) => f.endsWith('.txt')))(
    'rules-text/%s marks its pages in order from the first',
    (file) => {
      const text = readFileSync(join(RULES_TEXT_DIR, file), 'utf8');
      expect(text.startsWith('[Page 1]\n'), 'starts with [Page 1]').toBe(true);
      const pages = [...text.matchAll(/^\[Page (\d+)\]$/gm)].map((m) => Number(m[1]));
      expect(pages).toEqual(pages.map((_, i) => i + 1));
    },
  );
});

describe('the eval\'s golden set', () => {
  // A quote is where a person checks an expected answer, and the citation
  // entries' expected pages were read off the markers above it.
  const { entries } = parseGoldenSet(JSON.parse(readFileSync(join(process.cwd(), 'eval', 'golden-set.json'), 'utf8')));
  it.each(entries.filter((e) => e.sourceQuote !== '').map((e) => [e.id, e] as const))(
    '%s quotes its rules text word for word',
    (_, entry) => {
      const text = [entry.game, ...(entry.parts ?? []).map((p) => `${entry.game}.${p}`)]
        .map((key) => readFileSync(join(RULES_TEXT_DIR, `${key}.txt`), 'utf8'))
        .join('\n');
      expect(text).toContain(entry.sourceQuote);
    },
  );
});

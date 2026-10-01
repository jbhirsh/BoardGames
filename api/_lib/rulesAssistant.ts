// Core ask-a-question pipeline for the AI rules assistant, extracted from
// api/chat.ts so it can be called from plain Node (e.g. the eval harness in
// eval/run-eval.ts) without going through HTTP. Files under api/_lib are not
// exposed as Vercel endpoints (underscore-prefixed paths are ignored).

import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** Model used for every rules-assistant Gemini call. */
export const RULES_ASSISTANT_MODEL = 'gemini-2.5-flash';

// Answers are meant to be concise, and output tokens are the expensive side of
// the Gemini meter. Cap them so no single request (or abusive prompt) can run
// up an unbounded reply. ~1024 tokens is roughly 700 words — ample for a rules
// answer. Applied by default to production and eval alike.
export const RULES_ASSISTANT_MAX_OUTPUT_TOKENS = 1024;

/** System instruction sent with every rules-assistant request. */
export const RULES_ASSISTANT_SYSTEM_INSTRUCTION =
  'You are a helpful board game rules assistant. Answer questions based only on the provided rules text. If the rules don\'t cover the question, say so. Keep answers concise and friendly.';

export interface ChatHistoryEntry {
  role: 'user' | 'model';
  content: string;
}

/**
 * Heads each rulebook after the game's own, named from its part ("Cities and
 * Knights" from cities-and-knights), so the model can tell whose rule is
 * whose: Catan wins at 10 points, Cities & Knights at 13.
 */
export function rulebookHeader(part: string): string {
  const name = part.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `\n\n=== Next rulebook: ${name}. It goes with the game above; where it differs, say which rulebook a rule comes from. ===\n\n`;
}

/**
 * Loads the grounding rules text for a game slug from rules-text/ (bundled
 * into the chat function via vercel.json includeFiles), followed by the
 * rulebooks of any games inside it that the caller names: a game keeps each
 * one's rules beside its own as <slug>.<part>.txt. The caller picks them
 * because more is not better: Catan with both expansions is two and a half
 * times its own rules, and the model spends its answer budget reconciling
 * rules that don't apply. A part with no file is skipped. Throws when no
 * rules text exists for the slug; callers map that to their own error
 * handling.
 */
export function loadRulesText(slug: string, parts: string[] = []): string {
  const dir = join(process.cwd(), 'rules-text');
  // Only names from the directory's own listing ever reach a path, so the
  // slug and parts (request input, already shape-checked by SLUG_RE in
  // chat.ts) are compared against file names and never joined into one.
  const files = readdirSync(dir);
  const own = files.find((f) => f === slug + '.txt');
  if (!own) throw new Error(`ENOENT: no rules text for ${slug}`);
  const read = (f: string) => readFileSync(join(dir, f), 'utf-8');
  let text = read(own);
  for (const part of parts) {
    const file = files.find((f) => f === `${slug}.${part}.txt`);
    if (file) text += rulebookHeader(part) + read(file);
  }
  return text;
}

/** Builds the Gemini conversation: rules text first, then history, then the new question. */
export function buildContents(
  rulesText: string,
  history: ChatHistoryEntry[] | undefined,
  message: string,
): Content[] {
  const contents: Content[] = [];

  // First message: rules text as context
  contents.push({
    role: 'user',
    parts: [{ text: 'Here are the complete rules for the game:\n\n' + rulesText }],
  });

  // Map history
  if (history && Array.isArray(history)) {
    for (const entry of history) {
      contents.push({
        role: entry.role,
        parts: [{ text: entry.content }],
      });
    }
  }

  // Add the new user message
  contents.push({
    role: 'user',
    parts: [{ text: message }],
  });

  return contents;
}

export interface StreamRulesAnswerOptions {
  rulesText: string;
  message: string;
  history?: ChatHistoryEntry[];
  apiKey: string;
  /** Omitted for production chat traffic (API default); the eval harness passes 0. */
  temperature?: number;
  /** Output-token cap; defaults to RULES_ASSISTANT_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
}

/** Prompt construction + Gemini call; returns the streaming response. */
export async function streamRulesAnswer(
  options: StreamRulesAnswerOptions,
): Promise<AsyncGenerator<GenerateContentResponse>> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  return ai.models.generateContentStream({
    model: RULES_ASSISTANT_MODEL,
    contents: buildContents(options.rulesText, options.history, options.message),
    config: {
      systemInstruction: RULES_ASSISTANT_SYSTEM_INSTRUCTION,
      maxOutputTokens: options.maxOutputTokens ?? RULES_ASSISTANT_MAX_OUTPUT_TOKENS,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    },
  });
}

export interface AskRulesAssistantOptions {
  slug: string;
  message: string;
  history?: ChatHistoryEntry[];
  apiKey: string;
  temperature?: number;
}

/**
 * The complete ask-a-question pipeline: load grounding text, build the
 * prompt, call Gemini, and collect the streamed reply into one string.
 */
export async function askRulesAssistant(options: AskRulesAssistantOptions): Promise<string> {
  const rulesText = loadRulesText(options.slug);
  const stream = await streamRulesAnswer({
    rulesText,
    message: options.message,
    history: options.history,
    apiKey: options.apiKey,
    temperature: options.temperature,
  });
  let answer = '';
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      answer += text;
    }
  }
  return answer;
}

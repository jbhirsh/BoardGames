// Core ask-a-question pipeline for the AI rules assistant, extracted from
// api/chat.ts so it can be called from plain Node (e.g. the eval harness in
// eval/run-eval.ts) without going through HTTP. Files under api/_lib are not
// exposed as Vercel endpoints (underscore-prefixed paths are ignored).

import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Model used for every rules-assistant Gemini call. */
export const RULES_ASSISTANT_MODEL = 'gemini-2.5-flash';

/** System instruction sent with every rules-assistant request. */
export const RULES_ASSISTANT_SYSTEM_INSTRUCTION =
  'You are a helpful board game rules assistant. Answer questions based only on the provided rules text. If the rules don\'t cover the question, say so. Keep answers concise and friendly.';

export interface ChatHistoryEntry {
  role: 'user' | 'model';
  content: string;
}

/**
 * Loads the grounding rules text for a game slug from rules-text/ (bundled
 * into the chat function via vercel.json includeFiles). Throws when no rules
 * text exists for the slug; callers map that to their own error handling.
 */
export function loadRulesText(slug: string): string {
  return readFileSync(join(process.cwd(), 'rules-text', slug + '.txt'), 'utf-8');
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

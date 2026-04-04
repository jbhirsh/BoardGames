import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, message, history } = req.body;

  // Validate slug
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }

  // Validate message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'message must be 500 characters or less' });
  }

  // Validate history
  if (history && (!Array.isArray(history) || history.length > 10)) {
    return res.status(400).json({ error: 'history must be an array of 10 or fewer entries' });
  }

  // Read rules text
  let rulesText: string;
  try {
    rulesText = readFileSync(join(process.cwd(), 'rules-text', slug + '.txt'), 'utf-8');
  } catch {
    return res.status(404).json({ error: 'Rules not found for this game' });
  }

  // Set up Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // Build conversation contents
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  // First message: rules text as context
  contents.push({
    role: 'user',
    parts: [{ text: 'Here are the complete rules for the game:\n\n' + rulesText }],
  });

  // Map history
  if (history && Array.isArray(history)) {
    for (const entry of history) {
      contents.push({
        role: entry.role as 'user' | 'model',
        parts: [{ text: entry.content }],
      });
    }
  }

  // Add the new user message
  contents.push({
    role: 'user',
    parts: [{ text: message }],
  });

  try {
    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction:
          'You are a helpful board game rules assistant. Answer questions based only on the provided rules text. If the rules don\'t cover the question, say so. Keep answers concise and friendly.',
      },
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        res.write(text);
      }
    }

    res.end();
  } catch (err) {
    console.error('Gemini API error:', err);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { retrieveChunks } from '../retrieval/retrieve.mjs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `"""
You are an onboarding assistant for Cal.com — a scheduling platform.
Your job is to help new users get set up and answer their questions clearly and conversationally.

You are given relevant documentation excerpts as context. Use them to answer accurately.
If the context does not contain enough information, say so honestly — do not make things up.

After every answer, add a short proactive suggestion based on what the user just asked.
Format it as: "💡 Next step: [suggestion]"
Examples:
- User asked about connecting calendar → suggest setting availability next
- User asked about creating a booking → suggest setting up a schedule first
- User asked about inviting a team → suggest creating an event type for the team

Keep your tone friendly, clear, and concise. Avoid robotic or overly formal language.
Never mention "documentation", "provided context", "the context", or "based on the information given."
If you don't know the answer, say: "I don't have that information right now. Try visiting cal.com/docs or reaching out to Cal.com support."
Always answer as if you are Cal.com's own onboarding assistant.
"""`;

/**
 * Build a prompt from system prompt, retrieved docs, conversation history and user message
 */
function buildPrompt(userMessage, conversationHistory, chunks) {
  const contextText = chunks
    .map((c, i) => `Source ${i + 1}: ${c.title || 'untitled'}\n${c.content}`)
    .join('\n\n');

  const historyText = (conversationHistory || [])
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
    .join('\n');

  return `${SYSTEM_PROMPT}\n\nContext:\n${contextText}\n\nConversation history:\n${historyText}\n\nUser: ${userMessage}\nAssistant:`;
}

/**
 * Get an answer from Gemini using retrieved context and conversation history
 * @param {string} userMessage
 * @param {Array<{role: string, text: string}>} conversationHistory
 */
export async function getAnswer(userMessage, conversationHistory = []) {
  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('userMessage must be a non-empty string');
  }

  // Retrieve top 5 chunks
  const chunks = await retrieveChunks(userMessage, 5);

  const prompt = buildPrompt(userMessage, conversationHistory, chunks);

  const model = genAI.getGenerativeModel({ 
    model: 'models/gemini-2.5-flash',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
    }
  });

  const result = await model.generateContent(prompt);
  const answer = result && result.response ? result.response.text() : '';

  const sources = (chunks || []).map((c) => ({ title: c.title || '(no title)', url: c.url || null }));

  return { answer, sources };
}

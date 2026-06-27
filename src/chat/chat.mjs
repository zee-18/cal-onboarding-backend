import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { retrieveChunks, buildRetrievalQuery } from '../retrieval/retrieve.mjs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are an onboarding assistant for Cal.com — a scheduling platform.
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
Always answer as if you are Cal.com's own onboarding assistant.`;

/**
 * Build Gemini-compatible history array with system context injected as first turn
 */
function buildHistory(conversationHistory, chunks) {
  const contextText = chunks
    .map((c, i) => `Source ${i + 1}: ${c.title || 'untitled'}\n${c.content}`)
    .join('\n\n');

  const systemWithContext = `${SYSTEM_PROMPT}\n\nContext from Cal.com docs:\n${contextText}`;

  const primeHistory = [
    {
      role: 'user',
      parts: [{ text: systemWithContext }],
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. I am Cal.com\'s onboarding assistant and will answer questions accurately based on the provided documentation.' }],
    },
  ];

  const mappedHistory = (conversationHistory || [])
    .filter(h => h && typeof h.role === 'string' && typeof h.text === 'string' && h.text.trim())
    .map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }));

  return [...primeHistory, ...mappedHistory];
}

/**
 * Retry wrapper for Gemini generateContent
 */
async function generateWithRetry(chat, userMessage, maxRetries = 3) {
  let lastErr = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await chat.sendMessage(userMessage);
      return res;
    } catch (err) {
      lastErr = err;
      const status = err && err.status;
      const msg = (err && err.message) || '';
      const retryable = status === 503 || /503|high demand|Service Unavailable/i.test(msg);

      if (!retryable) throw err;

      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.warn(`generateWithRetry: attempt ${attempt + 1} failed, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

/**
 * Get an answer from Gemini using retrieved context and conversation history
 */
export async function getAnswer(userMessage, conversationHistory = []) {
  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('userMessage must be a non-empty string');
  }

  const retrievalQuery = buildRetrievalQuery(userMessage, conversationHistory);
  const chunks = await retrieveChunks(retrievalQuery, 5);

  const history = buildHistory(conversationHistory, chunks);

  const model = genAI.getGenerativeModel({
    model: 'models/gemini-2.5-flash',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const chat = model.startChat({ history });

  const result = await generateWithRetry(chat, userMessage);
  const answer = result?.response ? result.response.text() : '';

  const sources = (chunks || []).map((c) => ({
    title: c.title || '(no title)',
    url: c.url || null,
  }));

  return { answer, sources };
}
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pkg from 'pg';

const { Pool } = pkg;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Retrieves the top K document chunks most similar to the user query
 * using vector similarity search with pgvector.
 *
 * @param {string} userQuery - The user's query to embed and search
 * @param {number} topK - Number of top results to return (default: 5)
 * @returns {Promise<Array<{content: string, url: string, title: string}>>} - Array of matching chunks
 */
export async function retrieveChunks(userQuery, topK = 5) {
  // Embed the user query using Google Gemini
  const embeddingModel = genAI.getGenerativeModel({
    model: 'models/gemini-embedding-001',
  });

  const embeddingResult = await embeddingModel.embedContent(userQuery);
  const queryEmbedding = embeddingResult.embedding.values;

  // Format embedding as a vector string for PostgreSQL
  const embeddingVector = `[${queryEmbedding.join(', ')}]`;

  // Connect to PostgreSQL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Query for top K chunks using cosine similarity
    const result = await pool.query(
      `SELECT content, url, title
       FROM doc_chunks
       WHERE scraper_version = 'v2'
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [embeddingVector, topK]
    );

    return result.rows;
  } catch (error) {
    console.error('Error retrieving chunks:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

export function buildRetrievalQuery(userMessage, conversationHistory) {
  if (userMessage.length > 20) return userMessage;

  // Find last assistant message
  const lastAssistant = [...conversationHistory]
    .reverse()
    .find(h => h.role === 'assistant');

  // Extract Next step tip if present
  const nextStepMatch = lastAssistant?.text?.match(/💡 Next step:\s*(.+)/i);

  if (nextStepMatch) {
    return `${nextStepMatch[1]} ${userMessage}`;
  }

  // Fallback to last user message
  const lastUser = [...conversationHistory]
    .reverse()
    .find(h => h.role === 'user');

  return lastUser?.text
    ? `${lastUser.text} ${userMessage}`
    : userMessage;
}

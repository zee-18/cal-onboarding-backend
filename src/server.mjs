import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getAnswer } from './chat/chat.mjs';

const PORT = process.env.PORT || 3000;

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(rateLimit, {
  max: 10,          // 10 requests
  timeWindow: '1 hour',  // per IP per hour
  errorResponseBuilder: () => ({
    error: 'Too many requests. Please try again after 1 hour.'
  })
});

const stripTags = (str) => str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');

app.post('/api/chat', async (request, reply) => {
    const { message, history } = request.body || {};

    if (!message || typeof message !== 'string' || message.trim() === '') {
        reply.code(400).send({ error: 'message is required and must be a non-empty string' });
        return;
    }

    const sanitizedMessage = stripTags(message.trim()).slice(0, 500);

    if (sanitizedMessage.length === 0) {
        return reply.code(400).send({ error: 'message contains no valid content' });
    }

    const rawHistory = Array.isArray(history) ? history : [];
    const conversationHistory = rawHistory
        .slice(-20)
        .filter(h => h && typeof h.role === 'string' && typeof h.text === 'string')
        .map(h => ({
            role: h.role === 'user' || h.role === 'assistant' ? h.role : 'user',
            text: stripTags(h.text.trim()).slice(0, 1000)
        }));
    try {
        const { answer, sources } = await getAnswer(sanitizedMessage, conversationHistory);
        reply.send({ answer, sources });
    } catch (err) {
        request.log.error(err);
        reply.code(500).send({ error: 'Internal server error' });
    }
});

const address = await app.listen({ port: Number(PORT), host: '0.0.0.0' });
console.log(`Server listening at ${address}`);

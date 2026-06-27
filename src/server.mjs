import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getAnswer } from './chat/chat.mjs';
import { validateInput } from './guardrails/inputGuardrail.mjs';
import { validateOutput } from './guardrails/outputGuardrail.mjs';

const PORT = process.env.PORT || 3000;

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Simple in-memory per-IP limiter. Limits:
// - 10 requests per minute
// - 100 requests per day
const rateStore = new Map();

function nowMinuteStart(ts = Date.now()) {
    return Math.floor(ts / 60000) * 60000;
}

function nowDayStart(ts = Date.now()) {
    return Math.floor(ts / 86400000) * 86400000;
}

// Cleanup old entries periodically to avoid memory growth
setInterval(() => {
    const cutoff = Date.now() - 2 * 86400000; // keep up to 2 days
    for (const [ip, rec] of rateStore.entries()) {
        if (rec.lastSeen < cutoff) rateStore.delete(ip);
    }
}, 60 * 60 * 1000).unref();

app.addHook('preHandler', async (request, reply) => {
    try {
        const ip = request.ip || request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown';
        const ts = Date.now();
        const minuteStart = nowMinuteStart(ts);
        const dayStart = nowDayStart(ts);

        let rec = rateStore.get(ip);
        if (!rec) {
            rec = {
                minuteStart,
                minuteCount: 0,
                dayStart,
                dayCount: 0,
                lastSeen: ts,
            };
            rateStore.set(ip, rec);
        }

        // reset counters when window advanced
        if (rec.minuteStart !== minuteStart) {
            rec.minuteStart = minuteStart;
            rec.minuteCount = 0;
        }
        if (rec.dayStart !== dayStart) {
            rec.dayStart = dayStart;
            rec.dayCount = 0;
        }

        // limits
        const MAX_PER_MIN = 10;
        const MAX_PER_DAY = 100;

        if (rec.minuteCount >= MAX_PER_MIN) {
            reply.code(429).send({ error: 'Too many requests. Please try again after a minute.' });
            return reply;
        }
        if (rec.dayCount >= MAX_PER_DAY) {
            reply.code(429).send({ error: 'Daily request quota exceeded. Please try again tomorrow.' });
            return reply;
        }

        // increment and update
        rec.minuteCount += 1;
        rec.dayCount += 1;
        rec.lastSeen = ts;
        rateStore.set(ip, rec);
    } catch (e) {
        // On unexpected errors, don't block requests — just log and continue
        request.log && request.log.error && request.log.error(e);
    }
});

const stripTags = (str) => str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');

app.post('/api/chat', async (request, reply) => {
    const { message, history } = request.body || {};

    if (!message || typeof message !== 'string' || message.trim() === '') {
        reply.code(400).send({ error: 'message is required and must be a non-empty string' });
        return;
    }

    const rawMessage = message.trim();

    // Enforce input length: reject inputs longer than 500 characters
    if (rawMessage.length > 500) {
        request.log && request.log.info && request.log.info({ length: rawMessage.length }, 'Input rejected: too long');
        return reply.code(400).send({ error: 'Your question is too long. Please keep it under 500 characters.' });
    }

    const sanitizedMessage = stripTags(rawMessage);

    if (sanitizedMessage.length === 0) {
        return reply.code(400).send({ error: 'message contains no valid content' });
    }

    const rawHistory = Array.isArray(history) ? history : [];
    console.log(`Raw History  ${rawHistory}`);
    const conversationHistory = rawHistory
        .slice(-20)
        .filter(h => h && typeof h.role === 'string' && typeof h.content === 'string')
        .map(h => ({
            role: h.role === 'user' || h.role === 'assistant' ? h.role : 'user',
            text: stripTags(h.content.trim()).slice(0, 1000)
        }));
    console.log(`Conversation History  ${conversationHistory}`);
    try {
        await validateInput(sanitizedMessage);
        const { answer, sources } = await getAnswer(sanitizedMessage, conversationHistory);
        validateOutput(answer);
        reply.send({ answer, sources });
    } catch (err) {
        // Log full error internally
        request.log.error(err);

        // Map known errors to clean client responses
        const msg = err && (err.message || '');
        if (err.code === 'INJECTION_DETECTED')
            return reply.code(400).send({ error: err.message });

        if (err.code === 'CLASSIFIER_BLOCKED')
            return reply.code(400).send({ error: err.message });

        if (err.code === 'OUTPUT_SYSTEM_PROMPT_LEAKED' || err.code === 'OUTPUT_SUSPICIOUS')
            return reply.code(500).send({ error: 'Something went wrong. Please try again.' });
        if (err && err.type === 'INPUT_TOO_LONG') {
            return reply.code(400).send({ error: 'Your question is too long. Please keep it under 500 characters.' });
        }

        if (err && (err.status === 503 || /503|high demand|Service Unavailable/i.test(msg))) {
            return reply.code(503).send({ error: 'AI service is temporarily busy. Please try again in a few seconds.' });
        }

        // Unknown error
        return reply.code(500).send({ error: 'Something went wrong. Please try again.' });
    }
});

const address = await app.listen({ port: Number(PORT), host: '0.0.0.0' });
console.log(`Server listening at ${address}`);

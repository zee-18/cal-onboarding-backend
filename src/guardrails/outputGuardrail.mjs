import { SYSTEM_PROMPT_FRAGMENTS } from './guardrailPatterns.mjs';

const SUSPICIOUS_PHRASES = [
  "i cannot assist",
  "i'm not able to help with that",
  "as an ai language model",
  "i don't have restrictions",
  "i have no restrictions",
];

function createError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function validateOutput(responseText) {
  const lower = responseText.toLowerCase();

  // Check for system prompt leakage
  for (const fragment of SYSTEM_PROMPT_FRAGMENTS) {
    if (lower.includes(fragment.toLowerCase())) {
      throw createError('OUTPUT_SYSTEM_PROMPT_LEAKED', 'Output validation failed.');
    }
  }

  // Check for suspicious signals
  for (const phrase of SUSPICIOUS_PHRASES) {
    if (lower.includes(phrase)) {
      throw createError('OUTPUT_SUSPICIOUS', 'Output validation failed.');
    }
  }

  // Warn on abnormally long responses
  if (responseText.length > 4000) {
    console.warn('[outputGuardrail] Response exceeds 4000 chars:', responseText.length);
  }

  return true;
}
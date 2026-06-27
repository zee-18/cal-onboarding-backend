export const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+all\s+instructions/i,
  /disregard\s+your/i,
  /forget\s+everything/i,
  /new\s+instruction:/i,
  /SYSTEM:/i,
  /\[INST\]/i,
  /you\s+are\s+now\s+a/i,
  /override\s+your/i,
  /bypass\s+your\s+instructions/i,
];

export const JAILBREAK_PATTERNS = [
  /pretend\s+you\s+are/i,
  /pretend\s+you\s+have\s+no/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+rules/i,
  /you\s+have\s+no\s+restrictions/i,
  /\bDAN\b/,
  /do\s+anything\s+now/i,
  /hypothetically\s+if\s+you\s+had\s+no\s+rules/i,
  /as\s+a\s+creative\s+writing\s+exercise/i,
];

export const SYSTEM_PROMPT_FRAGMENTS = [
  'you are an onboarding assistant for cal.com',
  'context from cal.com docs',
  'never mention "documentation"',
  'format it as: "💡 next step',
];
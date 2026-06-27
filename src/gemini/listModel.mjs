// listModels.mjs
import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY;

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
const data = await res.json();

for await (const model of data.models) {
  console.log(model.name, '|', model.displayName);
}
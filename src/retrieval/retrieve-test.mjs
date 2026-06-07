import 'dotenv/config';
import { retrieveChunks } from './retrieve.mjs';

const questions = [
  'How do I connect my Google Calendar?',
  'How do I invite a team member?',
  'How do I set my availability hours?',
  'How do I create a booking?',
  'How do I cancel a booking?',
  'How do I create a schedule?',
  'What authentication methods does Cal.com support?',
  'How do I get available slots?',
  'How do I reschedule a booking?',
  'How do I set up my profile?'
];

async function runTests() {
  for (const q of questions) {
    console.log('Question:', q);
    try {
      const chunks = await retrieveChunks(q, 3);
      if (!Array.isArray(chunks) || chunks.length === 0) {
        console.log('  No chunks returned.');
      } else {
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          const preview = (c.content || '').slice(0, 200).replace(/\n/g, ' ');
          console.log(`  ${i + 1}. ${c.title || '(no title)'} - ${preview}`);
        }
      }
    } catch (err) {
      console.error('  Error retrieving chunks for question:', err.message || err);
    }
    console.log('------------------------------------------------------------');
  }
}

runTests().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});

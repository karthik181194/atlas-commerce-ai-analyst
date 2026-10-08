import { GeminiAnalystPlanner } from './src/analytics/gemini-analyst-planner';
import path from 'path';

async function verify() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  } catch (e) {
    // Ignore if file doesn't exist
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('Skipping native verification: GEMINI_API_KEY is not set.');
    return;
  }

  const planner = new GeminiAnalystPlanner();

  console.log('--- Request 1: "Show August 2025 revenue" ---');
  try {
    const result1 = await planner.plan('Show August 2025 revenue');
    console.log(JSON.stringify(result1.plan, null, 2));
  } catch (e: any) {
    console.error('Error on Request 1:', e.message);
  }

  console.log('\n--- Request 2: "Why did August 2025 revenue change?" ---');
  try {
    const result2 = await planner.plan('Why did August 2025 revenue change?');
    console.log(JSON.stringify(result2.plan, null, 2));
  } catch (e: any) {
    console.error('Error on Request 2:', e.message);
  }
}

verify();


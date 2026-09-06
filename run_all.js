const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
  return fallback;
}

async function run() {
  console.log('====================================');
  console.log('  CONTENT AGENT — DAILY AUTOMATION  ');
  console.log(`  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('====================================\n');

  // STEP 1: FETCH FROM APIFY
  const dataFile = path.join(__dirname, 'dashboard/data/data.json');
  const existingData = loadJSON(dataFile, {});
  const fetchedAt = existingData.fetched_at ? new Date(existingData.fetched_at) : null;
  const hoursSinceFetch = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 36e5 : 999;

  if (hoursSinceFetch < 20) {
    console.log(`Step 1: Skipping Apify — data is ${hoursSinceFetch.toFixed(1)}h old. Using cache.`);
  } else {
    console.log('Step 1: Fetching from Apify...');
    try { const { run: fetchRun } = require('./scripts/fetch_data'); await fetchRun(); console.log('Step 1: Done.'); }
    catch (e) { console.log('Step 1 ERROR:', e.message); process.exit(1); }
  }

  // STEP 2: TRANSCRIBE NEW VIDEOS
  console.log('\nStep 2: Transcribing new videos...');
  let transcribeResult = { transcribed: 0, skipped: 0, byHandle: {}, items: [] };
  try {
    const { run: transcribeRun } = require('./scripts/transcribe');
    transcribeResult = await transcribeRun();
    console.log(`Step 2: Done — ${transcribeResult.transcribed} new, ${transcribeResult.skipped} already done.`);
  } catch (e) { console.log('Step 2 WARNING (non-fatal):', e.message); }

  // STEP 3: RUN AI AGENTS
  console.log('\nStep 3: Running AI agents...');
  try { const { run: agentsRun } = require('./scripts/run_agents'); await agentsRun(); console.log('Step 3: Done.'); }
  catch (e) { console.log('Step 3 ERROR:', e.message); }

  // STEP 4: GIT PUSH
  console.log('\nStep 4: Pushing to GitHub...');
  try {
    const { execSync } = require('child_process');
    execSync('git add -A', { cwd: __dirname, stdio: 'inherit' });
    execSync(`git commit -m "daily update: ${new Date().toISOString().slice(0,10)}"`, { cwd: __dirname, stdio: 'inherit' });
    execSync('git push', { cwd: __dirname, stdio: 'inherit' });
    console.log('Step 4: Done.');
  } catch (e) { console.log('Step 4 WARNING:', e.message); }

  // STEP 5: TELEGRAM REPORT
  console.log('\nStep 5: Sending Telegram report...');
  try { const { run: telegramRun } = require('./scripts/telegram_bot'); await telegramRun(transcribeResult); console.log('Step 5: Done.'); }
  catch (e) { console.log('Step 5 ERROR:', e.message); }

  console.log('\n==================================== ALL STEPS COMPLETE ====================================');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

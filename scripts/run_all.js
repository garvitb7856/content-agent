const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_PATH = path.join(__dirname, '../dashboard/data/data.json');

function shouldSkipFetch() {
  if (!fs.existsSync(DATA_PATH)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    if (!data.fetched_at) return false;

    const fetchedDate = new Date(data.fetched_at);
    const now = new Date();
    const diffHours = (now - fetchedDate) / (1000 * 60 * 60);

    if (diffHours >= 0 && diffHours < 20) {
      console.log(`\n⏭ Skipping fetch — data already fresh (fetched at ${data.fetched_at})`);
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

function run(label, command) {
  console.log(`\n▶ ${label}...`);
  try {
    execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
    console.log(`✅ ${label} done.`);
  } catch (err) {
    console.error(`❌ ${label} failed. Stopping.`);
    process.exit(1);
  }
}

(async () => {
  console.log('🚀 Content Agent Daily Run — ' + new Date().toLocaleString('en-IN'));

  if (!shouldSkipFetch()) {
    run('1. Fetch Apify Data',    'node scripts/fetch_data.js');
  }
  run('2. Detect Posted',       'node scripts/detect_posted.js');
  run('3. Run AI Agents',       'node scripts/run_agents.js');
  run('4. Plan Manager',        'node scripts/plan_manager.js');
  run('5. Save History',        'node scripts/save_history.js');
  run('6. Push to GitHub',      'git add -A && git commit -m "daily auto-update" --allow-empty && git push');
  run('7. Send Telegram',       'node scripts/telegram_bot.js');

  console.log('\n🎉 All done! Dashboard updated and Telegram sent.');
})();

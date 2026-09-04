const { execSync } = require('child_process');

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

  run('1. Fetch Apify Data',    'node scripts/fetch_data.js');
  run('2. Detect Posted',       'node scripts/detect_posted.js');
  run('3. Run AI Agents',       'node scripts/run_agents.js');
  run('4. Plan Manager',        'node scripts/plan_manager.js');
  run('5. Save History',        'node scripts/save_history.js');
  run('6. Push to GitHub',      'git add -A && git commit -m "daily auto-update" --allow-empty && git push');
  run('7. Send Telegram',       'node scripts/telegram_bot.js');

  console.log('\n🎉 All done! Dashboard updated and Telegram sent.');
})();

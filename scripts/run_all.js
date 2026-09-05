const fs = require('fs');
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

  try {
    const data = JSON.parse(fs.readFileSync('dashboard/data/data.json', 'utf8'));
    const fetchedAt = new Date(data.fetched_at);
    const hoursSince = (Date.now() - fetchedAt) / (1000 * 60 * 60);
    if (hoursSince < 6) {
      console.log(`\n⏭ Skipping Apify fetch — data already fresh (fetched ${Math.round(hoursSince)}h ago)`);
    } else {
      run('1. Fetch Apify Data', 'node scripts/fetch_data.js');
    }
  } catch(e) {
    run('1. Fetch Apify Data', 'node scripts/fetch_data.js');
  }

  run('2. Fetch Internet Trends', 'node scripts/fetch_trends.js');
  run('2.5 Analyze IG Trends',   'node scripts/instagram_trends.js');
  run('2.6 Feedback Loop',       'node scripts/feedback_loop.js');
  run('3. Detect Posted',         'node scripts/detect_posted.js');
  run('4. Run AI Agents',         'node scripts/run_agents.js');
  run('5. Update Second Brain',   'node scripts/update_second_brain.js');
  run('6. Plan Manager',          'node scripts/plan_manager.js');
  run('7. Save History',          'node scripts/save_history.js');
  run('8. Push to GitHub',        'git add -A && git commit -m "daily auto-update" --allow-empty && git push');
  run('9. Send Telegram',         'node scripts/telegram_bot.js');

  console.log('\n🎉 All done! Dashboard updated and Telegram sent.');
})();

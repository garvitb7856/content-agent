const { execSync } = require('child_process');

function run(label, command) {
  console.log(`\n▶ ${label}...`);
  try {
    const output = execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
    console.log(`✅ ${label} done.`);
  } catch (err) {
    console.error(`❌ ${label} failed. Stopping.`);
    process.exit(1);
  }
}

(async () => {
  console.log('🚀 Content Agent Daily Run — ' + new Date().toLocaleString('en-IN'));

  run('1. Fetch Apify Data', 'node scripts/fetch_data.js');
  run('2. Run AI Agents',    'node scripts/run_agents.js');
  run('3. Push to GitHub',  'git add dashboard/data/data.json dashboard/data/agents_output.json dashboard/agents_output.json && git commit -m "daily auto-update" --allow-empty && git push');
  run('4. Send Telegram',   'node scripts/telegram_bot.js');

  console.log('\n🎉 All done! Dashboard updated and Telegram sent.');
})();

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const STATUS_PATH = path.join(__dirname, '../second_brain/pipeline_status.json');

const status = {
  run_started: new Date().toISOString(),
  run_finished: null,
  overall: 'running',
  steps: {}
};

function saveStatus() {
  try { fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2)); } catch(e) {}
}

function run(label, command, options = {}) {
  console.log(`\n▶ ${label}...`);
  const stepKey = label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  status.steps[stepKey] = { status: 'running', startedAt: new Date().toISOString() };
  saveStatus();
  try {
    execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
    status.steps[stepKey].status = 'success';
    status.steps[stepKey].finishedAt = new Date().toISOString();
    saveStatus();
    console.log(`✅ ${label} done.`);
    return true;
  } catch (err) {
    status.steps[stepKey].status = 'failed';
    status.steps[stepKey].error = err.message?.substring(0, 200) || 'unknown error';
    status.steps[stepKey].finishedAt = new Date().toISOString();
    saveStatus();
    if (options.critical) {
      console.error(`❌ ${label} FAILED (critical — stopping pipeline).`);
      status.overall = 'failed';
      status.run_finished = new Date().toISOString();
      saveStatus();
      process.exit(1);
    } else {
      console.error(`⚠️ ${label} FAILED (non-critical — continuing).`);
      return false;
    }
  }
}

async function runParallel(steps) {
  const { spawn } = require('child_process');
  console.log(`\n▶ Running ${steps.length} steps in parallel: ${steps.map(s=>s[0]).join(' + ')}...`);
  const results = await Promise.all(steps.map(([label, command]) => {
    return new Promise((resolve) => {
      const stepKey = label.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase();
      status.steps[stepKey] = { status: 'running', startedAt: new Date().toISOString() };
      saveStatus();
      const [cmd, ...args] = command.split(' ');
      const proc = spawn(cmd === 'node' ? 'node' : cmd, args, { cwd: process.cwd(), stdio: 'inherit', shell: true });
      proc.on('close', code => {
        if (code === 0) {
          status.steps[stepKey].status = 'success';
          status.steps[stepKey].finishedAt = new Date().toISOString();
          console.log(`✅ ${label} done.`);
        } else {
          status.steps[stepKey].status = 'failed';
          status.steps[stepKey].finishedAt = new Date().toISOString();
          console.error(`⚠️ ${label} failed (exit ${code}).`);
        }
        saveStatus();
        resolve(code === 0);
      });
    });
  }));
  return results.every(Boolean);
}

(async () => {
  console.log('🚀 Content Agent Daily Run — ' + new Date().toLocaleString('en-IN'));

  let freshFetch = false;
  try {
    const data = JSON.parse(fs.readFileSync('dashboard/data/data.json', 'utf8'));
    const fetchedAt = new Date(data.fetched_at);
    const hoursSince = (Date.now() - fetchedAt) / (1000 * 60 * 60);
    if (hoursSince < 6) {
      console.log(`\n⏭ Skipping Apify fetch — data already fresh (fetched ${Math.round(hoursSince)}h ago)`);
      status.steps['apify_fetch'] = { status: 'skipped', reason: `data ${Math.round(hoursSince)}h old` };
      saveStatus();
    } else {
      if (run('1. Fetch Apify Data', 'node scripts/fetch_data.js', { critical: true })) {
        freshFetch = true;
      }
    }
  } catch(e) {
    if (run('1. Fetch Apify Data', 'node scripts/fetch_data.js', { critical: true })) {
      freshFetch = true;
    }
  }

  if (freshFetch) {
    run('1.5 Transcribe Videos', 'node scripts/transcribe.js');
  } else {
    status.steps['transcribe'] = { status: 'skipped', reason: 'no fresh fetch' };
    saveStatus();
  }

  await runParallel([
    ['2. Fetch Internet Trends',  'node scripts/fetch_trends.js'],
    ['2.5 Analyze IG Trends',     'node scripts/instagram_trends.js'],
    ['2.6 Feedback Loop',         'node scripts/feedback_loop.js'],
  ]);

  await runParallel([
    ['Update Hook Bank',           'node scripts/update_hook_bank.js'],
    ['Update Competitor Scripts',  'node scripts/update_competitor_scripts.js'],
    ['Fetch 48h Performance',      'node scripts/fetch_my_performance.js'],
    ['Detect New Posts',           'node scripts/detect_new_posts.js'],
  ]);
  run('Compute Patterns',            'node scripts/compute_patterns.js');
  run('Notify Pattern Update',       'node scripts/notify_pattern_update.js');

  run('3. Detect Posted',            'node scripts/detect_posted.js');
  run('3.5 Caption Diff',            'node scripts/caption_diff.js');
  run('3.8 Refresh Topic Clusters',  'node scripts/refresh_clusters.js');
  run('4. Run AI Agents',            'node scripts/run_agents.js', { critical: false });
  run('5. Update Second Brain',      'node scripts/update_second_brain.js');
  run('6. Plan Manager',             'node scripts/plan_manager.js');
  run('6.5 Prune Second Brain',      'node scripts/prune_second_brain.js');
  run('7. Save History',             'node scripts/save_history.js');
  run('8. Push to GitHub',           'git add -A && git commit -m "daily auto-update" --allow-empty && git pull --rebase origin main && git push');
  run('9. Send Telegram',            'node scripts/telegram_bot.js');

  // Finalize status
  const failed = Object.values(status.steps).filter(s => s.status === 'failed');
  const nonCriticalKeys = new Set(['9__send_telegram', 'notify_pattern_update', '6_5__prune_second_brain']);
  const criticalFailed = failed.filter((s, i) => !nonCriticalKeys.has(Object.keys(status.steps)[i]));
  status.overall = criticalFailed.length === 0 ? 'success' : 'partial';
  status.run_finished = new Date().toISOString();
  saveStatus();

  console.log('\n🎉 Pipeline complete. Status: ' + status.overall.toUpperCase());
})();

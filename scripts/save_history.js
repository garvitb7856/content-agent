const fs = require('fs');
const path = require('path');

const SECOND_BRAIN_DIR = path.join(__dirname, '../second_brain');
const DASHBOARD_SB_DIR = path.join(__dirname, '../dashboard/second_brain');
const HISTORY_DIR = path.join(SECOND_BRAIN_DIR, 'history');
const DASHBOARD_HISTORY_DIR = path.join(DASHBOARD_SB_DIR, 'history');

const AGENTS_OUTPUT_PATH = path.join(__dirname, '../dashboard/data/agents_output.json');
const ACTIVE_PLAN_PATH = path.join(SECOND_BRAIN_DIR, 'active_plan.json');

function ensureDirs() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.mkdirSync(DASHBOARD_HISTORY_DIR, { recursive: true });
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function copyFileSync(src, dst) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function cleanupOldFiles(dirPath, maxAgeDays = 14) {
  if (!fs.existsSync(dirPath)) return;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        const fileAge = now - stats.mtimeMs;
        if (fileAge > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted history file older than 14 days: ${file}`);
        }
      }
    } catch (e) {
      console.warn(`Warning checking ${file}:`, e.message);
    }
  });
}

function run() {
  ensureDirs();
  const today = getTodayStr();

  // 1. Copy agents_output.json to history/YYYY-MM-DD.json
  const histAgentFile = path.join(HISTORY_DIR, `${today}.json`);
  const dashHistAgentFile = path.join(DASHBOARD_HISTORY_DIR, `${today}.json`);
  copyFileSync(AGENTS_OUTPUT_PATH, histAgentFile);
  copyFileSync(AGENTS_OUTPUT_PATH, dashHistAgentFile);

  // 2. Copy active_plan.json to history/plan_YYYY-MM-DD.json
  const histPlanFile = path.join(HISTORY_DIR, `plan_${today}.json`);
  const dashHistPlanFile = path.join(DASHBOARD_HISTORY_DIR, `plan_${today}.json`);
  copyFileSync(ACTIVE_PLAN_PATH, histPlanFile);
  copyFileSync(ACTIVE_PLAN_PATH, dashHistPlanFile);

  // 3. Delete files older than 14 days
  cleanupOldFiles(HISTORY_DIR, 14);
  cleanupOldFiles(DASHBOARD_HISTORY_DIR, 14);

  console.log(`✅ Saved today's history snapshot (${today}) and cleaned up old entries.`);
}

run();

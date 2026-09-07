const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SB = path.join(ROOT, 'second_brain');

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function pruneHookBank() {
  const p = path.join(SB, 'hook_bank.json');
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hooks = Array.isArray(raw) ? raw : (raw.hooks || []);
  if (hooks.length <= 300) { console.log(`✅ hook_bank: ${hooks.length} hooks (no pruning needed)`); return; }
  const pruned = hooks.slice().sort((a,b) => (b.likes||0) - (a.likes||0)).slice(0, 300);
  const out = Array.isArray(raw) ? pruned : { ...raw, hooks: pruned };
  atomicWrite(p, out);
  console.log(`✂️ hook_bank: pruned ${hooks.length} → 300 (kept top by likes)`);
}

function pruneCompetitorScripts() {
  const p = path.join(SB, 'competitor_scripts.json');
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const scripts = Array.isArray(raw) ? raw : (raw.scripts || []);
  if (scripts.length <= 200) { console.log(`✅ competitor_scripts: ${scripts.length} entries (no pruning needed)`); return; }
  const pruned = scripts.slice().sort((a,b) => (b.likes||0) - (a.likes||0)).slice(0, 200);
  const out = Array.isArray(raw) ? pruned : { ...raw, scripts: pruned };
  atomicWrite(p, out);
  console.log(`✂️ competitor_scripts: pruned ${scripts.length} → 200`);
}

function pruneIdeasHistory() {
  const p = path.join(SB, 'ideas_history.json');
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let generated = (raw.generated_topics || []);
  let posted = (raw.posted_topics || []);
  const beforeG = generated.length, beforeP = posted.length;
  generated = generated.filter(t => (t.date || t.generatedAt || '9999') >= cutoff);
  posted = posted.filter(t => (t.date || t.postedAt || '9999') >= cutoff);
  if (generated.length === beforeG && posted.length === beforeP) {
    console.log(`✅ ideas_history: ${beforeG} generated + ${beforeP} posted (all within 90 days)`);
    return;
  }
  atomicWrite(p, { ...raw, generated_topics: generated, posted_topics: posted });
  console.log(`✂️ ideas_history: pruned generated ${beforeG}→${generated.length}, posted ${beforeP}→${posted.length} (kept 90 days)`);
}

function prunePerformanceArchive() {
  const p = path.join(SB, 'performance_archive.json');
  if (!fs.existsSync(p)) return;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const archive = Array.isArray(raw) ? raw : (raw.posts || []);
  if (archive.length <= 500) { console.log(`✅ performance_archive: ${archive.length} entries (no pruning needed)`); return; }
  const pruned = archive.slice().sort((a,b) => new Date(b.firstSeenAt||0) - new Date(a.firstSeenAt||0)).slice(0, 500);
  atomicWrite(p, Array.isArray(raw) ? pruned : { ...raw, posts: pruned });
  console.log(`✂️ performance_archive: pruned ${archive.length} → 500 (kept most recent)`);
}

console.log('🧹 Pruning Second Brain files...');
pruneHookBank();
pruneCompetitorScripts();
pruneIdeasHistory();
prunePerformanceArchive();
console.log('✅ Pruning complete.');

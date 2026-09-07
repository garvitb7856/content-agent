const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_LOG = path.join(ROOT, 'second_brain/content_log.json');
const SCRIPT_LIBRARY = path.join(ROOT, 'second_brain/script_library.json');
const TRANSCRIPTS_DIR = path.join(ROOT, 'second_brain/transcripts');
const IDEAS_HISTORY = path.join(ROOT, 'second_brain/ideas_history.json');

// Simple word-level similarity (Jaccard)
function similarity(a, b) {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2));
  if (!setA.size || !setB.size) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

// Get words unique to A (kept/changed from generated), unique to B (added by user)
function computeDiff(generated, actual) {
  const genWords = new Set(generated.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2));
  const actWords = new Set(actual.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2));
  const kept = [...genWords].filter(w => actWords.has(w));
  const removed = [...genWords].filter(w => !actWords.has(w));
  const added = [...actWords].filter(w => !genWords.has(w));
  const keptPct = genWords.size ? Math.round(kept.length / genWords.size * 100) : 0;
  return { keptPct, removedWords: removed.slice(0, 10), addedWords: added.slice(0, 10) };
}

// Match transcript to ideas history by topic keyword overlap
function matchToIdea(transcript, ideasHistory) {
  if (!ideasHistory || !ideasHistory.length) return null;
  let best = null, bestScore = 0;
  for (const idea of ideasHistory) {
    const s = similarity(transcript, (idea.title || '') + ' ' + (idea.hook || '') + ' ' + (idea.why || ''));
    if (s > bestScore) { bestScore = s; best = idea; }
  }
  return bestScore > 0.1 ? { idea: best, score: bestScore } : null;
}

function run() {
  const now = new Date();

  // Load content log
  const rawLog = fs.existsSync(CONTENT_LOG) ? JSON.parse(fs.readFileSync(CONTENT_LOG, 'utf8')) : [];
  const contentLog = Array.isArray(rawLog) ? rawLog : (rawLog.posts || []);

  // Load script library
  let scripts = [];
  if (fs.existsSync(SCRIPT_LIBRARY)) {
    try {
      const rawLib = JSON.parse(fs.readFileSync(SCRIPT_LIBRARY, 'utf8'));
      scripts = Array.isArray(rawLib) ? rawLib : (rawLib.scripts || []);
    } catch(e) {}
  }

  // Load ideas history
  let ideasHistory = [];
  if (fs.existsSync(IDEAS_HISTORY)) {
    try {
      const raw = JSON.parse(fs.readFileSync(IDEAS_HISTORY, 'utf8'));
      ideasHistory = Array.isArray(raw) ? raw : (raw.ideas || []);
    } catch(e) {}
  }

  let processed = 0;

  for (const entry of contentLog) {
    // Skip if already diffed
    if (entry.diffAnalysis) continue;

    // Check if transcript exists for this post
    const transcriptPath = path.join(TRANSCRIPTS_DIR, entry.id + '.json');
    if (!fs.existsSync(transcriptPath)) continue;

    let transcript = '';
    try {
      const t = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
      transcript = t.transcript || t.text || '';
    } catch(e) { continue; }

    if (!transcript || transcript.length < 20) continue;

    // Compare against every script in library
    let bestMatch = null, bestScore = 0;
    for (const script of scripts) {
      const fullText = (script.full_script || '') + ' ' + (script.caption || '');
      const s = similarity(transcript, fullText);
      if (s > bestScore) { bestScore = s; bestMatch = script; }
    }

    if (bestScore >= 0.6 && bestMatch) {
      // Strong match — agent script was used
      const diff = computeDiff(bestMatch.full_script || '', transcript);
      entry.diffAnalysis = {
        type: 'agent_script_used',
        matchedScriptId: bestMatch.id,
        matchedIdeaTitle: bestMatch.idea_title,
        similarityScore: Math.round(bestScore * 100),
        keptPercent: diff.keptPct,
        wordsRemoved: diff.removedWords,
        wordsAdded: diff.addedWords,
        summary: `Used agent script #${bestMatch.idea_title} with ${diff.keptPct}% kept. Removed: [${diff.removedWords.slice(0,5).join(', ')}]. Added: [${diff.addedWords.slice(0,5).join(', ')}].`,
        analysedAt: now.toISOString()
      };
      console.log(`✅ Post ${entry.id}: matched script "${bestMatch.idea_title}" (${Math.round(bestScore*100)}% similar, ${diff.keptPct}% kept)`);
    } else if (bestScore >= 0.3 && bestMatch) {
      // Partial match — agent idea used but own script
      const ideaMatch = matchToIdea(transcript, ideasHistory);
      entry.diffAnalysis = {
        type: 'agent_idea_own_script',
        closestScriptId: bestMatch.id,
        closestIdeaTitle: bestMatch.idea_title,
        similarityScore: Math.round(bestScore * 100),
        matchedIdeaFromHistory: ideaMatch?.idea?.title || null,
        summary: `Self-scripted post. Closest agent idea: "${bestMatch.idea_title}" (${Math.round(bestScore*100)}% match). User wrote own script.`,
        analysedAt: now.toISOString()
      };
      console.log(`📝 Post ${entry.id}: self-scripted, closest idea "${bestMatch.idea_title}" (${Math.round(bestScore*100)}%)`);
    } else {
      // Original content
      const ideaMatch = matchToIdea(transcript, ideasHistory);
      entry.diffAnalysis = {
        type: 'original_content',
        similarityScore: Math.round(bestScore * 100),
        matchedIdeaFromHistory: ideaMatch?.idea?.title || null,
        summary: 'Original content — no significant match to any generated script or idea.',
        analysedAt: now.toISOString()
      };
      console.log(`🆕 Post ${entry.id}: original content (best script match only ${Math.round(bestScore*100)}%)`);
    }

    processed++;
  }

  // Save updated content log
  fs.writeFileSync(CONTENT_LOG, JSON.stringify(contentLog, null, 2));

  // Also update performance_archive.json with diff data for archived posts
  const archivePath = path.join(ROOT, 'second_brain/performance_archive.json');
  if (fs.existsSync(archivePath)) {
    try {
      const rawArch = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      const archive = Array.isArray(rawArch) ? rawArch : (rawArch.posts || []);
      let archiveUpdated = false;
      for (const arch of archive) {
        if (arch.diffAnalysis) continue;
        const logEntry = contentLog.find(c => c.id === arch.id);
        if (logEntry?.diffAnalysis) {
          arch.diffAnalysis = logEntry.diffAnalysis;
          archiveUpdated = true;
        }
      }
      if (archiveUpdated) {
        fs.writeFileSync(archivePath, JSON.stringify(Array.isArray(rawArch) ? archive : { ...rawArch, posts: archive }, null, 2));
      }
    } catch(e) {}
  }

  console.log(`\n📊 Caption diff complete — ${processed} posts analysed.`);
}

run();

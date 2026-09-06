const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONTENT_LOG_PATH = path.join(ROOT, 'second_brain/content_log.json');
const DATA_PATH = path.join(ROOT, 'dashboard/data/data.json');
const ARCHIVE_PATH = path.join(ROOT, 'second_brain/performance_archive.json');
const PATTERNS_PATH = path.join(ROOT, 'second_brain/patterns.json');

function computePatterns() {
  let contentLog = { posts: [] };
  if (fs.existsSync(CONTENT_LOG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONTENT_LOG_PATH, 'utf8'));
      contentLog = Array.isArray(raw) ? { posts: raw } : (raw || { posts: [] });
    } catch(e) {}
  }

  let archiveData = { posts: [] };
  if (fs.existsSync(ARCHIVE_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
      archiveData = Array.isArray(raw) ? { posts: raw } : (raw || { posts: [] });
    } catch(e) {}
  }

  let followers = 5845;
  if (fs.existsSync(DATA_PATH)) {
    try {
      const d = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      followers = (d.your_account && d.your_account.followers) || 5845;
    } catch(e) {}
  }

  const existingArchiveIds = new Set(archiveData.posts.map(p => String(p.id)));

  for (const post of contentLog.posts) {
    if (post.performance_complete === true && !existingArchiveIds.has(String(post.id))) {
      const likes48h = post.likes_at_48h || 0;
      const comments48h = post.comments_at_48h || 0;
      const engRate = ((likes48h + comments48h) / followers) * 100;
      const verdict = engRate > 3 ? "high" : (engRate >= 1 ? "medium" : "low");

      const entry = {
        id: String(post.id),
        url: post.url || "",
        hook: post.caption_first_line || "",
        hook_type: post.hook_type || "unknown",
        format: post.format || "Reel",
        detected_at: post.detected_at || new Date().toISOString(),
        likes_48h: likes48h,
        comments_48h: comments48h,
        engagement_rate_48h: Number(engRate.toFixed(2)),
        verdict: verdict
      };

      archiveData.posts.push(entry);
      existingArchiveIds.add(String(post.id));
    }
  }

  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archiveData, null, 2));

  const totalAnalyzed = archiveData.posts.length;
  let patternsData = {
    updated_at: new Date().toISOString(),
    total_posts_analyzed: totalAnalyzed,
    best_hook_types: [],
    best_formats: [],
    top_performing_hooks: [],
    summary: "Not enough data yet. Need at least 5 posts with 48h performance data."
  };

  if (totalAnalyzed >= 5) {
    // Group by hook_type
    const hookTypeStats = {};
    archiveData.posts.forEach(p => {
      const type = p.hook_type || "unknown";
      if (!hookTypeStats[type]) hookTypeStats[type] = { totalLikes: 0, count: 0 };
      hookTypeStats[type].totalLikes += (p.likes_48h || 0);
      hookTypeStats[type].count += 1;
    });

    const bestHookTypes = Object.keys(hookTypeStats).map(t => ({
      type: t,
      avgLikes: Math.round(hookTypeStats[t].totalLikes / hookTypeStats[t].count)
    })).sort((a,b) => b.avgLikes - a.avgLikes);

    // Group by format
    const formatStats = {};
    archiveData.posts.forEach(p => {
      const fmt = p.format || "Reel";
      if (!formatStats[fmt]) formatStats[fmt] = { totalLikes: 0, count: 0 };
      formatStats[fmt].totalLikes += (p.likes_48h || 0);
      formatStats[fmt].count += 1;
    });

    const bestFormats = Object.keys(formatStats).map(f => ({
      format: f,
      avgLikes: Math.round(formatStats[f].totalLikes / formatStats[f].count)
    })).sort((a,b) => b.avgLikes - a.avgLikes);

    // Top 5 hooks by likes_48h
    const topHooks = [...archiveData.posts]
      .sort((a,b) => (b.likes_48h || 0) - (a.likes_48h || 0))
      .slice(0, 5)
      .map(p => ({ hook: p.hook, likes_48h: p.likes_48h, url: p.url }));

    const topType = bestHookTypes[0] || { type: "unknown", avgLikes: 0 };
    const topFmt = bestFormats[0] || { format: "Reel", avgLikes: 0 };
    const topHookLines = topHooks.map(h => `"${h.hook}"`).join(" | ");

    const summary = `Based on ${totalAnalyzed} posts analyzed for @garvit.irl:\nBest hook type: ${topType.type} (avg ${topType.avgLikes} likes at 48h)\nBest format: ${topFmt.format} (avg ${topFmt.avgLikes} likes at 48h)\nTop hooks: ${topHookLines}\nRecommendation: Prioritize ${topType.type} hooks in ${topFmt.format} format.`;

    patternsData.best_hook_types = bestHookTypes;
    patternsData.best_formats = bestFormats;
    patternsData.top_performing_hooks = topHooks;
    patternsData.summary = summary;
  }

  fs.writeFileSync(PATTERNS_PATH, JSON.stringify(patternsData, null, 2));

  console.log(`Patterns computed from ${totalAnalyzed} posts.`);
}

computePatterns();

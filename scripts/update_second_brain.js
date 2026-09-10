const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'dashboard/data/data.json');
const LOG_PATH = path.join(ROOT, 'second_brain/content_log.json');
const ARCHIVE_PATH = path.join(ROOT, 'second_brain/performance_archive.json');
const PATTERNS_PATH = path.join(ROOT, 'second_brain/patterns.json');
const HOOK_BANK_PATH = path.join(ROOT, 'second_brain/hook_bank.json');

function loadJson(filepath, fallback) {
  if (!fs.existsSync(filepath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch(e) { return fallback; }
}

function saveJson(filepath, data) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function getShortCode(url) {
  if (!url) return '';
  const m = url.match(/\/p\/([^\/]+)/);
  return m ? m[1] : '';
}

function categorizeCaption(caption, type) {
  const cap = (caption || '').toLowerCase();
  if (cap.includes('how to') || cap.includes('guide') || cap.includes('tutorial') || cap.includes('step')) return 'howto';
  if (cap.includes('story') || cap.includes('lesson') || cap.includes('when i') || cap.includes('my ')) return 'story';
  if (cap.includes('top') || cap.includes('list') || cap.includes('best') || cap.includes('tools') || cap.includes('ways')) return 'list';
  if ((type || '').toLowerCase().includes('carousel') || cap.includes('carousel') || cap.includes('slide')) return 'carousel';
  return 'reel';
}

function extractSpokenHook(transcript) {
  if (!transcript || transcript === 'NO_SPEECH') return null;
  // Take first 1-2 sentences (up to ~150 chars) as the spoken hook
  const clean = transcript.replace(/\n/g, ' ').trim();
  const sentenceEnd = clean.search(/[.!?](?:\s|$)/);
  if (sentenceEnd > 20 && sentenceEnd < 200) {
    // Check if there's a good second sentence to add
    const firstSentence = clean.slice(0, sentenceEnd + 1).trim();
    const rest = clean.slice(sentenceEnd + 1).trim();
    const secondEnd = rest.search(/[.!?](?:\s|$)/);
    if (secondEnd > 0 && secondEnd < 100 && firstSentence.length < 100) {
      return (firstSentence + ' ' + rest.slice(0, secondEnd + 1)).trim();
    }
    return firstSentence;
  }
  return clean.slice(0, 150).trim();
}

function classifyHook(text) {
  if (!text) return 'pattern_interrupt';
  const t = text.toLowerCase();
  if (t.match(/\?/) || t.match(/\bwhy\b|\bhow\b|\bwhat\b|\bwhen\b|\bdo you\b|\bdid you\b/)) return 'question';
  if (t.match(/\bstop\b|\bnobody\b|\bnever\b|\bdon't\b|\bwrong\b|\bmistake\b|\bsecret\b|\bexpose\b/)) return 'pattern_interrupt';
  if (t.match(/\bhow i\b|\bwhen i\b|\bi found\b|\bi built\b|\bmy \b/)) return 'story';
  if (t.match(/\b\d+\b.*\b(ways|tips|tools|reasons|steps|things)\b/)) return 'list';
  if (t.match(/\bfree\b|\bsave\b|\bget\b.*\bfree\b/)) return 'value';
  return 'pattern_interrupt';
}

function main() {
  const data = loadJson(DATA_PATH, {});
  const me = data.your_account || {};
  const followers = me.followers || 5898;
  const rawPosts = Array.isArray(me.posts) ? me.posts : [];

  let rawContentLog = loadJson(LOG_PATH, []);
  let contentLog = Array.isArray(rawContentLog) ? rawContentLog : (rawContentLog.posts || []);

  let rawPerformanceArchive = loadJson(ARCHIVE_PATH, []);
  let performanceArchive = Array.isArray(rawPerformanceArchive) ? rawPerformanceArchive : (rawPerformanceArchive.posts || []);

  let patterns = loadJson(PATTERNS_PATH, { bestFormats: [], bestPostTimes: [], bestHooks: [], avgEngByFormat: {} });

  let rawHookBank = loadJson(HOOK_BANK_PATH, []);
  let hookBank = Array.isArray(rawHookBank) ? rawHookBank : (rawHookBank.hooks || []);

  const existingLogIds = new Set(contentLog.map(p => p.id));
  let newPostsLogged = 0;
  let newHooksAdded = 0;

  const allAccounts = [];
  if (me && rawPosts.length) allAccounts.push({ handle: me.username || 'garvit.irl', posts: rawPosts, isMe: true });
  const rawComps = data.competitors || {};
  if (typeof rawComps === 'object' && !Array.isArray(rawComps)) {
    for (const [handle, acc] of Object.entries(rawComps)) {
      allAccounts.push({ handle: handle, posts: acc.posts || [], isMe: false });
    }
  }

  // A, B & E: DETECT & LOG NEW POSTS & HOOK BANK
  allAccounts.forEach(({ handle, posts, isMe }) => {
    posts.forEach(p => {
      const pid = p.id || p.shortCode || p.url;
      if (!pid) return;

      const likesCount = p.likesCount !== undefined ? p.likesCount : (p.likes || 0);
      const commentsCount = p.commentsCount !== undefined ? p.commentsCount : (p.comments || 0);
      const shortCode = p.shortCode || getShortCode(p.url);
      const url = p.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : '');
      const caption = p.caption || '';
      const timestamp = p.timestamp || new Date().toISOString();

      if (isMe && !existingLogIds.has(pid)) {
        contentLog.push({
          id: pid,
          shortCode,
          caption,
          timestamp,
          likesCount,
          commentsCount,
          url,
          type: p.type || 'Post',
          archived: false
        });
        existingLogIds.add(pid);
        newPostsLogged++;
      }

      // UPDATE HOOK BANK
      if (!hookBank.some(h => h.postId === pid || h.postUrl === url)) {
        let hookText = null;
        let source = 'caption';
        const transcriptPath = path.join(ROOT, `second_brain/transcripts/${pid}.json`);
        if (fs.existsSync(transcriptPath)) {
          try {
            const tr = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
            const spoken = extractSpokenHook(tr.transcript);
            if (spoken) {
              hookText = spoken;
              source = 'transcript';
            }
          } catch(e) {}
        }
        if (!hookText) {
          const firstLine = caption.split('\n')[0].replace(/#\w+/g, '').trim();
          hookText = firstLine.substring(0, 100).trim();
          source = 'caption';
        }
        if (hookText) {
          hookBank.push({
            hook: hookText,
            source: source,
            handle: handle.startsWith('@') ? handle : `@${handle}`,
            postId: pid,
            likes: likesCount,
            comments: commentsCount,
            type: classifyHook(hookText),
            postUrl: url,
            addedAt: new Date().toISOString()
          });
          newHooksAdded++;
        }
      }
    });
  });

  // C: UPDATE PERFORMANCE ARCHIVE (posts 48+ hours old)
  let newlyArchived = 0;
  const now = Date.now();
  const existingArchiveIds = new Set(performanceArchive.map(a => a.id));

  contentLog.forEach(post => {
    const postAgeHours = (now - new Date(post.timestamp).getTime()) / (1000 * 60 * 60);
    if (postAgeHours >= 48 && !existingArchiveIds.has(post.id)) {
      const engRate = followers ? parseFloat((((post.likesCount + post.commentsCount) / followers) * 100).toFixed(2)) : 0;
      performanceArchive.push({
        id: post.id,
        shortCode: post.shortCode,
        caption: post.caption,
        timestamp: post.timestamp,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        engagementRate: engRate,
        url: post.url,
        archivedAt: new Date().toISOString()
      });
      existingArchiveIds.add(post.id);
      post.archived = true;
      newlyArchived++;
    }
  });

  // D: UPDATE PATTERNS
  const archiveSource = performanceArchive.length ? performanceArchive : contentLog;
  const formatStats = {};

  archiveSource.forEach(post => {
    const cat = categorizeCaption(post.caption, post.type);
    const eng = post.engagementRate !== undefined
      ? post.engagementRate
      : (followers ? parseFloat((((post.likesCount + post.commentsCount) / followers) * 100).toFixed(2)) : 0);
    
    if (!formatStats[cat]) formatStats[cat] = { totalEng: 0, count: 0 };
    formatStats[cat].totalEng += eng;
    formatStats[cat].count += 1;
  });

  const avgEngByFormat = {};
  Object.keys(formatStats).forEach(cat => {
    avgEngByFormat[cat] = parseFloat((formatStats[cat].totalEng / formatStats[cat].count).toFixed(2));
  });

  const sortedFormats = Object.keys(avgEngByFormat).sort((a, b) => avgEngByFormat[b] - avgEngByFormat[a]);
  const bestFormats = sortedFormats.slice(0, 2);

  const sortedPostsByLikes = [...archiveSource].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  const bestHooks = sortedPostsByLikes
    .map(p => (p.caption || '').substring(0, 80).replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);

  patterns = {
    bestFormats,
    bestPostTimes: [],
    bestHooks,
    avgEngByFormat
  };

  // Save updated JSON files
  if (Array.isArray(rawContentLog)) {
    saveJson(LOG_PATH, contentLog);
  } else {
    rawContentLog.posts = contentLog;
    saveJson(LOG_PATH, rawContentLog);
  }

  if (Array.isArray(rawPerformanceArchive)) {
    saveJson(ARCHIVE_PATH, performanceArchive);
  } else {
    rawPerformanceArchive.posts = performanceArchive;
    saveJson(ARCHIVE_PATH, rawPerformanceArchive);
  }

  saveJson(PATTERNS_PATH, patterns);

  if (Array.isArray(rawHookBank)) {
    saveJson(HOOK_BANK_PATH, hookBank);
  } else {
    rawHookBank.hooks = hookBank;
    rawHookBank.updated_at = new Date().toISOString();
    saveJson(HOOK_BANK_PATH, rawHookBank);
  }

  // Save competitor captions to second brain
  const compCaptions = [];
  const SECOND_BRAIN = path.join(ROOT, 'second_brain');
  const rawCompsList = Array.isArray(data.competitors)
    ? data.competitors
    : Object.entries(data.competitors || {}).map(([k, v]) => ({ username: k, ...v }));
  rawCompsList.forEach(comp => {
    (comp.posts || []).forEach(p => {
      if (!p.caption) return;
      compCaptions.push({
        username: comp.username || p.username,
        caption: p.caption,
        likes: p.likes || 0,
        comments: p.comments || 0,
        type: p.type || '',
        shortCode: p.shortCode || '',
        url: p.url || '',
        timestamp: p.timestamp || null
      });
    });
  });
  compCaptions.sort((a,b) => (b.likes||0) - (a.likes||0));
  const compCaptionsPath = path.join(SECOND_BRAIN, 'competitor_captions.json');
  const tmpCompCap = compCaptionsPath + '.tmp';
  fs.writeFileSync(tmpCompCap, JSON.stringify({ updated_at: new Date().toISOString(), total: compCaptions.length, captions: compCaptions }, null, 2));
  fs.renameSync(tmpCompCap, compCaptionsPath);
  console.log(`✅ Saved ${compCaptions.length} competitor captions to second_brain`);

  console.log(`Second Brain updated: ${newPostsLogged} new posts logged, ${newlyArchived} archived, ${newHooksAdded} hooks added`);
}

main();

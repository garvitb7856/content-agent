const fs = require('fs');
const https = require('https');
require('dotenv').config();

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const LOG_PATH = 'second_brain/content_log.json';

async function fetchMyLatestPosts() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ username: ['garvit.irl'], resultsLimit: 20 });
    const options = {
      hostname: 'api.apify.com',
      path: `/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function main() {
  const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  const now = Date.now();
  const posts = log ? log.posts : undefined;
  if (!posts || !Array.isArray(posts)) {
    console.log('⚠️ No posts data found — skipping performance fetch.');
    process.exit(0);
  }
  const due = posts.filter(p => {
    if (p.performance_complete) return false;
    const age = (now - new Date(p.detected_at).getTime()) / 3600000;
    return age >= 47;
  });
  if (due.length === 0) { console.log('No posts due for 48h check.'); return; }
  console.log(`${due.length} post(s) due for 48h re-fetch...`);
  let fresh;
  try { fresh = await fetchMyLatestPosts(); } catch(e) { console.error('Apify fetch failed:', e.message); return; }
  const freshPosts = [];
  if (Array.isArray(fresh)) {
    fresh.forEach(p => { if (p.latestPosts) freshPosts.push(...p.latestPosts); else if (p.id) freshPosts.push(p); });
  }
  let updated = 0;
  log.posts = log.posts.map(p => {
    const match = freshPosts.find(fp => fp.id === p.id || fp.shortCode === p.shortCode);
    if (!match) return p;
    const age = (now - new Date(p.detected_at).getTime()) / 3600000;
    if (age >= 24 && p.likes_at_24h === null) p.likes_at_24h = match.likesCount || match.likes || 0;
    if (age >= 48 && p.likes_at_48h === null) {
      p.likes_at_48h = match.likesCount || match.likes || 0;
      p.comments_at_48h = match.commentsCount || match.comments || 0;
      p.performance_complete = true;
      updated++;
    }
    return p;
  });
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log(`48h performance recorded for ${updated} post(s).`);
}
main().catch(console.error);

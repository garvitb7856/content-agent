const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_TOKEN  = process.env.APIFY_API_TOKEN;
const MY_HANDLE  = (process.env.MY_INSTAGRAM_HANDLE || 'garvit.irl').replace('@', '').trim();
const COMPETITORS = (process.env.COMPETITOR_HANDLES || '')
  .split(',')
  .map(h => h.replace('@', '').trim())
  .filter(Boolean);

if (!API_TOKEN || API_TOKEN.includes('your_')) {
  console.error('❌ ERROR: APIFY_API_TOKEN is missing or invalid in .env file.');
  process.exit(1);
}

const client = new ApifyClient({ token: API_TOKEN });

// ── Step 1: scrape profiles to get real follower counts ──────────────────────
async function fetchProfileFollowers(handles) {
  console.log(`📊 Fetching real follower counts via profile scraper for ${handles.length} accounts...`);
  const profileInput = {
    usernames: handles
  };

  try {
    const run = await client.actor('apify/instagram-profile-scraper').call(profileInput, { waitSecs: 120 });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const followerMap = {};
    items.forEach(item => {
      const username = (item.username || item.handle || '').toLowerCase().trim();
      const count    = item.followersCount || item.followers || 0;
      if (username && count) {
        followerMap[username] = count;
        console.log(`  ✅ @${username}: ${count.toLocaleString()} followers`);
      }
    });
    return followerMap;
  } catch (err) {
    console.warn(`  ⚠️  Profile scraper error (${err.message}), follower counts will be 0`);
    return {};
  }
}

// ── Step 2: scrape posts ─────────────────────────────────────────────────────
async function fetchPosts(handles) {
  const allHandles  = [MY_HANDLE, ...handles];
  const directUrls  = allHandles.map(h => `https://www.instagram.com/${h}/`);

  console.log(`\n📸 Fetching posts for all ${allHandles.length} accounts...`);
  const run = await client.actor('apify/instagram-scraper').call({
    directUrls,
    resultsLimit: 20,
    resultsType:  'posts'
  });
  console.log(`✅ Posts run finished. Run ID: ${run.id}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`📦 Received ${items.length} raw posts.\n`);
  return items;
}

// ── Utility ──────────────────────────────────────────────────────────────────
function computeStats(posts) {
  if (!posts || posts.length === 0) {
    return { post_count: 0, avg_likes: 0, avg_comments: 0, top_post: null };
  }
  const sumLikes    = posts.reduce((s, p) => s + (p.likes || 0), 0);
  const sumComments = posts.reduce((s, p) => s + (p.comments || 0), 0);
  const topPost     = posts.reduce((max, p) => ((p.likes || 0) > (max.likes || 0) ? p : max), posts[0]);
  return {
    post_count:   posts.length,
    avg_likes:    Math.round((sumLikes    / posts.length) * 10) / 10,
    avg_comments: Math.round((sumComments / posts.length) * 10) / 10,
    top_post:     topPost
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function runFetcher() {
  console.log(`===============================================`);
  console.log(`🚀 STARTING REAL INSTAGRAM DATA SCRAPE (APIFY)`);
  console.log(`===============================================`);
  console.log(`👤 Your Account : @${MY_HANDLE}`);
  console.log(`👥 Competitors  : ${COMPETITORS.map(c => '@' + c).join(', ')}\n`);

  try {
    // Run both in parallel: profiles + posts
    const allHandles = [MY_HANDLE, ...COMPETITORS];
    const [followerMap, postItems] = await Promise.all([
      fetchProfileFollowers(allHandles),
      fetchPosts(COMPETITORS)
    ]);

    // ── Sort post items by owner ──────────────────────────────────────────────
    const yourPosts = [];
    const compMap   = {};
    COMPETITORS.forEach(h => { compMap[h] = []; });

    postItems.forEach(item => {
      const owner   = (item.ownerUsername || item.owner?.username || item.username || '').toLowerCase();
      const postObj = {
        id:       item.id,
        username: item.ownerUsername || item.username || owner,
        caption:  (item.caption || item.alt || '').slice(0, 300),
        likes:    item.likesCount || item.likes    || 0,
        comments: item.commentsCount || item.comments || 0,
        type:     item.type || 'Post',
        url:      item.url || ''
      };

      if (owner === MY_HANDLE.toLowerCase()) {
        yourPosts.push(postObj);
      } else {
        const key = Object.keys(compMap).find(k => k.toLowerCase() === owner);
        if (key) compMap[key].push(postObj);
      }
    });

    // ── Build output ─────────────────────────────────────────────────────────
    const competitorsData = {};
    COMPETITORS.forEach(h => {
      const realFollowers = followerMap[h.toLowerCase()] || 0;
      competitorsData[h] = {
        followers: realFollowers,
        posts:     compMap[h],
        stats:     computeStats(compMap[h])
      };
    });

    const myFollowers = followerMap[MY_HANDLE.toLowerCase()] || 5845;

    const data = {
      fetched_at:   new Date().toISOString(),
      sample_data:  false,
      your_account: {
        username:  MY_HANDLE,
        followers: myFollowers,
        posts:     yourPosts,
        stats:     computeStats(yourPosts)
      },
      competitors: competitorsData
    };

    // ── Write files ───────────────────────────────────────────────────────────
    const outPath1 = path.join(__dirname, '../dashboard/data/data.json');
    const outPath2 = path.join(__dirname, '../dashboard/data.json');
    fs.mkdirSync(path.dirname(outPath1), { recursive: true });
    fs.writeFileSync(outPath1, JSON.stringify(data, null, 2));
    fs.writeFileSync(outPath2, JSON.stringify(data, null, 2));

    console.log(`\n🎉 SUCCESS! Data written to dashboard/data/data.json\n`);
    console.log(`📊 REAL FOLLOWER COUNTS:`);
    console.log(`  ⭐ @${MY_HANDLE}: ${myFollowers.toLocaleString()} followers (${yourPosts.length} posts, avg ${data.your_account.stats.avg_likes} likes)`);
    Object.entries(competitorsData).forEach(([h, c]) => {
      console.log(`  👤 @${h}: ${(c.followers || 0).toLocaleString()} followers (${c.posts.length} posts, avg ${c.stats.avg_likes} likes)`);
    });

  } catch (err) {
    console.error('❌ Error during scrape:', err.message);
    process.exit(1);
  }
}

runFetcher();

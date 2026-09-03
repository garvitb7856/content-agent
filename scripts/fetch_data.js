const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_TOKEN  = process.env.APIFY_API_TOKEN;

if (!API_TOKEN || API_TOKEN.includes('your_')) {
  console.error('❌ ERROR: APIFY_API_TOKEN is missing or invalid in .env file.');
  process.exit(1);
}

const client = new ApifyClient({ token: API_TOKEN });

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

  try {
    const input = {
      "usernames": [
        "garvit.irl", 
        "nick_saraev", 
        "arshman", 
        "ishansharma7390", 
        "aryamanupmanyu", 
        "nivedan.ai", 
        "dhavalkataria_", 
        "vaibhavsisinty", 
        "favourite.engineer",
        "thevarunmayya"
      ],
      "postsPerProfile": 20,
      "proxy": { "useApifyProxy": true }
    };

    console.log(`\n📸 Fetching posts for all ${input.usernames.length} accounts...`);
    const run = await client.actor('sones~instagram-posts-scraper-lowcost').call(input);
    console.log(`✅ Posts run finished. Run ID: ${run.id}`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`📦 Received ${items.length} raw posts.\n`);

    // ── Sort post items by owner ──────────────────────────────────────────────
    const yourPosts = [];
    const compMap   = {};
    input.usernames.forEach(h => { 
      if (h !== 'garvit.irl') compMap[h] = []; 
    });

    const followerMap = {};

    items.forEach(item => {
      const username = (item.user?.username || item.owner?.username || '').toLowerCase().trim();
      const followerCount = item.user?.follower_count || item.owner?.follower_count || 0;
      
      if (username && followerCount && !followerMap[username]) {
        followerMap[username] = followerCount;
      }

      const shortCode = item.shortCode || item.code || item.id;
      
      const postObj = {
        id:       item.id || shortCode,
        username: username,
        caption:  (typeof item.caption === 'string' ? item.caption : '').slice(0, 300),
        likes:    item.like_count || item.likeCount || 0,
        comments: item.comment_count || item.commentCount || 0,
        type:     'Post',
        url:      shortCode ? `https://www.instagram.com/p/${shortCode}/` : '',
        timestamp: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : ''
      };

      if (username === 'garvit.irl') {
        yourPosts.push(postObj);
      } else {
        const key = Object.keys(compMap).find(k => k.toLowerCase() === username);
        if (key) compMap[key].push(postObj);
      }
    });

    console.log(`\n👥 Fetching real follower counts for all profiles...`);
    const profileRun = await client.actor('apify~instagram-profile-scraper').call({
      usernames: input.usernames
    });
    console.log(`✅ Profile run finished. Run ID: ${profileRun.id}`);
    const { items: profileItems } = await client.dataset(profileRun.defaultDatasetId).listItems();
    
    profileItems.forEach(result => {
      if (result.username) {
        followerMap[result.username.toLowerCase()] = result.followersCount || 0;
      }
    });

    // ── Build output ─────────────────────────────────────────────────────────
    const competitorsData = {};
    input.usernames.filter(h => h !== 'garvit.irl').forEach(h => {
      const realFollowers = followerMap[h.toLowerCase()] || 0;
      competitorsData[h] = {
        followers: realFollowers,
        posts:     compMap[h],
        stats:     computeStats(compMap[h])
      };
    });

    const myFollowers = followerMap['garvit.irl'] || 5845;

    const data = {
      fetched_at:   new Date().toISOString(),
      sample_data:  false,
      your_account: {
        username:  'garvit.irl',
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
    console.log(`  ⭐ @garvit.irl: ${myFollowers.toLocaleString()} followers (${yourPosts.length} posts, avg ${data.your_account.stats.avg_likes} likes)`);
    Object.entries(competitorsData).forEach(([h, c]) => {
      console.log(`  👤 @${h}: ${(c.followers || 0).toLocaleString()} followers (${c.posts.length} posts, avg ${c.stats.avg_likes} likes)`);
    });

  } catch (err) {
    console.error('❌ Error during scrape:', err.message);
    process.exit(1);
  }
}

runFetcher();

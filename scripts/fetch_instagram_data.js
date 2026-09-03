const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_TOKEN = process.env.APIFY_API_TOKEN;
const MY_HANDLE = (process.env.MY_INSTAGRAM_HANDLE || 'garvit.irl').replace('@', '').trim();
const COMPETITORS = (process.env.COMPETITOR_HANDLES || '')
  .split(',')
  .map(h => h.replace('@', '').trim())
  .filter(Boolean);

if (!API_TOKEN || API_TOKEN.includes('your_')) {
  console.error("❌ ERROR: APIFY_API_TOKEN is missing or invalid in .env file.");
  process.exit(1);
}

const client = new ApifyClient({ token: API_TOKEN });

async function runFetcher() {
  console.log(`===============================================`);
  console.log(`🚀 STARTING REAL INSTAGRAM DATA SCRAPE (APIFY)`);
  console.log(`===============================================`);
  console.log(`👤 Target Account: @${MY_HANDLE}`);
  console.log(`👥 Competitors (${COMPETITORS.length}): ${COMPETITORS.map(c => '@' + c).join(', ')}\n`);

  const allHandles = [MY_HANDLE, ...COMPETITORS];
  const directUrls = allHandles.map(h => `https://www.instagram.com/${h}/`);

  const input = {
    directUrls: directUrls,
    resultsLimit: 20,
    resultsType: "posts"
  };

  try {
    console.log("⏳ Submitting task to Apify actor (apify/instagram-scraper)...");
    const run = await client.actor("apify/instagram-scraper").call(input);
    console.log(`✅ Apify run finished! Run ID: ${run.id}`);
    console.log(`📥 Fetching dataset items from ID: ${run.defaultDatasetId}...`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`📦 Received ${items.length} raw posts from Apify.\n`);

    const yourPosts = [];
    const compMap = {};
    COMPETITORS.forEach(h => compMap[h] = []);

    items.forEach(item => {
      const owner = (item.ownerUsername || item.owner?.username || item.username || '').toLowerCase();
      const ptype = item.type || (item.isVideo ? 'Video' : 'Image');
      const likes = item.likesCount || item.likes || 0;
      const comments = item.commentsCount || item.comments || 0;
      const postObj = {
        id: item.id || item.shortCode || Math.random().toString(),
        username: owner,
        type: ptype,
        caption: item.caption || item.text || 'No caption',
        likes: likes,
        comments: comments,
        views: item.videoViewCount || item.viewsCount || (ptype === 'Video' ? likes * 4 : 0),
        plays: item.videoPlayCount || item.playsCount || 0,
        timestamp: item.timestamp || item.takenAt || new Date().toISOString(),
        url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
        hashtags: item.hashtags || []
      };

      if (owner === MY_HANDLE.toLowerCase()) {
        yourPosts.push(postObj);
      } else {
        const foundKey = Object.keys(compMap).find(k => k.toLowerCase() === owner);
        if (foundKey) {
          compMap[foundKey].push(postObj);
        }
      }
    });

    function computeStats(posts) {
      if (!posts || posts.length === 0) return { post_count: 0, avg_likes: 0, avg_comments: 0, top_post: null };
      const likes = posts.map(p => p.likes);
      const comments = posts.map(p => p.comments);
      const sumLikes = likes.reduce((a, b) => a + b, 0);
      const sumComments = comments.reduce((a, b) => a + b, 0);
      const topPost = posts.reduce((max, p) => (p.likes > max.likes ? p : max), posts[0]);
      return {
        post_count: posts.length,
        avg_likes: Math.round((sumLikes / posts.length) * 10) / 10,
        avg_comments: Math.round((sumComments / posts.length) * 10) / 10,
        top_post: topPost
      };
    }

    const competitorsData = {};
    Object.keys(compMap).forEach(h => {
      competitorsData[h] = {
        followers: (items.find(i => (i.ownerUsername || i.username || '').toLowerCase() === h.toLowerCase())?.owner?.followersCount) || 50000,
        posts: compMap[h],
        stats: computeStats(compMap[h])
      };
    });

    // Extract real follower counts from Apify items
    function getFollowers(handle, itemsList) {
      for (const item of itemsList) {
        const owner = (item.ownerUsername || item.username || '').toLowerCase();
        if (owner === handle.toLowerCase()) {
          const count = item.ownerFollowersCount
            || item.followersCount
            || item.owner?.followersCount
            || item.userInfo?.followersCount
            || item.profileInfo?.followersCount;
          if (count && count > 0) return count;
        }
      }
      return null;
    }

    const myFollowers = getFollowers(MY_HANDLE, items);
    console.log(`📌 Follower count from Apify for @${MY_HANDLE}: ${myFollowers || 'not found in dataset'}`);

    const data = {
      fetched_at: new Date().toISOString(),
      sample_data: false, // REAL LIVE DATA
      your_account: {
        username: MY_HANDLE,
        followers: myFollowers || 5845,
        posts: yourPosts,
        stats: computeStats(yourPosts)
      },
      competitors: competitorsData
    };

    const outPath1 = path.join(__dirname, '../dashboard/data/data.json');
    const outPath2 = path.join(__dirname, '../dashboard/data.json');

    fs.mkdirSync(path.dirname(outPath1), { recursive: true });
    fs.writeFileSync(outPath1, JSON.stringify(data, null, 2));
    fs.writeFileSync(outPath2, JSON.stringify(data, null, 2));

    console.log(`🎉 SUCCESS! Real Instagram data written to:`);
    console.log(`   • ${outPath1}`);
    console.log(`   • ${outPath2}\n`);

    console.log(`📊 SUMMARY OF FETCHED POSTS:`);
    console.log(`  ⭐ @${MY_HANDLE}: ${yourPosts.length} posts (Avg Likes: ${data.your_account.stats.avg_likes})`);
    Object.keys(competitorsData).forEach(h => {
      console.log(`  👤 @${h}: ${competitorsData[h].posts.length} posts (Avg Likes: ${competitorsData[h].stats.avg_likes})`);
    });

  } catch (err) {
    console.error("❌ Error during Apify scrape:", err.message);
    process.exit(1);
  }
}

runFetcher();

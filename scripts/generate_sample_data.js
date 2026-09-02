const fs = require('fs');
const path = require('path');

const HANDLES = {
  "garvit.irl": { followers: 18400, tier: "yours" },
  "nick_saraev": { followers: 142000, tier: "big" },
  "arshman": { followers: 85000, tier: "big" },
  "ishansharma7390": { followers: 920000, tier: "macro" },
  "aryamanupmanyu": { followers: 560000, tier: "macro" },
  "nivedan.ai": { followers: 31000, tier: "mid" },
  "dhavalkataria_": { followers: 78000, tier: "big" },
  "vaibhavsisinty": { followers: 210000, tier: "big" },
  "favourite.engineer": { followers: 44000, tier: "mid" }
};

const POST_TYPES = ["Image", "Video", "Sidecar"];
const TOPICS = [
  "AI tools that 10x your productivity",
  "Why most people fail at content creation",
  "The only content framework you need",
  "How I went from 0 to 18k followers in 6 months",
  "Stop doing this on Instagram",
  "5 AI prompts that write your captions",
  "My exact content workflow",
  "The viral hook formula",
  "Why consistency beats virality",
  "Building in public: week 3 update"
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function makePosts(username, n = 20) {
  const posts = [];
  const tier = HANDLES[username].tier;
  const baseLikesMap = { yours: 280, mid: 900, big: 3500, macro: 18000 };
  const baseLikes = baseLikesMap[tier];

  for (let i = 0; i < n; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - (i * 3 + getRandomInt(0, 2)));
    const likes = Math.floor(baseLikes * getRandomFloat(0.4, 2.8));
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const ptype = POST_TYPES[Math.floor(Math.random() * POST_TYPES.length)];

    posts.push({
      id: `${username}_${i}`,
      username: username,
      type: ptype,
      caption: `${topic} — here's exactly how I do it\n\n#contentcreator #ai #instagram #growth`,
      likes: likes,
      comments: Math.floor(likes * getRandomFloat(0.02, 0.08)),
      views: ptype === "Video" ? Math.floor(likes * getRandomFloat(3, 12)) : 0,
      plays: ptype === "Video" ? Math.floor(likes * getRandomFloat(4, 15)) : 0,
      timestamp: dt.toISOString(),
      url: `https://www.instagram.com/p/sample_${username}_${i}/`,
      hashtags: ["contentcreator", "ai", "instagram", "growth", "creator"]
    });
  }
  return posts;
}

function computeStats(posts) {
  if (!posts || posts.length === 0) return {};
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

const yourPosts = makePosts("garvit.irl", 20);

const competitorsData = {};
Object.keys(HANDLES).forEach(h => {
  if (h !== "garvit.irl") {
    const p = makePosts(h, 20);
    competitorsData[h] = {
      followers: HANDLES[h].followers,
      posts: p,
      stats: computeStats(p)
    };
  }
});

const data = {
  fetched_at: new Date().toISOString(),
  sample_data: true,
  your_account: {
    username: "garvit.irl",
    followers: HANDLES["garvit.irl"].followers,
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

console.log(`Sample data written successfully to ${outPath1} and ${outPath2}`);
Object.keys(data.competitors).forEach(h => {
  console.log(`  @${h}: ${data.competitors[h].stats.post_count} posts`);
});

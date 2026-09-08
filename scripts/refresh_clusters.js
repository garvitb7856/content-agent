const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ROOT = path.join(__dirname, '..');
const CLUSTERS_PATH = path.join(ROOT, 'second_brain/topic_clusters.json');
const HISTORY_PATH  = path.join(ROOT, 'second_brain/ideas_history.json');
const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const UNCATEGORIZED_THRESHOLD = 15;

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function loadClusters() {
  try { return JSON.parse(fs.readFileSync(CLUSTERS_PATH, 'utf8')); } catch(e) { return []; }
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch(e) { return { generated_topics: [], posted_topics: [] }; }
}

function getUncategorized(clusters, history) {
  const allTitles = [
    ...(history.generated_topics || []).map(t => (t.title || t).toLowerCase()),
    ...(history.posted_topics    || []).map(t => (t.title || t).toLowerCase()),
  ];
  return allTitles.filter(title =>
    !clusters.some(c => c.keywords.some(kw => title.includes(kw)))
  );
}

async function askGemini(prompt) {
  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
  });
  const models = ['gemini-3.7-flash','gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.0-flash','gemini-2.5-flash','gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.1-flash-lite'];
  for (const model of models) {
    try {
      const result = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };
        const req = https.request(options, res => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => resolve({ status: res.statusCode, body: d }));
        });
        req.on('error', reject); req.write(postData); req.end();
      });
      if (result.status >= 200 && result.status < 300) {
        const text = JSON.parse(result.body).candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 10) return text;
      }
    } catch(e) { console.log('⚠️ ' + model + ': ' + e.message); }
  }
  return null;
}

async function main() {
  const clusters = loadClusters();
  const history  = loadHistory();
  const uncategorized = getUncategorized(clusters, history);

  console.log(`🔍 Cluster refresh check: ${uncategorized.length} uncategorized titles found.`);

  if (uncategorized.length < UNCATEGORIZED_THRESHOLD) {
    console.log(`✅ Below threshold (${UNCATEGORIZED_THRESHOLD}) — no refresh needed.`);
    return;
  }

  console.log(`⚡ Threshold crossed — asking Gemini to propose new topic clusters...`);

  const prompt = `You are a content taxonomy system. Below are content idea titles from an Indian creator in the AI, tech, and entrepreneurship niche that don't fit any existing category.

UNCATEGORIZED TITLES:
${uncategorized.map((t, i) => `${i + 1}. ${t}`).join('\n')}

EXISTING CLUSTERS (don't duplicate these):
${clusters.map(c => `- ${c.name}`).join('\n')}

Your task: Group the uncategorized titles into NEW topic clusters that don't overlap with existing ones.

Return ONLY a valid JSON array. No explanation. No markdown. No code blocks. Start with [ and end with ].
Each object must have exactly:
- "name": a short descriptive cluster name (string)
- "keywords": array of 5-10 lowercase keyword substrings that identify this cluster

Example format:
[
  { "name": "Fitness / health / wellness", "keywords": ["fitness","gym","health","workout","diet","sleep","wellness","running"] }
]

Only return clusters for groups of 3 or more similar titles. Skip one-offs.`;

  const raw = await askGemini(prompt);
  if (!raw) { console.log('❌ Gemini failed to respond — skipping refresh.'); return; }

  let newClusters = [];
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) newClusters = JSON.parse(m[0]);
  } catch(e) { console.log('❌ Could not parse Gemini response — skipping.'); return; }

  if (!newClusters.length) {
    console.log('ℹ️ Gemini found no new clusters worth adding (not enough grouped titles yet).');
    return;
  }

  const merged = [...clusters, ...newClusters];
  atomicWrite(CLUSTERS_PATH, merged);
  console.log(`✅ Added ${newClusters.length} new cluster(s) to topic_clusters.json:`);
  newClusters.forEach(c => console.log(`   + "${c.name}" — keywords: ${c.keywords.join(', ')}`));
}

main();

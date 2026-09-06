const fs = require('fs');

function classifyPattern(caption) {
  const p = [];
  if (/step \d|\d\.\s|\d\)/im.test(caption)) p.push('numbered_steps');
  if (/comment|dm me/i.test(caption)) p.push('comment_CTA');
  if (/i was|i started|when i|i used to/i.test(caption)) p.push('narrative');
  if (/before|after|used to|now i/i.test(caption)) p.push('transformation');
  if (/\n[-•]\s|\n\d+\./m.test(caption)) p.push('listicle');
  return p.length ? p.join(' + ') : 'unknown';
}

function classifyTopic(caption) {
  if (/claude|anthropic/i.test(caption)) return 'Claude/AI Tools';
  if (/money|income|revenue|business/i.test(caption)) return 'Monetization';
  if (/productivity|automate|workflow/i.test(caption)) return 'Productivity';
  if (/ai agent|n8n|make\.com/i.test(caption)) return 'AI Automation';
  if (/career|job|hire/i.test(caption)) return 'Career';
  return 'General Tech';
}

const data = JSON.parse(fs.readFileSync('dashboard/data/data.json', 'utf8'));
const store = JSON.parse(fs.readFileSync('second_brain/competitor_scripts.json', 'utf8'));
const existingIds = new Set(store.scripts.map(s => s.id));

let added = 0;
const comps = data.competitors || {};

Object.entries(comps).forEach(([handle, comp]) => {
  const followers = comp.followers || 10000;
  (comp.posts || []).forEach(post => {
    if (existingIds.has(post.id)) return;
    if ((post.likes || 0) < 200) return;
    const eng = ((post.likes + (post.comments || 0)) / followers) * 100;
    const verdict = eng > 5 ? 'viral' : eng > 3 ? 'high' : eng > 1 ? 'medium' : 'low';
    if (verdict === 'low') return;
    const caption = post.caption || post.description || '';
    store.scripts.push({
      id: post.id,
      account: '@' + handle,
      url: post.url || `https://www.instagram.com/p/${post.shortCode || post.id}/`,
      topic: classifyTopic(caption),
      format: post.type || (post.isVideo ? 'Reel' : 'Carousel'),
      hook: caption.split('\n')[0].substring(0, 200),
      full_caption: caption.substring(0, 1500),
      script_pattern: classifyPattern(caption),
      likes: post.likes || 0,
      comments: post.comments || 0,
      engagement_rate: Math.round(eng * 100) / 100,
      verdict,
      scraped_at: new Date().toISOString()
    });
    existingIds.add(post.id);
    added++;
  });
});

store.updated_at = new Date().toISOString();
fs.writeFileSync('second_brain/competitor_scripts.json', JSON.stringify(store, null, 2));
const viral = store.scripts.filter(s => s.verdict === 'viral').length;
console.log(`Competitor scripts updated: ${added} new. Total: ${store.scripts.length}. Viral: ${viral}.`);

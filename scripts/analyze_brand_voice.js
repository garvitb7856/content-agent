const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ROOT = path.join(__dirname, '..');
const MY_HANDLE = (process.env.MY_INSTAGRAM_HANDLE || 'garvit.irl').replace('@','').toLowerCase();

const MODEL_POOL = [
  'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash',
  'gemini-3.5-flash','gemini-3.0-flash','gemini-2.5-flash',
  'gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.1-flash-lite'
];

function safeRead(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return d; } }
function atomicWrite(p, data) { const t = p+'.tmp'; fs.writeFileSync(t, JSON.stringify(data,null,2)); fs.renameSync(t,p); }

async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  for (const modelId of MODEL_POOL) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { maxOutputTokens: 4096, temperature: 0.3 } });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch(e) {
      const msg = e.message || '';
      if (msg.includes('429') || msg.includes('503')) {
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }
  throw new Error('All models exhausted');
}

async function main() {
  console.log('🧠 Analyzing brand voice...');

  // Load all transcripts — split own vs competitor
  const transcriptsDir = path.join(ROOT, 'second_brain/transcripts');
  let myTranscripts = [];
  let compTranscripts = [];

  if (fs.existsSync(transcriptsDir)) {
    const allT = fs.readdirSync(transcriptsDir)
      .filter(f => f.endsWith('.json') && f !== 'transcribed_ids.json')
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf8')); } catch(e) { return null; } })
      .filter(t => t && t.transcript && t.transcript !== 'NO_SPEECH' && t.transcript.length > 50);

    myTranscripts = allT
      .filter(t => (t.handle||'').toLowerCase().replace('@','') === MY_HANDLE)
      .sort((a,b) => (b.likes||0)-(a.likes||0));

    compTranscripts = allT
      .filter(t => (t.handle||'').toLowerCase().replace('@','') !== MY_HANDLE)
      .sort((a,b) => (b.likes||0)-(a.likes||0));
  }

  // Load full captions from data.json
  const dataRaw = safeRead(path.join(ROOT, 'dashboard/data.json'), {});
  const me = dataRaw.your_account || {};
  const myPosts = (me.posts || me.recent_posts || []).sort((a,b)=>(b.likes||0)-(a.likes||0));

  // Load content_log for script type classification
  const contentLog = safeRead(path.join(ROOT, 'second_brain/content_log.json'), []);
  const logMap = {};
  (Array.isArray(contentLog) ? contentLog : []).forEach(p => { logMap[p.id] = p; });

  // Script type performance — A/B/C
  const scriptTypeStats = { A: { likes: [], label: 'AI script used (≥60% match)' }, B: { likes: [], label: 'AI idea, own script (30-60% match)' }, C: { likes: [], label: 'Completely original content' } };
  myPosts.forEach(p => {
    const log = logMap[p.id] || logMap[String(p.id)];
    const diff = log?.diffAnalysis?.type;
    const likes = p.likes || 0;
    if (diff === 'agent_script_used') scriptTypeStats.A.likes.push(likes);
    else if (diff === 'agent_idea_own_script') scriptTypeStats.B.likes.push(likes);
    else scriptTypeStats.C.likes.push(likes);
  });
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
  const scriptTypePerformance = {
    A: { count: scriptTypeStats.A.likes.length, avgLikes: avg(scriptTypeStats.A.likes), label: scriptTypeStats.A.label },
    B: { count: scriptTypeStats.B.likes.length, avgLikes: avg(scriptTypeStats.B.likes), label: scriptTypeStats.B.label },
    C: { count: scriptTypeStats.C.likes.length, avgLikes: avg(scriptTypeStats.C.likes), label: scriptTypeStats.C.label }
  };

  const sortedTypes = Object.entries(scriptTypePerformance).sort((a,b)=>b[1].avgLikes-a[1].avgLikes);
  const winnerType = sortedTypes[0];
  const scriptTypeVerdict = `Script type ${winnerType[0]} (${winnerType[1].label}) performs best with avg ${winnerType[1].avgLikes} likes. ` +
    sortedTypes.map(([t,s])=>`Type ${t}: ${s.count} posts, avg ${s.avgLikes} likes`).join(' | ');

  // Build own viral scripts context (top 5, full transcript up to 1200 chars)
  const myViralScripts = myTranscripts.slice(0, 5).map(t => {
    const log = logMap[t.postId] || logMap[t.id];
    const scriptType = log?.diffAnalysis?.type === 'agent_script_used' ? 'A (AI script)' :
                       log?.diffAnalysis?.type === 'agent_idea_own_script' ? 'B (AI idea, own script)' : 'C (fully original)';
    const fullPost = myPosts.find(p => String(p.id) === String(t.postId || t.id));
    const fullCaption = fullPost?.caption || '';
    return {
      postUrl: t.postUrl || `https://www.instagram.com/p/${t.shortCode}/`,
      likes: t.likes || 0,
      comments: t.comments || 0,
      scriptType,
      hook: t.transcript.slice(0, 120),
      transcript: t.transcript.slice(0, 1200),
      caption: fullCaption.slice(0, 500),
      transcriptFull: t.transcript
    };
  });

  // Build competitor viral scripts context (top 8, full transcript up to 1000 chars)
  const compViralScripts = compTranscripts.slice(0, 8).map(t => ({
    handle: t.handle,
    postUrl: t.postUrl,
    likes: t.likes || 0,
    comments: t.comments || 0,
    hook: t.transcript.slice(0, 120),
    transcript: t.transcript.slice(0, 1000),
    transcriptFull: t.transcript
  }));

  // Top 5 captions (written word only — from caption field)
  const topCaptions = myPosts.slice(0, 5).map(p => ({
    likes: p.likes || 0,
    caption: (p.caption || '').slice(0, 600),
    url: p.url || `https://www.instagram.com/p/${p.shortCode}/`
  }));

  // Use Gemini to do deep pattern analysis
  console.log('Running Gemini brand voice analysis...');

  const myScriptText = myViralScripts.map((s,i) =>
    `--- Own Script ${i+1} (${s.likes} likes, Type ${s.scriptType}) ---\nHOOK (first 120 chars): "${s.hook}"\nFULL TRANSCRIPT EXCERPT:\n"${s.transcript}"\nWRITTEN CAPTION:\n"${s.caption}"`
  ).join('\n\n');

  const compScriptText = compViralScripts.map((s,i) =>
    `--- Competitor Script ${i+1} @${s.handle} (${s.likes} likes) ---\nHOOK: "${s.hook}"\nTRANSCRIPT EXCERPT:\n"${s.transcript}"`
  ).join('\n\n');

  const analysisPrompt = `
You are analyzing the content style of @garvit.irl (Instagram creator, AI + Tech + Entrepreneurship niche, Indian audience).

Analyze the following scripts and provide a structured brand voice intelligence report.

=== GARVIT'S OWN TOP PERFORMING SCRIPTS (spoken transcripts + written captions) ===
${myScriptText}

=== COMPETITOR TOP PERFORMING SCRIPTS (spoken transcripts) ===
${compScriptText}

=== SCRIPT TYPE PERFORMANCE ===
${scriptTypeVerdict}

Provide your analysis in this EXACT JSON format (no markdown, just raw JSON):
{
  "garvit_speaking_style": {
    "summary": "2-3 sentences describing exactly how Garvit speaks on camera",
    "sentence_structure": "short/punchy or long/explanatory?",
    "language_mix": "Hindi-English ratio and style",
    "tone": "casual/formal/conversational",
    "pacing": "fast/medium/slow, dense info or spaced out",
    "signature_phrases": ["phrase1", "phrase2", "phrase3"],
    "what_makes_it_work": "one key insight about why his speaking style connects"
  },
  "garvit_writing_style": {
    "summary": "2-3 sentences describing how Garvit writes captions",
    "caption_structure": "how he opens, how he structures the body, how he closes",
    "cta_patterns": ["most common CTA pattern 1", "pattern 2"],
    "tone_vs_speaking": "is his written tone different from his spoken tone? how?"
  },
  "competitor_speaking_patterns": {
    "summary": "what do viral competitor scripts have in common that Garvit's don't?",
    "viral_hook_patterns": ["pattern1", "pattern2", "pattern3"],
    "viral_body_structure": "how do competitors structure their viral scripts?",
    "viral_cta_patterns": ["pattern1", "pattern2"],
    "key_difference_from_garvit": "specific difference in style/structure/wording"
  },
  "viral_own_script_analysis": [
    {
      "rank": 1,
      "likes": 0,
      "hook": "",
      "hook_type": "pattern_interrupt/question/story/list",
      "hook_length_words": 0,
      "body_structure": "how is the body built? list/story/demo/reveal?",
      "cta": "what is the CTA?",
      "script_type": "A/B/C",
      "what_made_it_viral": "specific reason this worked — hook? topic? timing? structure?"
    }
  ],
  "verdict": {
    "whose_style_goes_viral": "Garvit's original style / Competitor-inspired style / Hybrid",
    "reasoning": "evidence-based explanation",
    "recommended_hook_structure": "exact template for hooks that work for Garvit",
    "recommended_body_structure": "exact template for body that works for Garvit",
    "recommended_cta_structure": "exact template for CTA that works for Garvit",
    "avoid_these": ["thing to avoid 1", "thing to avoid 2"]
  }
}
`.trim();

  let analysis = {};
  try {
    const raw = await callGemini(analysisPrompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    console.log('✅ Gemini analysis complete');
  } catch(e) {
    console.log('⚠️ Gemini analysis failed, saving raw data only:', e.message);
  }

  const brandVoice = {
    updated_at: new Date().toISOString(),
    script_type_performance: scriptTypePerformance,
    script_type_verdict: scriptTypeVerdict,
    your_viral_scripts: myViralScripts,
    your_top_captions: topCaptions,
    competitor_viral_scripts: compViralScripts,
    gemini_analysis: analysis
  };

  atomicWrite(path.join(ROOT, 'second_brain/brand_voice.json'), brandVoice);
  console.log(`✅ brand_voice.json written`);
  console.log(`   Own transcripts: ${myTranscripts.length} | Competitor: ${compTranscripts.length}`);
  console.log(`   Script types: A=${scriptTypePerformance.A.count} B=${scriptTypePerformance.B.count} C=${scriptTypePerformance.C.count}`);
  console.log(`   Verdict: ${analysis.verdict?.whose_style_goes_viral || 'pending data'}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

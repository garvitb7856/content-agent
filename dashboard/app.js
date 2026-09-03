// ── Config ───────────────────────────────────────────────
const DATA_FILE   = 'data/data.json';
const AGENTS_FILE = 'data/agents_output.json';

// ── Formatter ─────────────────────────────────────────────
function fmt(n) {
  const num = parseInt(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000)    return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

// ── Modal ─────────────────────────────────────────────────
let agentOutputs = {};   // populated after agents_output.json loads

const modalEl    = document.getElementById('agent-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody  = document.getElementById('modal-body');

function openModal(title, text) {
  modalTitle.textContent = title;
  // Full markdown-to-HTML conversion
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.*?)$/gm, '<h4 style="color:#a78bfa;margin:14px 0 4px;">$1</h4>')
    .replace(/^### (.*?)$/gm,  '<h3 style="color:#c4b5fd;margin:16px 0 6px;">$1</h3>')
    .replace(/^## (.*?)$/gm,   '<h2 style="color:#e9d5ff;margin:18px 0 8px;">$1</h2>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f1f5f9;">$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em style="color:#cbd5e1;">$1</em>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr style="border-color:#2d2d4e;margin:12px 0;">')
    // Bullet points
    .replace(/^\*   (.*?)$/gm, '<li style="margin:4px 0 4px 16px;">$1</li>')
    .replace(/^\* (.*?)$/gm,   '<li style="margin:4px 0 4px 16px;">$1</li>')
    .replace(/^- (.*?)$/gm,    '<li style="margin:4px 0 4px 16px;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.*?)$/gm,'<li style="margin:4px 0 4px 16px;">$1</li>')
    // Blockquote
    .replace(/^&gt; (.*?)$/gm, '<blockquote style="border-left:3px solid #7c3aed;padding-left:12px;color:#94a3b8;margin:8px 0;">$1</blockquote>')
    // Line breaks
    .replace(/\n/g, '<br>');
  modalBody.innerHTML = html;
  modalEl.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Scroll to top every time modal opens
  modalBody.scrollTop = 0;
}

function closeModal() {
  modalEl.style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });

// ── Wire "View Full Output" buttons ───────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key   = btn.dataset.agent;
    const title = btn.dataset.title;
    const text  = agentOutputs[key] || 'No AI output yet.\n\nRun: node scripts/run_agents.js';
    openModal(title, text);
  });
});

// ── Stats bar renderer ────────────────────────────────────
function renderStatsBar(data, hasAgents) {
  const container = document.getElementById('stats-bar');
  if (!container) return;

  const mine      = data.your_account || {};
  const followers = mine.followers || 5845;
  const avgLikes  = mine.stats?.avg_likes || mine.avg_likes || 0;
  const posts     = mine.posts || mine.recent_posts || [];
  const isLive    = !data.sample_data && !data._sample;

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Data Freshness</div>
      <div class="stat-value" style="color:${isLive ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
        ${isLive ? '🟢 LIVE' : '⚠️ SAMPLE'}
      </div>
      <div class="stat-sub">${isLive ? 'Real Apify Instagram Data' : 'Sample Dataset'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">AI Agents Engine</div>
      <div class="stat-value" style="color:${hasAgents ? 'var(--accent-emerald)' : 'var(--accent-cyan)'}">
        ${hasAgents ? '⚡ LIVE GEMINI' : '5 / 5 ACTIVE'}
      </div>
      <div class="stat-sub">${hasAgents ? 'Powered by Gemini API' : 'Automated & Syncing'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Your Followers</div>
      <div class="stat-value">${fmt(followers)}</div>
      <div class="stat-sub">@garvit.irl</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Likes / Post</div>
      <div class="stat-value">${fmt(avgLikes)}</div>
      <div class="stat-sub">Based on ${posts.length} tracked posts</div>
    </div>
  `;
}

// ── Calendar renderer ─────────────────────────────────────
function renderCalendar() {
  const container = document.getElementById('calendar-strip');
  if (!container) return;
  const days = [
    { day:'Mon', type:'Reel',     cls:'reel',    time:'7:00 PM' },
    { day:'Tue', type:'Carousel', cls:'carousel',time:'7:00 PM' },
    { day:'Wed', type:'Reel',     cls:'reel',    time:'7:00 PM' },
    { day:'Thu', type:'Story',    cls:'story',   time:'2:00 PM' },
    { day:'Fri', type:'Reel',     cls:'reel',    time:'7:00 PM' },
    { day:'Sat', type:'Carousel', cls:'carousel',time:'6:00 PM' },
    { day:'Sun', type:'REST DAY', cls:'rest',    time:'Off'     }
  ];
  const todayIndex = (new Date().getDay() + 6) % 7;
  container.innerHTML = days.map((d, i) => `
    <div class="day-card ${i === todayIndex ? 'today' : ''}">
      <div class="day-name">${d.day}${i === todayIndex ? ' (Today)' : ''}</div>
      <div class="post-type-badge ${d.cls}">${d.type}</div>
      <div class="time-slot">⏰ ${d.time}</div>
    </div>
  `).join('');
}

// ── Competitor table renderer ─────────────────────────────
function renderCompetitors(data) {
  const tbody = document.getElementById('competitor-tbody');
  if (!tbody) return;

  const mine  = data.your_account || {};
  const comps = data.competitors  || {};

  // Support both array format (new fetch_data.py) and object format (old fetch_instagram_data.js)
  const rows = [];

  // Add your account first
  rows.push({
    isUser:      true,
    handle:      'garvit.irl',
    followers:   mine.followers || 5845,
    avgLikes:    mine.stats?.avg_likes || mine.avg_likes || 0,
    avgComments: mine.stats?.avg_comments || mine.avg_comments || 0,
    topLikes:    mine.stats?.top_post?.likes || 0
  });

  // Competitors can be an array or object
  const compList = Array.isArray(comps) ? comps : Object.entries(comps).map(([h, c]) => ({ username: h, ...c }));
  compList.forEach(c => {
    rows.push({
      isUser:      false,
      handle:      c.username || c.handle || '?',
      followers:   c.followers || 0,
      avgLikes:    c.stats?.avg_likes || c.avg_likes || 0,
      avgComments: c.stats?.avg_comments || c.avg_comments || 0,
      topLikes:    c.stats?.top_post?.likes || c.top_post_likes || 0
    });
  });

  rows.sort((a, b) => b.avgLikes - a.avgLikes);

  tbody.innerHTML = rows.map(r => `
    <tr class="${r.isUser ? 'user-row' : ''}">
      <td class="handle-cell">
        ${r.isUser ? '⭐' : '👤'} <b>@${r.handle}</b>
        ${r.isUser ? '<span class="status-indicator">YOUR ACCOUNT</span>' : ''}
      </td>
      <td>${fmt(r.followers)}</td>
      <td><b>${fmt(r.avgLikes)}</b></td>
      <td>${fmt(r.avgComments)}</td>
      <td>${fmt(r.topLikes)}</td>
    </tr>
  `).join('');
}

// ── Agent previews renderer ───────────────────────────────
function renderAgentPreviews(outputs) {
  ['ideator', 'hook_script', 'planner', 'analyst', 'dm_manager'].forEach(key => {
    const el = document.getElementById('preview-' + key);
    if (!el) return;
    const text = outputs[key];
    if (text) {
      el.textContent = text.slice(0, 240) + (text.length > 240 ? '…' : '');
    } else {
      el.textContent = 'No output yet — run: node scripts/run_agents.js';
    }
  });
}

// ── Update timestamp ──────────────────────────────────────
function setTimestamp(fetchedAt) {
  const el = document.getElementById('data-ts');
  if (!el) return;
  if (fetchedAt) {
    const dt = new Date(fetchedAt);
    el.innerText = `Updated ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    el.innerText = 'Live Dataset Active';
  }
}

// ── Main load ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    // Fetch both files in parallel
    const [dataRes, agentsRes] = await Promise.all([
      fetch(DATA_FILE   + '?t=' + Date.now()).catch(() => null),
      fetch(AGENTS_FILE + '?t=' + Date.now()).catch(() => null)
    ]);

    let data       = {};
    let hasAgents  = false;

    if (dataRes && dataRes.ok) {
      data = await dataRes.json();
      setTimestamp(data.fetched_at || data._fetched_at);
      renderStatsBar(data, false);
      renderCompetitors(data);
    }

    if (agentsRes && agentsRes.ok) {
      const agentsFile = await agentsRes.json();
      // Support: { agents: {...} }  OR flat { ideator: "...", ... }
      agentOutputs = agentsFile.agents || agentsFile;
      hasAgents = Object.keys(agentOutputs).some(k => agentOutputs[k]);
      renderAgentPreviews(agentOutputs);
      // Re-render stats bar now that we know agent status
      renderStatsBar(data, hasAgents);
    }

    renderCalendar();

  } catch (err) {
    console.error('Dashboard load error:', err);
    const ts = document.getElementById('data-ts');
    if (ts) ts.innerText = 'Error loading data';
  }
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDashboard);

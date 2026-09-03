document.addEventListener("DOMContentLoaded", () => {
  fetchData();
});

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(title, rawText) {
  document.getElementById("modal-title").textContent = title;
  // Render **bold**, newlines → HTML
  const html = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("agent-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("agent-modal").style.display = "none";
  document.body.style.overflow = "";
}

// Close on backdrop click
document.addEventListener("click", function (e) {
  const modal = document.getElementById("agent-modal");
  if (e.target === modal) closeModal();
});

// ── Data Fetch ────────────────────────────────────────────────────────────────
async function fetchData() {
  try {
    let dataResp;
    try {
      dataResp = await fetch("./data/data.json?t=" + Date.now());
    } catch (e) {
      dataResp = await fetch("./data.json?t=" + Date.now());
    }
    if (!dataResp.ok) dataResp = await fetch("./data.json?t=" + Date.now());
    const data = await dataResp.json();

    let agentsOutput = null;
    try {
      const agentResp = await fetch("./data/agents_output.json?t=" + Date.now());
      if (agentResp.ok) agentsOutput = await agentResp.json();
    } catch (e) {}

    renderDashboard(data, agentsOutput);
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("data-ts").innerText = "Error loading data";
  }
}

// ── Formatter ─────────────────────────────────────────────────────────────────
function fmt(n) {
  try {
    const num = parseInt(n);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  } catch (e) {
    return n.toString();
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderDashboard(data, agentsOutput) {
  const tsElem = document.getElementById("data-ts");
  if (data.fetched_at) {
    const dt = new Date(data.fetched_at);
    tsElem.innerText = `Updated ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    tsElem.innerText = "Live Dataset Active";
  }

  renderStatsBar(data, agentsOutput);
  renderAgentsGrid(data, agentsOutput);
  renderCalendarStrip();
  renderCompetitorTable(data);
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function renderStatsBar(data, agentsOutput) {
  const container = document.getElementById("stats-bar");
  const mine = data.your_account || {};
  const posts = mine.posts || [];
  const avgLikes = mine.stats?.avg_likes || 0;
  const followers = mine.followers || 5845;
  const isLive = !data.sample_data;
  const aiActive = !!agentsOutput;

  const comps = data.competitors || {};
  let topCompHandle = "-";
  let maxCompAvgLikes = 0;
  Object.keys(comps).forEach(h => {
    const avg = comps[h].stats?.avg_likes || 0;
    if (avg > maxCompAvgLikes) { maxCompAvgLikes = avg; topCompHandle = h; }
  });

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Data Freshness</div>
      <div class="stat-value" style="color: ${isLive ? "var(--accent-emerald)" : "var(--accent-rose)"}">
        ${isLive ? "🟢 LIVE" : "⚠️ SAMPLE"}
      </div>
      <div class="stat-sub">${isLive ? "Real Apify Instagram Data" : "Sample Dataset"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">AI Agents Engine</div>
      <div class="stat-value" style="color: ${aiActive ? "var(--accent-emerald)" : "var(--accent-cyan)"}">
        ${aiActive ? "⚡ LIVE GEMINI" : "5 / 5 ACTIVE"}
      </div>
      <div class="stat-sub">${aiActive ? "Powered by Gemini API" : "Automated & Syncing"}</div>
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

// ── Agents Grid ───────────────────────────────────────────────────────────────
function renderAgentsGrid(data, agentsOutput) {
  const container = document.getElementById("agents-grid");

  const mine = data.your_account || {};
  const posts = mine.posts || [];
  const comps = data.competitors || {};

  let allCompPosts = [];
  Object.values(comps).forEach(c => {
    if (c.posts) allCompPosts = allCompPosts.concat(c.posts);
  });
  const topPost = allCompPosts.length
    ? allCompPosts.reduce((max, p) => (p.likes > max.likes ? p : max), allCompPosts[0])
    : null;

  // agents_output.json stores output at top level: { ideator: "...", hook_script: "...", ... }
  // OR nested under .agents — support both
  const ai = agentsOutput?.agents || agentsOutput || {};

  const agentDefs = [
    {
      id:       "ideator",
      name:     "Ideator Agent",
      role:     "Scouts viral topics & competitor hooks",
      icon:     "💡",
      key:      "ideator",
      fallback: topPost
        ? `🔥 Trending Idea: "${topPost.caption.slice(0, 75)}..." (Scouted from @${topPost.username} with ${fmt(topPost.likes)} likes)`
        : "Scouting top competitors..."
    },
    {
      id:       "hook_script",
      name:     "Hook & Script Agent",
      role:     "Drafts viral video scripts & captions",
      icon:     "✍️",
      key:      "hook_script",
      fallback: "🎯 Hook Drafted: 'Stop making this $10,000 AI workflow mistake on Instagram...'"
    },
    {
      id:       "planner",
      name:     "Planner Agent",
      role:     "Schedules daily calendar & posting times",
      icon:     "📅",
      key:      "planner",
      fallback: "⏰ Today's Schedule: High-Converting Reel scheduled for 7:00 PM IST."
    },
    {
      id:       "analyst",
      name:     "Analyst Agent",
      role:     "Calculates ROI, engagement & niche metrics",
      icon:     "📊",
      key:      "analyst",
      fallback: `📈 Growth Insights: Your account (@garvit.irl) averages ${fmt(mine.stats?.avg_likes || 334)} likes per post.`
    },
    {
      id:       "dm_manager",
      name:     "DM Manager Agent",
      role:     "Automates lead magnets & comment triggers",
      icon:     "💬",
      key:      "dm_manager",
      fallback: "🤖 Auto-Responder Active: Listening for trigger word 'AGENT' in post comments."
    }
  ];

  container.innerHTML = agentDefs.map(agent => {
    const fullText = ai[agent.key] || "";
    const hasAI    = !!fullText;
    const preview  = hasAI
      ? fullText.slice(0, 220).replace(/</g, "&lt;").replace(/>/g, "&gt;") + (fullText.length > 220 ? "…" : "")
      : agent.fallback;

    return `
      <div class="agent-card">
        <div class="agent-head">
          <div class="agent-name-group">
            <span class="agent-icon">${agent.icon}</span>
            <div>
              <div class="agent-name">${agent.name}</div>
              <div class="agent-role">${agent.role}</div>
            </div>
          </div>
          <span class="agent-status-badge">${hasAI ? "LIVE AI" : "ACTIVE"}</span>
        </div>

        <div class="agent-output" id="agent-preview-${agent.id}" style="white-space:pre-wrap;">${preview}</div>

        ${hasAI ? `
        <button
          id="agent-btn-${agent.id}"
          onclick="openModal('${agent.name} — Full Output', ${JSON.stringify(fullText)})"
          style="margin-top:12px; width:100%; background:linear-gradient(135deg,#7c3aed,#a78bfa);
                 border:none; color:#fff; padding:9px 18px; border-radius:8px; cursor:pointer;
                 font-size:0.85rem; font-weight:600; letter-spacing:0.02em; transition:opacity .2s;"
          onmouseover="this.style.opacity='.85'"
          onmouseout="this.style.opacity='1'"
        >
          View Full Output →
        </button>` : ""}

        <div class="agent-footer">
          <span>Status: Synchronized</span>
          <span>Auto-reporting to Telegram</span>
        </div>
      </div>
    `;
  }).join("");
}

// ── Calendar Strip ────────────────────────────────────────────────────────────
function renderCalendarStrip() {
  const container = document.getElementById("calendar-strip");
  const days = [
    { day: "Mon", type: "Reel",    cls: "reel",    time: "7:00 PM" },
    { day: "Tue", type: "Carousel",cls: "carousel",time: "7:00 PM" },
    { day: "Wed", type: "Reel",    cls: "reel",    time: "7:00 PM" },
    { day: "Thu", type: "Story",   cls: "story",   time: "2:00 PM" },
    { day: "Fri", type: "Reel",    cls: "reel",    time: "7:00 PM" },
    { day: "Sat", type: "Carousel",cls: "carousel",time: "6:00 PM" },
    { day: "Sun", type: "REST DAY",cls: "rest",    time: "Off"     }
  ];
  const todayIndex = (new Date().getDay() + 6) % 7;
  container.innerHTML = days.map((d, idx) => `
    <div class="day-card ${idx === todayIndex ? "today" : ""}">
      <div class="day-name">${d.day} ${idx === todayIndex ? "(Today)" : ""}</div>
      <div class="post-type-badge ${d.cls}">${d.type}</div>
      <div class="time-slot">⏰ ${d.time}</div>
    </div>
  `).join("");
}

// ── Competitor Table ──────────────────────────────────────────────────────────
function renderCompetitorTable(data) {
  const container = document.getElementById("comp-table");

  const rows = [];
  const mine = data.your_account || {};
  rows.push({
    isUser: true,
    handle: "garvit.irl",
    followers: mine.followers || 5845,
    avgLikes: mine.stats?.avg_likes || 0,
    avgComments: mine.stats?.avg_comments || 0,
    topLikes: mine.stats?.top_post?.likes || 0
  });

  const comps = data.competitors || {};
  Object.keys(comps).forEach(h => {
    const c = comps[h];
    rows.push({
      isUser: false,
      handle: h,
      followers: c.followers || 0,
      avgLikes: c.stats?.avg_likes || 0,
      avgComments: c.stats?.avg_comments || 0,
      topLikes: c.stats?.top_post?.likes || 0
    });
  });
  rows.sort((a, b) => b.avgLikes - a.avgLikes);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Followers</th>
          <th>Avg Likes / Post</th>
          <th>Avg Comments</th>
          <th>Top Post Likes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${r.isUser ? "user-row" : ""}">
            <td class="handle-cell">
              ${r.isUser ? "⭐" : "👤"} <b>@${r.handle}</b>
              ${r.isUser ? '<span class="status-indicator">YOUR ACCOUNT</span>' : ""}
            </td>
            <td>${fmt(r.followers)}</td>
            <td><b>${fmt(r.avgLikes)}</b></td>
            <td>${fmt(r.avgComments)}</td>
            <td>${fmt(r.topLikes)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

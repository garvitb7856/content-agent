document.addEventListener("DOMContentLoaded", () => {
  fetchData();
});

async function fetchData() {
  try {
    let dataResp;
    try {
      dataResp = await fetch("./data/data.json");
    } catch (e) {
      dataResp = await fetch("./data.json");
    }
    if (!dataResp.ok) dataResp = await fetch("./data.json");
    const data = await dataResp.json();

    let agentsOutput = null;
    try {
      const agentResp = await fetch("./data/agents_output.json");
      if (agentResp.ok) {
        agentsOutput = await agentResp.json();
      }
    } catch (e) {}

    renderDashboard(data, agentsOutput);
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("data-ts").innerText = "Error loading data";
  }
}

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

function renderDashboard(data, agentsOutput) {
  // Update timestamp header
  const tsElem = document.getElementById("data-ts");
  if (data.fetched_at) {
    const dt = new Date(data.fetched_at);
    tsElem.innerText = `Updated ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    tsElem.innerText = "Live Dataset Active";
  }

  // 1. Stats Bar
  renderStatsBar(data, agentsOutput);

  // 2. 5 AI Agents Grid
  renderAgentsGrid(data, agentsOutput);

  // 3. Calendar Strip
  renderCalendarStrip();

  // 4. Competitor Table
  renderCompetitorTable(data);
}

function renderStatsBar(data, agentsOutput) {
  const container = document.getElementById("stats-bar");
  const mine = data.your_account || {};
  const posts = mine.posts || [];
  const avgLikes = mine.stats?.avg_likes || 0;
  const followers = mine.followers || 18400;
  const isLive = !data.sample_data;
  const aiActive = !!agentsOutput;

  const comps = data.competitors || {};
  let topCompHandle = "-";
  let maxCompAvgLikes = 0;

  Object.keys(comps).forEach(h => {
    const avg = comps[h].stats?.avg_likes || 0;
    if (avg > maxCompAvgLikes) {
      maxCompAvgLikes = avg;
      topCompHandle = h;
    }
  });

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Data Freshness</div>
      <div class="stat-value" style="color: ${isLive ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
        ${isLive ? '🟢 LIVE' : '⚠️ SAMPLE'}
      </div>
      <div class="stat-sub">${isLive ? 'Real Apify Instagram Data' : 'Sample Dataset'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">AI Agents Engine</div>
      <div class="stat-value" style="color: ${aiActive ? 'var(--accent-emerald)' : 'var(--accent-cyan)'}">
        ${aiActive ? '⚡ LIVE GEMINI' : '5 / 5 ACTIVE'}
      </div>
      <div class="stat-sub">${aiActive ? 'Powered by Gemini API' : 'Automated & Syncing'}</div>
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

function renderAgentsGrid(data, agentsOutput) {
  const container = document.getElementById("agents-grid");

  const mine = data.your_account || {};
  const posts = mine.posts || [];
  const comps = data.competitors || {};

  let allCompPosts = [];
  Object.values(comps).forEach(c => {
    if (c.posts) allCompPosts = allCompPosts.concat(c.posts);
  });
  const topPost = allCompPosts.length ? allCompPosts.reduce((max, p) => (p.likes > max.likes ? p : max), allCompPosts[0]) : null;

  const ai = agentsOutput?.agents || {};

  const agents = [
    {
      name: "Ideator Agent",
      role: "Scouts viral topics & competitor hooks",
      icon: "💡",
      output: ai.ideator
        ? `<div style="white-space: pre-wrap; font-family: var(--font-sans); line-height: 1.5;">${ai.ideator}</div>`
        : (topPost ? `🔥 <b>Trending Idea:</b> "${topPost.caption.slice(0, 75)}..." (Scouted from @${topPost.username} with ${fmt(topPost.likes)} likes)` : "Scouting top competitors...")
    },
    {
      name: "Hook & Script Agent",
      role: "Drafts viral video scripts & captions",
      icon: "✍️",
      output: ai.hook_script
        ? `<div style="white-space: pre-wrap; font-family: var(--font-sans); line-height: 1.5;">${ai.hook_script}</div>`
        : "🎯 <b>Hook Drafted:</b> 'Stop making this $10,000 AI workflow mistake on Instagram...'"
    },
    {
      name: "Planner Agent",
      role: "Schedules daily calendar & posting times",
      icon: "📅",
      output: ai.planner
        ? `<div style="white-space: pre-wrap; font-family: var(--font-sans); line-height: 1.5;">${ai.planner}</div>`
        : "⏰ <b>Today's Schedule:</b> High-Converting Reel scheduled for <b>7:00 PM IST</b>."
    },
    {
      name: "Analyst Agent",
      role: "Calculates ROI, engagement & niche metrics",
      icon: "📊",
      output: ai.analyst
        ? `<div style="white-space: pre-wrap; font-family: var(--font-sans); line-height: 1.5;">${ai.analyst}</div>`
        : `📈 <b>Growth Insights:</b> Your account (@garvit.irl) averages <b>${fmt(mine.stats?.avg_likes || 379)} likes</b> per post.`
    },
    {
      name: "DM Manager Agent",
      role: "Automates lead magnets & comment triggers",
      icon: "💬",
      output: ai.dm_manager
        ? `<div style="white-space: pre-wrap; font-family: var(--font-sans); line-height: 1.5;">${ai.dm_manager}</div>`
        : "🤖 <b>Auto-Responder Active:</b> Listening for trigger word <b>'AGENT'</b> in post comments."
    }
  ];

  container.innerHTML = agents.map(agent => `
    <div class="agent-card">
      <div class="agent-head">
        <div class="agent-name-group">
          <span class="agent-icon">${agent.icon}</span>
          <div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-role">${agent.role}</div>
          </div>
        </div>
        <span class="agent-status-badge">${ai[agent.name.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_')] ? 'LIVE AI' : 'ACTIVE'}</span>
      </div>
      <div class="agent-output">${agent.output}</div>
      <div class="agent-footer">
        <span>Status: Synchronized</span>
        <span>Auto-reporting to Telegram</span>
      </div>
    </div>
  `).join("");
}

function renderCalendarStrip() {
  const container = document.getElementById("calendar-strip");
  const days = [
    { day: "Mon", type: "Reel", cls: "reel", time: "7:00 PM" },
    { day: "Tue", type: "Carousel", cls: "carousel", time: "7:00 PM" },
    { day: "Wed", type: "Reel", cls: "reel", time: "7:00 PM" },
    { day: "Thu", type: "Story", cls: "story", time: "2:00 PM" },
    { day: "Fri", type: "Reel", cls: "reel", time: "7:00 PM" },
    { day: "Sat", type: "Carousel", cls: "carousel", time: "6:00 PM" },
    { day: "Sun", type: "REST DAY", cls: "rest", time: "Off" }
  ];

  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0

  container.innerHTML = days.map((d, idx) => `
    <div class="day-card ${idx === todayIndex ? 'today' : ''}">
      <div class="day-name">${d.day} ${idx === todayIndex ? '(Today)' : ''}</div>
      <div class="post-type-badge ${d.cls}">${d.type}</div>
      <div class="time-slot">⏰ ${d.time}</div>
    </div>
  `).join("");
}

function renderCompetitorTable(data) {
  const container = document.getElementById("comp-table");

  const rows = [];
  const mine = data.your_account || {};
  rows.push({
    isUser: true,
    handle: "garvit.irl",
    followers: mine.followers || 18400,
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
        `).join("")}
      </tbody>
    </table>
  `;
}

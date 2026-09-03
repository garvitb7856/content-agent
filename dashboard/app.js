let DATA = null;
let AI = null;

function openModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').style.display = 'flex';
}
document.getElementById('modal-close').onclick = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};
document.getElementById('modal-overlay').onclick = function(e) {
  if (e.target === this) this.style.display = 'none';
};

async function loadData() {
  try {
    const [d, a] = await Promise.all([
      fetch('data/data.json').then(r => r.ok ? r.json() : null),
      fetch('data/agents_output.json').then(r => r.ok ? r.json() : null),
    ]);
    DATA = d;
    AI = a;
  } catch(e) { console.warn('Load error:', e); }
  render();
}

const fmt = n => { try { n=parseInt(n); return n>=1000?(n/1000).toFixed(1)+'k':String(n); } catch{return '—';} };
const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
const pre = s => s ? s.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>') : '—';

function renderStatsBar() {
  const mine = DATA?.your_account;
  const posts = mine?.posts || [];
  const comps = DATA?.competitors || {};
  const allCP = Object.values(comps).flatMap(c => c.posts || []);
  const compAvg = avg(allCP.map(p => p.likes));
  const aiTs = AI?.generated_at ? new Date(AI.generated_at).toLocaleTimeString() : null;
  const items = [
    { label:'Your Followers', value: fmt(mine?.followers||5845), sub:'@garvit.irl' },
    { label:'Avg Likes / Post', value: fmt(avg(posts.map(p=>p.likes))), sub:'Comp avg: '+fmt(compAvg) },
    { label:'Posts Analysed', value: posts.length||0, sub:'last 20' },
    { label:'Competitors', value: Object.keys(comps).length, sub:'tracked' },
    { label:'Top Post', value: posts.length?fmt(Math.max(...posts.map(p=>p.likes))):'—', sub:'your best' },
    { label:'AI Agents', value: aiTs?'LIVE':'SAMPLE', sub: aiTs?'Updated '+aiTs:'Run run_agents.py' },
  ];
  document.getElementById('stats-bar').innerHTML = items.map(i=>'<div class="stat-card"><div class="stat-label">'+i.label+'</div><div class="stat-value">'+i.value+'</div><div class="stat-sub">'+i.sub+'</div></div>').join('');
}

const AGENTS = [
  { id:'ideator', icon:'💡', color:'#f59e0b', name:'Ideator Agent', role:'Scouts viral topics & competitor hooks', key:'ideator', tags:['trend-scan','competitor-intel','idea-gen'] },
  { id:'hook', icon:'🎣', color:'#ec4899', name:'Hook & Script Agent', role:'Drafts viral video scripts & captions', key:'hook_script', tags:['hook-writing','scripting','copywriting'] },
  { id:'planner', icon:'📅', color:'#06b6d4', name:'Planner Agent', role:'Schedules daily calendar & posting times', key:'planner', tags:['scheduling','calendar','posting-times'] },
  { id:'analyst', icon:'📊', color:'#10b981', name:'Analyst Agent', role:'Calculates ROI, engagement & niche metrics', key:'analyst', tags:['performance','benchmarking','insights'] },
  { id:'dm', icon:'💬', color:'#7c3aed', name:'DM Manager Agent', role:'Automates lead magnets & comment triggers', key:'dm_manager', tags:['dm-drafting','community','automation'] },
];

function renderAgents() {
  document.getElementById('agents-grid').innerHTML = AGENTS.map(a => {
    const hasAI = !!(AI?.agents?.[a.key]);
    const output = hasAI ? pre(AI.agents[a.key]) : 'No AI output yet. Run run_agents.py on your PC.';
    const preview = output.split('<br>').slice(0,3).join('<br>');
    const safeOutput = output.replace(/\\/g,'\\\\').replace(/`/g,"'").replace(/"/g,'&quot;');
    return '<div class="agent-card" style="border-color:'+a.color+'44">'
      +'<div class="agent-header">'
      +'<div class="agent-icon" style="background:'+a.color+'22;color:'+a.color+'">'+a.icon+'</div>'
      +'<div><div class="agent-name">'+a.name+'</div><div class="agent-role">'+a.role+'</div></div>'
      +'<span class="agent-status '+(hasAI?'status-active':'status-idle')+'">'+(hasAI?'LIVE AI':'IDLE')+'</span>'
      +'</div>'
      +'<div class="agent-body">'
      +'<div class="agent-output">'+preview+'</div>'
      +'<button class="view-btn" onclick="openModal(\''+a.name+'\',\''+safeOutput+'\')">View Full Output →</button>'
      +'<div class="agent-meta"><span>'+a.tags.map(t=>'<span class="tag">'+t+'</span>').join('')+'</span>'
      +'<span style="font-size:0.7rem;color:var(--muted)">'+(AI?.generated_at?'AI: '+new Date(AI.generated_at).toLocaleTimeString():'Static')+'</span></div>'
      +'</div></div>';
  }).join('');
}

function renderCompetitorTable() {
  const mine = DATA?.your_account;
  const myAvg = avg((mine?.posts||[]).map(p=>p.likes));
  const comps = DATA?.competitors||{};
  const rows = [
    {h:'garvit.irl', followers:mine?.followers||5845, avg:myAvg, posts:mine?.posts?.length||0, isYou:true},
    ...Object.entries(comps).map(([h,d])=>({h, followers:d.followers||0, avg:Math.round(d.stats?.avg_likes||0), posts:d.posts?.length||0, isYou:false})),
  ].sort((a,b)=>b.avg-a.avg);
  const maxAvg = Math.max(...rows.map(r=>r.avg),1);
  document.getElementById('comp-table').innerHTML = '<table><thead><tr><th>Account</th><th>Followers</th><th>Avg Likes</th><th>Posts</th></tr></thead><tbody>'
    +rows.map(r=>'<tr'+(r.isYou?' class="you-row"':'')+'><td>@'+r.h+(r.isYou?' ★':'')+'</td><td>'+fmt(r.followers)+'</td><td><div class="bar-cell">'+fmt(r.avg)+'<div class="bar"><div class="bar-fill" style="width:'+Math.round((r.avg/maxAvg)*100)+'%"></div></div></div></td><td>'+r.posts+'</td></tr>').join('')
    +'</tbody></table>';
}

function renderCalendar() {
  const today = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const types = [{l:'Reel',c:'type-reel'},{l:'Carousel',c:'type-image'},{l:'Reel',c:'type-reel'},{l:'Story',c:'type-image'},{l:'Reel',c:'type-reel'},{l:'Carousel',c:'type-image'},{l:'Rest',c:''}];
  let s = '';
  for(let i=0;i<7;i++){
    const d=new Date(today); d.setDate(today.getDate()-today.getDay()+i);
    const isToday=d.toDateString()===today.toDateString();
    const t=types[i];
    s+='<div class="cal-day'+(isToday?' today':'')+'"><div class="day-label">'+days[i]+'</div><div class="day-num">'+d.getDate()+'</div>'+(t.l!=='Rest'?'<span class="cal-post-type '+t.c+'">'+t.l+'</span>':'<span style="color:var(--muted);font-size:0.7rem">—</span>')+'</div>';
  }
  document.getElementById('calendar-strip').innerHTML = s;
}

function renderTimestamp() {
  const ts = DATA?.fetched_at ? new Date(DATA.fetched_at).toLocaleString() : new Date().toLocaleString();
  document.getElementById('data-ts').textContent = 'Data: '+ts+(DATA?.sample_data?' (SAMPLE)':' (LIVE)');
}

function render() { renderStatsBar(); renderAgents(); renderCompetitorTable(); renderCalendar(); renderTimestamp(); }
loadData();
setInterval(loadData, 60000);

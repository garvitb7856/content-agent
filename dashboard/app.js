var DATA=null,AI=null,FULL={};
var AGENTS=[
  {key:"ideator",icon:"💡",color:"#f59e0b",name:"Ideator Agent",role:"Scouts viral topics and competitor hooks"},
  {key:"hook_script",icon:"🎣",color:"#ec4899",name:"Hook and Script Agent",role:"Drafts viral video scripts and captions"},
  {key:"planner",icon:"📅",color:"#06b6d4",name:"Planner Agent",role:"Schedules daily calendar and posting times"},
  {key:"analyst",icon:"📊",color:"#10b981",name:"Analyst Agent",role:"Calculates ROI and engagement metrics"},
  {key:"dm_manager",icon:"💬",color:"#7c3aed",name:"DM Manager Agent",role:"Automates lead magnets and comment triggers"}
];
function openModal(key){
  var a=AGENTS.find(function(x){return x.key===key;});
  if(!a)return;
  document.getElementById("modal-title").textContent=a.name;
  document.getElementById("modal-body").innerHTML=FULL[key]||"No output yet.";
  document.getElementById("modal-overlay").classList.add("open");
}
function closeModal(){document.getElementById("modal-overlay").classList.remove("open");}
document.getElementById("modal-overlay").onclick=function(e){if(e.target===this)closeModal();};
function fmt(n){try{n=parseInt(n);return n>=1000?(n/1000).toFixed(1)+"k":String(n);}catch(e){return "-";}}
function avg(arr){return arr.length?Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length):0;}
function pre(s){if(!s)return "-";return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>");}
async function loadData(){
  try{
    var r=await Promise.all([
      fetch("data/data.json").then(function(x){return x.ok?x.json():null;}).catch(function(){return null;}),
      fetch("data/agents_output.json").then(function(x){return x.ok?x.json():null;}).catch(function(){return null;})
    ]);
    DATA=r[0];AI=r[1];
  }catch(e){console.warn(e);}
  render();
}
function renderStatsBar(){
  var mine=(DATA&&DATA.your_account)||{},posts=mine.posts||{},comps=(DATA&&DATA.competitors)||{};
  var allCP=[];Object.values(comps).forEach(function(c){if(c.posts)allCP=allCP.concat(c.posts);});
  var aiTs=(AI&&AI.generated_at)?new Date(AI.generated_at).toLocaleTimeString():null;
  var topL=(posts.length)?Math.max.apply(null,posts.map(function(p){return p.likes;})):0;
  var items=[
    {label:"Your Followers",value:fmt(mine.followers||5845),sub:"@garvit.irl"},
    {label:"Avg Likes",value:fmt(avg(posts.map?posts.map(function(p){return p.likes;}):[])),sub:"Comp avg: "+fmt(avg(allCP.map(function(p){return p.likes;})))},
    {label:"Posts Analysed",value:(posts.length||0),sub:"last 20"},
    {label:"Competitors",value:Object.keys(comps).length,sub:"tracked"},
    {label:"Top Post",value:topL?fmt(topL):"-",sub:"your best"},
    {label:"AI Agents",value:aiTs?"LIVE":"SAMPLE",sub:aiTs?"Updated "+aiTs:"Run run_agents.py"}
  ];
  document.getElementById("stats-bar").innerHTML=items.map(function(i){return'<div class="stat-card"><div class="stat-label">'+i.label+'</div><div class="stat-value">'+i.value+'</div><div class="stat-sub">'+i.sub+'</div></div>';}).join("");
}
function renderAgents(){
  document.getElementById("agents-grid").innerHTML=AGENTS.map(function(a){
    var raw=(AI&&AI.agents&&AI.agents[a.key])?AI.agents[a.key]:(AI&&AI[a.key])?AI[a.key]:null;
    var hasAI=!!raw,full=hasAI?pre(raw):"No AI output yet. Run run_agents.py on your PC.";
    FULL[a.key]=full;
    var lines=full.split("<br>"),preview=lines.slice(0,4).join("<br>")+(lines.length>4?"...":"");
    var ts=(AI&&AI.generated_at)?"AI: "+new Date(AI.generated_at).toLocaleTimeString():"Static";
    return'<div class="agent-card" style="border-color:'+a.color+'44"><div class="agent-header"><div class="agent-icon" style="background:'+a.color+'22;color:'+a.color+'">'+a.icon+'</div><div><div class="agent-name">'+a.name+'</div><div class="agent-role">'+a.role+'</div></div><span class="agent-status '+(hasAI?"status-active":"status-idle")+'">'+(hasAI?"LIVE AI":"IDLE")+'</span></div><div class="agent-body"><div class="agent-output">'+preview+'</div><button class="view-btn" onclick="openModal(\''+a.key+'\')">View Full Output</button><div class="agent-meta"><span style="font-size:.7rem;color:var(--muted)">'+ts+'</span></div></div></div>';
  }).join("");
}
function renderCompetitorTable(){
  var mine=(DATA&&DATA.your_account)||{},comps=(DATA&&DATA.competitors)||{};
  var myAvg=avg((mine.posts||[]).map(function(p){return p.likes;}));
  var rows=[{h:"garvit.irl",followers:mine.followers||5845,avg:myAvg,posts:(mine.posts||[]).length,isYou:true}];
  Object.entries(comps).forEach(function(e){rows.push({h:e[0],followers:e[1].followers||0,avg:Math.round((e[1].stats&&e[1].stats.avg_likes)||0),posts:(e[1].posts||[]).length,isYou:false});});
  rows.sort(function(a,b){return b.avg-a.avg;});
  var mx=Math.max.apply(null,rows.map(function(r){return r.avg;}).concat([1]));
  document.getElementById("comp-table").innerHTML='<table><thead><tr><th>Account</th><th>Followers</th><th>Avg Likes</th><th>Posts</th></tr></thead><tbody>'+rows.map(function(r){return'<tr'+(r.isYou?' class="you-row"':'')+'><td>@'+r.h+(r.isYou?' ★':'')+'</td><td>'+fmt(r.followers)+'</td><td><div class="bar-cell">'+fmt(r.avg)+'<div class="bar"><div class="bar-fill" style="width:'+Math.round((r.avg/mx)*100)+'%"></div></div></div></td><td>'+r.posts+'</td></tr>';}).join('')+'</tbody></table>';
}
function renderCalendar(){
  var today=new Date(),days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var types=[{l:"Reel",c:"type-reel"},{l:"Carousel",c:"type-image"},{l:"Reel",c:"type-reel"},{l:"Story",c:"type-image"},{l:"Reel",c:"type-reel"},{l:"Carousel",c:"type-image"},{l:"Rest",c:""}];
  var s="";for(var i=0;i<7;i++){var d=new Date(today);d.setDate(today.getDate()-today.getDay()+i);var t=types[i];
  s+='<div class="cal-day'+(d.toDateString()===today.toDateString()?" today":"")+'"><div class="day-label">'+days[i]+'</div><div class="day-num">'+d.getDate()+'</div>'+(t.l!=="Rest"?'<span class="cal-post-type '+t.c+'">'+t.l+'</span>':'<span style="color:var(--muted);font-size:.7rem">-</span>')+'</div>';}
  document.getElementById("calendar-strip").innerHTML=s;
}
function renderTimestamp(){var ts=(DATA&&DATA.fetched_at)?new Date(DATA.fetched_at).toLocaleString():new Date().toLocaleString();document.getElementById("data-ts").textContent="Data: "+ts+((DATA&&DATA.sample_data)?" (SAMPLE)":" (LIVE)");}
function render(){renderStatsBar();renderAgents();renderCompetitorTable();renderCalendar();renderTimestamp();}
loadData();setInterval(loadData,60000);

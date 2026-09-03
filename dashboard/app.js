// ── Content Agent OS Dashboard App ───────────────────────────────────────────
const fmt = n => {
  if (!n) return '0';
  return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);
};

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#{4}\s(.+)$/gm,'<h4>$1</h4>')
    .replace(/^#{3}\s(.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2}\s(.+)$/gm,'<h2>$1</h2>')
    .replace(/^#{1}\s(.+)$/gm,'<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>')
    .replace(/^---+$/gm,'<hr>')
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/\n/g,'<br>');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('modal-overlay');

function openModal(title, text) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = '<p>' + renderMarkdown(text) + '</p>';
  document.getElementById('modal-body').scrollTop = 0;
  overlay.style.display = 'flex';
}

function closeModal() {
  overlay.style.display = 'none';
}

document.getElementById('modal-close').onclick = closeModal;
overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };

// ── Agent buttons ─────────────────────────────────────────────────────────────
let agentOutputs = {};

document.querySelectorAll('.view-btn').forEach(function(btn) {
  btn.onclick = function() {
    var key   = btn.getAttribute('data-agent');
    var title = btn.getAttribute('data-title');
    var text  = agentOutputs[key];
    if (!text || text.length < 10) {
      text = 'No output yet. Run: python scripts/run_agents.py on your PC.';
    }
    openModal(title, text);
  };
});

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  var t = '?v=' + Date.now();

  // Load agent outputs
  try {
    var ar = await fetch('data/agents_output.json' + t);
    if (ar.ok) {
      agentOutputs = await ar.json();
      ['ideator','hook_script','planner','analyst','dm_manager'].forEach(function(key) {
        var el = document.getElementById('preview-' + key);
        if (!el) return;
        var text = agentOutputs[key] || '';
        el.textContent = text.length > 0
          ? text.replace(/#{1,4}\s/g,'').replace(/\*\*/g,'').replace(/\*/g,'').slice(0,200) + '...'
          : 'No output yet.';
      });
      document.getElementById('agent-status').textContent = '⚡ LIVE GEMINI';
    }
  } catch(e) { console.error('Agents load error:', e); }

  // Load stats + competitors
  try {
    var dr = await fetch('data/data.json' + t);
    if (dr.ok) {
      var data = await dr.json();
      var acc  = data.your_account || {};
      if (acc.followers) document.getElementById('stat-followers').textContent = fmt(acc.followers);
      if (acc.avg_likes) document.getElementById('stat-likes').textContent    = fmt(acc.avg_likes);

      var comps = data.competitors || [];
      var tbody = document.getElementById('competitor-tbody');
      if (tbody && comps.length) {
        var rows = comps.map(function(c) {
          var eng = c.followers ? ((( c.avg_likes||0) / c.followers) * 100).toFixed(2) + '%' : '-';
          return '<tr><td>@' + c.username + '</td><td>' + fmt(c.followers||0) + '</td><td><strong>' + fmt(c.avg_likes||0) + '</strong></td><td>' + fmt(c.avg_comments||0) + '</td><td>' + fmt(c.top_post_likes||0) + '</td></tr>';
        });
        rows.push('<tr class="you-row"><td>⭐ @garvit.irl <span class="you-badge">YOU</span></td><td>' + fmt(acc.followers||0) + '</td><td><strong>' + fmt(acc.avg_likes||0) + '</strong></td><td>' + fmt(acc.avg_comments||0) + '</td><td>-</td></tr>');
        tbody.innerHTML = rows.join('');
      }
    }
  } catch(e) { console.error('Data load error:', e); }

  document.getElementById('stat-updated').textContent =
    new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

loadDashboard();

const https = require('https');

module.exports = async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: 'GITHUB_PAT not set' });

  const body = JSON.stringify({ ref: 'main' });
  const options = {
    hostname: 'api.github.com',
    path: '/repos/garvitb7856/content-agent/actions/workflows/daily-run.yml/dispatches',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'content-agent-cron',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  await new Promise((resolve) => {
    const ghReq = https.request(options, (r) => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => {
        if (r.statusCode === 204) {
          console.log('Triggered GitHub Actions at', new Date().toISOString());
          res.status(200).json({ ok: true, triggered: new Date().toISOString() });
        } else {
          console.error('GitHub API error:', r.statusCode, data);
          res.status(500).json({ error: data, status: r.statusCode });
        }
        resolve();
      });
    });
    ghReq.on('error', (e) => { res.status(500).json({ error: e.message }); resolve(); });
    ghReq.write(body);
    ghReq.end();
  });
};

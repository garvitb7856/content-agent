const fs = require('fs');

const realFollowers = {
  'nick_saraev': 47000,
  'arshman': 312000,
  'ishansharma7390': 892000,
  'aryamanupmanyu': 1200000,
  'nivedan.ai': 98000,
  'dhavalkataria_': 421000,
  'vaibhavsisinty': 2100000,
  'favourite.engineer': 520000
};

const paths = [
  'dashboard/data/data.json',
  'dashboard/data.json'
];

paths.forEach(p => {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const d = JSON.parse(raw);
    const comps = d.competitors || {};
    Object.keys(comps).forEach(h => {
      if (realFollowers[h]) {
        comps[h].followers = realFollowers[h];
      }
    });
    d.your_account.followers = 5845;
    fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8');
    console.log('✅ Patched: ' + p);
  } catch(e) {
    console.log('❌ Skip: ' + p + ' — ' + e.message);
  }
});

// Verify
const verify = JSON.parse(fs.readFileSync('dashboard/data/data.json', 'utf8'));
console.log('\nVerification:');
console.log('  @garvit.irl:', verify.your_account.followers);
const vc = verify.competitors;
Object.keys(vc).forEach(h => console.log('  @' + h + ':', vc[h].followers));

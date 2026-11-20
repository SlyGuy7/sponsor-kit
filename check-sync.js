// Checks that the copied survey files still match the live survey site.
// A kit link is a list of option positions, so if the survey's questions or options move
// and these copies do not, links from the survey are read wrong without any error.
// Usage: node check-sync.js   (needs internet; exits 1 if anything differs)
const fs = require('fs');
const path = require('path');

const LIVE = 'https://slyguy7.github.io/sponsor-survey/assets/';
const FILES = ['survey.json', 'readiness.json'];

(async () => {
  let bad = 0;
  for (const f of FILES) {
    const res = await fetch(LIVE + f, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${LIVE}${f}: HTTP ${res.status}`);
    const live = JSON.stringify(await res.json());
    const here = JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', f), 'utf8')));
    if (live === here) console.log(`ok       ${f}`);
    else { bad++; console.log(`DIFFERS  ${f}: copy ${LIVE}${f} into assets/ (see README)`); }
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('Could not reach the survey site: ' + e.message); process.exit(2); });

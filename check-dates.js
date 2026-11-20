// Reminds whoever maintains the kit to add next semester's dates.
// Warns when the last date in assets/readiness.json is 14 days away or less, and fails once every
// date has passed (the kit then shows no key dates at all). GitHub Actions runs this every Monday,
// and GitHub emails the repository owner when a scheduled run fails.
// Usage: node check-dates.js [YYYY-MM-DD]   (the optional date stands in for today, for testing)
const path = require('path');
const { dates } = require(path.join(__dirname, 'assets', 'readiness.json'));

const pad = n => String(n).padStart(2, '0');
const now = process.argv[2] ? new Date(process.argv[2] + 'T12:00:00') : new Date();
const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const last = dates.map(d => d.until).sort().pop();
const days = Math.round((new Date(last + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
const fix = 'Add next semester\'s dates to assets/readiness.json in the survey repository, then copy the file here (see README).';
const gh = !!process.env.GITHUB_ACTIONS;

if (days < 0) {
  console.log((gh ? '::error::' : '') + `Every key date has passed (the last was ${last}), so sponsors see none. ${fix}`);
  process.exit(1);
} else if (days <= 14) {
  console.log((gh ? '::warning::' : '') + `The last key date is ${last}, in ${days} day${days === 1 ? '' : 's'}. ${fix}`);
} else {
  console.log(`ok       key dates run until ${last} (${days} days away)`);
}

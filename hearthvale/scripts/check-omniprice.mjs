// Fetch every OmniPrice instrument and report its date range and latest value.
//   node scripts/check-omniprice.mjs [id ...]
import { INSTRUMENTS } from '../api/_omniprice/catalog.js';
import { fetchFeed } from '../api/_omniprice/sources.js';

const only = new Set(process.argv.slice(2));
const list = INSTRUMENTS.filter((i) => !only.size || only.has(i.id));
let failed = 0;
for (const inst of list) {
  try {
    const pts = await fetchFeed(inst.feed, process.env);
    const [first, last] = [pts[0], pts[pts.length - 1]];
    const ageDays = Math.round((Date.now() - Date.parse(last[0])) / 86400000);
    const stale = ageDays > ({ daily: 10, weekly: 21, monthly: 100, quarterly: 200 })[inst.freq];
    console.log(`${stale ? 'STALE' : 'ok   '} ${inst.id.padEnd(18)} ${String(pts.length).padStart(6)} pts  ${first[0]} → ${last[0]}  ${last[1]}`);
    if (stale) failed++;
  } catch (err) {
    failed++;
    console.log(`FAIL  ${inst.id.padEnd(18)} ${err.message}`);
  }
}
console.log(failed ? `\n${failed} problem(s)` : '\nAll sources OK');

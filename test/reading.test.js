const load = require('./load'); const ctx = load(['Astro.gs', 'Reading.gs']); const A = ctx.ASTRO, R = ctx.READING;
const now = Date.UTC(2026, 9, 27, 12, 0);
function words(r) { return R.toText(r).split(/\s+/).length; }
function bad(r) { const t = R.toText(r); return /undefined|NaN|null|\[object/.test(t); }
let fails = 0;
const cases = [
  { n: 'Full data', i: { year: 1973, month: 11, day: 20, hour: 8, minute: 15, timeKnown: true, lat: 52.37, lon: 4.9, tz: 'Europe/Amsterdam' } },
  { n: 'No time', i: { year: 1988, month: 2, day: 29, hour: 0, minute: 0, timeKnown: false, lat: null, lon: null, tz: 'Europe/London' } },
  { n: 'Time, no place', i: { year: 2001, month: 12, day: 31, hour: 23, minute: 59, timeKnown: true, lat: null, lon: null, tz: 'America/New_York' } },
  { n: 'Southern hemisphere', i: { year: 1965, month: 7, day: 4, hour: 4, minute: 30, timeKnown: true, lat: -33.87, lon: 151.2, tz: 'Australia/Sydney' } },
];
cases.forEach(c => {
  const ch = A.buildChart(c.i), ctxr = { firstName: 'Test', tz: c.i.tz };
  const f = R.free(ch, now, ctxr);
  console.log(`${c.n}: free=${words(f)} words, sections=${f.sections.length}`);
  if (bad(f)) { fails++; console.log('  BAD TEXT in free'); }
  ['daily', 'weekly', 'monthly', 'yearly'].forEach(k => {
    const g = R.guidance(k, ch, now, ctxr);
    const w = words(g); const b = bad(g);
    console.log(`  ${k}: "${g.title}" ${w} words ${b ? 'BAD' : ''}`); if (b || w < 60) fails++;
  });
  R.toHtml(f);
});
// every day of a year must work (no throw), including Moon phase searches
let t0 = Date.now();
const ch = A.buildChart(cases[0].i);
for (let d = 0; d < 400; d += 9) { ['daily', 'weekly', 'monthly'].forEach(k => R.guidance(k, ch, now + d * 86400000, { tz: 'Europe/Amsterdam' })); }
console.log('stress ok', Date.now() - t0, 'ms');
console.log('\n===== SAMPLE: free reading (full data) =====\n' + R.toText(R.free(A.buildChart(cases[0].i), now, { firstName: 'Chris', tz: 'Europe/Amsterdam' })));
console.log('===== SAMPLE: daily =====\n' + R.toText(R.guidance('daily', ch, now, { tz: 'Europe/Amsterdam' })));
console.log('===== SAMPLE: yearly =====\n' + R.toText(R.guidance('yearly', ch, now, { tz: 'Europe/Amsterdam' })));
process.exit(fails ? 1 : 0);

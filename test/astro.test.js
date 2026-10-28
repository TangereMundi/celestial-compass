const load = require('./load'); const assert = require('assert');
const ctx = load(['Astro.gs']); const A = ctx.ASTRO;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + '  ' + (detail || '')); } }
function near(name, got, want, tol) { check(name + ' (' + got.toFixed(3) + ' vs ' + want + ')', Math.abs(A.angDiff(got, want)) <= tol, 'tol ' + tol); }

console.log('J2000 (2000-01-01 12:00 UT) geocentric longitudes vs. published ephemeris');
const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const ref = { Sun: 280.37, Moon: 223.32, Mercury: 271.89, Venus: 241.57, Mars: 327.97, Jupiter: 25.25, Saturn: 40.40, Uranus: 314.81, Neptune: 303.19, Pluto: 251.46 };
Object.keys(ref).forEach(n => near(n, A.lonAt(n, j2000), ref[n], n === 'Moon' ? 0.35 : 0.2));

console.log('Eclipse / equinox / phases');
const ecl = Date.UTC(2024, 3, 8, 18, 17, 0);
near('Moon at 2024-04-08 total solar eclipse = Sun', A.lonAt('Moon', ecl), A.lonAt('Sun', ecl), 0.4);
near('Sun at 2025-03-20 09:01 UT equinox = 0 Aries', A.lonAt('Sun', Date.UTC(2025, 2, 20, 9, 1)), 0, 0.05);
const nm = A.nextPhase(Date.UTC(2025, 2, 20), 0), fm = A.nextPhase(Date.UTC(2025, 2, 1), 180);
check('New Moon found near 2025-03-29 10:58 UT: ' + new Date(nm).toISOString(), Math.abs(nm - Date.UTC(2025, 2, 29, 10, 58)) < 3 * 3600e3);
check('Full Moon found near 2025-03-14 06:55 UT: ' + new Date(fm).toISOString(), Math.abs(fm - Date.UTC(2025, 2, 14, 6, 55)) < 3 * 3600e3);

console.log('Retrogrades & ingresses');
const p1 = A.positions(Date.UTC(2025, 2, 25)), p2 = A.positions(Date.UTC(2025, 4, 1));
check('Mercury retrograde on 2025-03-25', p1.Mercury.retro === true);
check('Mercury direct on 2025-05-01', p2.Mercury.retro === false);
check('Saturn enters Aries by 2025-06-01', A.signInfo(A.lonAt('Saturn', Date.UTC(2025, 5, 1))).sign === 'Aries');
check('Pluto in Aquarius on 2025-01-15', A.signInfo(A.lonAt('Pluto', Date.UTC(2025, 0, 15))).sign === 'Aquarius');
check('Pluto in Scorpio on 1990-01-01', A.signInfo(A.lonAt('Pluto', Date.UTC(1990, 0, 1))).sign === 'Scorpio');
check('Pluto in Libra on 1975-06-01', A.signInfo(A.lonAt('Pluto', Date.UTC(1975, 5, 1))).sign === 'Libra');
check('Jupiter in Cancer on 2025-07-01', A.signInfo(A.lonAt('Jupiter', Date.UTC(2025, 6, 1))).sign === 'Cancer');
check('Jupiter in Gemini on 2024-07-01', A.signInfo(A.lonAt('Jupiter', Date.UTC(2024, 6, 1))).sign === 'Gemini');
check('Neptune in Pisces on 2020-01-01', A.signInfo(A.lonAt('Neptune', Date.UTC(2020, 0, 1))).sign === 'Pisces');
check('Uranus in Taurus on 2020-01-01', A.signInfo(A.lonAt('Uranus', Date.UTC(2020, 0, 1))).sign === 'Taurus');

console.log('Ascendant / MC geometric self-consistency (independent horizon test)');
const RAD = Math.PI / 180;
function ecl2eq(lon, eps) { const l = lon * RAD, e = eps * RAD; return { ra: A.rev(Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) / RAD), dec: Math.asin(Math.sin(e) * Math.sin(l)) / RAD }; }
[[52.37, 4.9, 1974, 6, 15, 14], [-33.87, 151.2, 1985, 1, 3, 3], [40.71, -74.0, 1990, 11, 30, 22], [64.1, -21.9, 2001, 7, 7, 7], [-23.5, -46.6, 1969, 12, 25, 18]].forEach(([lat, lon, y, mo, d, h]) => {
  const jd = A.jdFromMs(Date.UTC(y, mo - 1, d, h, 0, 0)), r = A.angles(jd, lat, lon);
  const eq = ecl2eq(r.asc, r.eps), H = A.rev(r.ramc - eq.ra);               // hour angle
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(eq.dec * RAD) + Math.cos(lat * RAD) * Math.cos(eq.dec * RAD) * Math.cos(H * RAD)) / RAD;
  check(`Asc on horizon & rising  lat ${lat} lon ${lon}: alt=${alt.toFixed(4)} H=${H.toFixed(1)}`, Math.abs(alt) < 0.01 && H > 180);
  const mq = ecl2eq(r.mc, r.eps);
  check(`MC on meridian  (RA diff ${A.angDiff(mq.ra, r.ramc).toFixed(4)})`, Math.abs(A.angDiff(mq.ra, r.ramc)) < 0.01);
});

console.log('Time zones');
const a74 = A.localToUtcMs(1974, 7, 15, 14, 30, 'Europe/Amsterdam');
check('Amsterdam 1974-07-15 14:30 -> 13:30 UTC (NL had no DST before 1977)', a74 === Date.UTC(1974, 6, 15, 13, 30));
const ams = A.localToUtcMs(1980, 7, 15, 14, 30, 'Europe/Amsterdam');
check('Amsterdam 1980-07-15 14:30 (CEST) -> 12:30 UTC', ams === Date.UTC(1980, 6, 15, 12, 30));
const win = A.localToUtcMs(1990, 1, 10, 9, 0, 'Europe/Amsterdam');
check('Amsterdam 1990-01-10 09:00 (CET) -> 08:00 UTC', win === Date.UTC(1990, 0, 10, 8, 0));
const ny = A.localToUtcMs(1985, 7, 4, 12, 0, 'America/New_York');
check('New York 1985-07-04 12:00 (EDT) -> 16:00 UTC', ny === Date.UTC(1985, 6, 4, 16, 0));
check('invalid tz rejected', A.isValidTz('Mars/Olympus') === false && A.isValidTz('Europe/London') === true);

console.log('Full chart');
const c = A.buildChart({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, timeKnown: true, lat: 52.37, lon: 4.9, tz: 'Europe/Amsterdam' });
console.log('  Sun', c.bodies.Sun.label, 'house', c.bodies.Sun.house, '| Moon', c.bodies.Moon.label, '| Asc', c.asc.label, '| MC', c.mc.label);
console.log('  top aspects:', c.aspects.slice(0, 3).map(a => `${a.a} ${a.type} ${a.b} (${a.orb.toFixed(1)}°)`).join('; '));
check('chart has asc + houses', c.houseKnown && c.asc && c.bodies.Sun.house >= 1 && c.bodies.Sun.house <= 12);
const c2 = A.buildChart({ year: 1990, month: 6, day: 15, hour: 0, minute: 0, timeKnown: false, lat: null, lon: null, tz: 'Europe/Amsterdam' });
check('no-time chart: no asc, solar houses, Sun is house 1', !c2.asc && c2.houseMode === 'solar' && c2.bodies.Sun.house === 1);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

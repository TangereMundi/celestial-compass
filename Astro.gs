/**
 * Astro.gs — self-contained astrology calculation engine.
 *
 * No external libraries and no network calls, so it runs inside Google Apps Script
 * (and Node, for testing). Positions use published Keplerian orbital elements with
 * the main perturbation terms (P. Schlyter's low-precision method; Pluto from the
 * JPL/Standish approximate elements). Accuracy is roughly 1-2 arcminutes for the
 * Sun and planets and a few arcminutes for the Moon: ample for signs, houses and
 * aspects. If you later want observatory-grade precision, swap positions() for
 * Swiss Ephemeris (note its AGPL / commercial licence) without touching the rest.
 *
 * Houses are Whole Sign (works at every latitude). Zodiac is tropical.
 */
var ASTRO = (function () {
  'use strict';

  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  var SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  var PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

  function rev(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function sind(x) { return Math.sin(x * RAD); }
  function cosd(x) { return Math.cos(x * RAD); }
  function tand(x) { return Math.tan(x * RAD); }
  function atan2d(y, x) { return Math.atan2(y, x) * DEG; }
  function angDiff(a, b) { var d = rev(a - b); return d > 180 ? d - 360 : d; } // a-b in (-180,180]

  function jdFromMs(ms) { return ms / 86400000 + 2440587.5; }
  function msFromJd(jd) { return (jd - 2440587.5) * 86400000; }

  // ---------- Time zones (birth local time -> UTC) ----------
  function tzOffsetMs(tz, utcMs) {
    var secs = Math.floor(utcMs / 1000) * 1000;
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      try {
        var z = Utilities.formatDate(new Date(secs), tz, 'Z'); // e.g. +0200
        var m = /^([+-])(\d{2})(\d{2})$/.exec(z);
        if (m) return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) * 60000;
      } catch (e) { /* fall through to Intl */ }
    }
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
    var p = {};
    dtf.formatToParts(new Date(secs)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - secs;
  }

  function localToUtcMs(y, mo, d, h, mi, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, 0);
    var off1 = tzOffsetMs(tz, guess);
    var utc = guess - off1;
    var off2 = tzOffsetMs(tz, utc);
    if (off2 !== off1) utc = guess - off2;
    return utc;
  }

  function isValidTz(tz) {
    try { tzOffsetMs(tz, Date.UTC(2000, 0, 1)); return typeof tz === 'string' && tz.length > 2; } catch (e) { return false; }
  }

  // ---------- Orbital mechanics ----------
  function solveKepler(Mdeg, e) {
    var M = rev(Mdeg) * RAD;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 40; k++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  }

  function orbit(el) {
    var E = solveKepler(el.M, el.e);
    var xv = el.a * (Math.cos(E) - el.e);
    var yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    return { v: atan2d(yv, xv), r: Math.sqrt(xv * xv + yv * yv) };
  }

  // d = days since 1999-12-31 00:00 UT
  function elements(name, d) {
    switch (name) {
      case 'Sun': return { N: 0, i: 0, w: 282.9404 + 4.70935E-5 * d, a: 1, e: 0.016709 - 1.151E-9 * d, M: 356.0470 + 0.9856002585 * d };
      case 'Moon': return { N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.054900, M: 115.3654 + 13.0649929509 * d };
      case 'Mercury': return { N: 48.3313 + 3.24587E-5 * d, i: 7.0047 + 5.00E-8 * d, w: 29.1241 + 1.01444E-5 * d, a: 0.387098, e: 0.205635 + 5.59E-10 * d, M: 168.6562 + 4.0923344368 * d };
      case 'Venus': return { N: 76.6799 + 2.46590E-5 * d, i: 3.3946 + 2.75E-8 * d, w: 54.8910 + 1.38374E-5 * d, a: 0.723330, e: 0.006773 - 1.302E-9 * d, M: 48.0052 + 1.6021302244 * d };
      case 'Mars': return { N: 49.5574 + 2.11081E-5 * d, i: 1.8497 - 1.78E-8 * d, w: 286.5016 + 2.92961E-5 * d, a: 1.523688, e: 0.093405 + 2.516E-9 * d, M: 18.6021 + 0.5240207766 * d };
      case 'Jupiter': return { N: 100.4542 + 2.76854E-5 * d, i: 1.3030 - 1.557E-7 * d, w: 273.8777 + 1.64505E-5 * d, a: 5.20256, e: 0.048498 + 4.469E-9 * d, M: 19.8950 + 0.0830853001 * d };
      case 'Saturn': return { N: 113.6634 + 2.38980E-5 * d, i: 2.4886 - 1.081E-7 * d, w: 339.3939 + 2.97661E-5 * d, a: 9.55475, e: 0.055546 - 9.499E-9 * d, M: 316.9670 + 0.0334442282 * d };
      case 'Uranus': return { N: 74.0005 + 1.3978E-5 * d, i: 0.7733 + 1.9E-8 * d, w: 96.6612 + 3.0565E-5 * d, a: 19.18171 - 1.55E-8 * d, e: 0.047318 + 7.45E-9 * d, M: 142.5905 + 0.011725806 * d };
      case 'Neptune': return { N: 131.7806 + 3.0173E-5 * d, i: 1.7700 - 2.55E-7 * d, w: 272.8461 - 6.027E-6 * d, a: 30.05826 + 3.313E-8 * d, e: 0.008606 + 2.15E-9 * d, M: 260.2471 + 0.005995147 * d };
    }
    throw new Error('Unknown body ' + name);
  }

  function sunXY(d) {
    var el = elements('Sun', d), o = orbit(el), lon = rev(o.v + el.w);
    return { lon: lon, r: o.r, x: o.r * cosd(lon), y: o.r * sind(lon) };
  }

  function helioRect(el, o) {
    var vw = o.v + el.w;
    return {
      x: o.r * (cosd(el.N) * cosd(vw) - sind(el.N) * sind(vw) * cosd(el.i)),
      y: o.r * (sind(el.N) * cosd(vw) + cosd(el.N) * sind(vw) * cosd(el.i)),
      z: o.r * sind(vw) * sind(el.i)
    };
  }

  function moonLonLat(d) {
    var el = elements('Moon', d), o = orbit(el), h = helioRect(el, o);
    var lon = atan2d(h.y, h.x), lat = atan2d(h.z, Math.sqrt(h.x * h.x + h.y * h.y));
    var sun = elements('Sun', d);
    var Ms = sun.M, Ls = sun.M + sun.w, Mm = el.M, Lm = el.M + el.w + el.N, D = Lm - Ls, F = Lm - el.N;
    lon += -1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * Mm - 2 * D)
      - 0.057 * sind(Mm - 2 * D + Ms) + 0.053 * sind(Mm + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms)
      - 0.035 * sind(D) - 0.031 * sind(Mm + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(Mm - 4 * D);
    lat += -0.173 * sind(F - 2 * D) - 0.055 * sind(Mm - F - 2 * D) - 0.046 * sind(Mm + F - 2 * D)
      + 0.033 * sind(F + 2 * D) + 0.017 * sind(2 * Mm + F);
    return { lon: rev(lon), lat: lat };
  }

  // Pluto: JPL/Standish approximate Keplerian elements (J2000 ecliptic), valid ~1800-2050.
  function plutoGeocentric(jd, d) {
    var T = (jd - 2451545.0) / 36525;
    var a = 39.48211675 - 0.00031596 * T, e = 0.24882730 + 0.00005170 * T, I = 17.14001206 + 0.00004818 * T;
    var L = 238.92903833 + 145.20780515 * T, peri = 224.06891629 - 0.04062942 * T, node = 110.30393684 - 0.01183482 * T;
    var o = orbit({ a: a, e: e, M: L - peri });
    var w = peri - node, vw = o.v + w;
    var x = o.r * (cosd(node) * cosd(vw) - sind(node) * sind(vw) * cosd(I));
    var y = o.r * (sind(node) * cosd(vw) + cosd(node) * sind(vw) * cosd(I));
    var z = o.r * sind(vw) * sind(I);
    var lon = atan2d(y, x) + 1.396971 * T; // precess J2000 -> equinox of date
    var rxy = Math.sqrt(x * x + y * y);
    var s = sunXY(d);
    var xg = rxy * cosd(lon) + s.x, yg = rxy * sind(lon) + s.y;
    return { lon: rev(atan2d(yg, xg)), lat: atan2d(z, Math.sqrt(xg * xg + yg * yg)) };
  }

  function bodyLonLat(name, ms) {
    var jd = jdFromMs(ms), d = jd - 2451543.5;
    if (name === 'Moon') return moonLonLat(d);
    if (name === 'Sun') { var s = sunXY(d); return { lon: s.lon, lat: 0 }; }
    if (name === 'Pluto') return plutoGeocentric(jd, d);
    if (name === 'Node') { var T = (jd - 2451545.0) / 36525; return { lon: rev(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T), lat: 0 }; }

    var el = elements(name, d), o = orbit(el), h = helioRect(el, o);
    var lon = atan2d(h.y, h.x), lat = atan2d(h.z, Math.sqrt(h.x * h.x + h.y * h.y));
    var Mj = elements('Jupiter', d).M, Ms = elements('Saturn', d).M, Mu = elements('Uranus', d).M;
    if (name === 'Jupiter') {
      lon += -0.332 * sind(2 * Mj - 5 * Ms - 67.6) - 0.056 * sind(2 * Mj - 2 * Ms + 21) + 0.042 * sind(3 * Mj - 5 * Ms + 21)
        - 0.036 * sind(Mj - 2 * Ms) - 0.022 * cosd(Mj - Ms) + 0.023 * sind(2 * Mj - 3 * Ms + 52) - 0.016 * sind(Mj - 5 * Ms - 69);
    } else if (name === 'Saturn') {
      lon += 0.812 * sind(2 * Mj - 5 * Ms - 67.6) - 0.229 * cosd(2 * Mj - 4 * Ms - 2) + 0.119 * sind(Mj - 2 * Ms - 3)
        + 0.046 * sind(2 * Mj - 6 * Ms - 69) + 0.014 * sind(Mj - 3 * Ms + 32);
      lat += -0.020 * cosd(2 * Mj - 4 * Ms - 2) + 0.018 * sind(2 * Mj - 6 * Ms - 49);
    } else if (name === 'Uranus') {
      lon += 0.040 * sind(Ms - 2 * Mu + 6) + 0.035 * sind(Ms - 3 * Mu + 33) - 0.015 * sind(Mj - Mu + 20);
    }
    var xh = o.r * cosd(lon) * cosd(lat), yh = o.r * sind(lon) * cosd(lat), zh = o.r * sind(lat);
    var sun = sunXY(d);
    var xg = xh + sun.x, yg = yh + sun.y;
    return { lon: rev(atan2d(yg, xg)), lat: atan2d(zh, Math.sqrt(xg * xg + yg * yg)) };
  }

  function lonAt(name, ms) { return bodyLonLat(name, ms).lon; }

  // ---------- Signs ----------
  function signIndex(lon) { return Math.floor(rev(lon) / 30) % 12; }
  function signInfo(lon) {
    lon = rev(lon);
    var idx = signIndex(lon), within = lon - idx * 30;
    var deg = Math.floor(within), min = Math.floor((within - deg) * 60);
    return { lon: lon, index: idx, sign: SIGNS[idx], deg: deg, min: min, within: within, label: deg + '°' + (min < 10 ? '0' : '') + min + '′ ' + SIGNS[idx] };
  }

  function positions(ms) {
    var out = {};
    PLANETS.concat(['Node']).forEach(function (n) {
      var p = bodyLonLat(n, ms);
      var speed = angDiff(lonAt(n, ms + 43200000), lonAt(n, ms - 43200000)); // deg/day
      out[n] = { lon: p.lon, lat: p.lat, speed: speed, retro: n !== 'Node' && n !== 'Sun' && n !== 'Moon' && speed < 0 };
    });
    return out;
  }

  // ---------- Angles & houses ----------
  function gmstDeg(jd) {
    var T = (jd - 2451545.0) / 36525;
    return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000);
  }
  function obliquity(jd) { var T = (jd - 2451545.0) / 36525; return 23.4392911 - 0.0130042 * T; }

  function angles(jd, lat, lon) {
    var eps = obliquity(jd), ramc = rev(gmstDeg(jd) + lon);
    var mc = rev(atan2d(sind(ramc), cosd(ramc) * cosd(eps)));
    var asc = rev(atan2d(cosd(ramc), -(sind(ramc) * cosd(eps) + tand(lat) * sind(eps))));
    return { asc: asc, mc: mc, ramc: ramc, eps: eps };
  }

  // ---------- Aspects ----------
  var ASPECTS = [
    { type: 'conjunction', angle: 0, orb: 8 },
    { type: 'sextile', angle: 60, orb: 4.5 },
    { type: 'square', angle: 90, orb: 7 },
    { type: 'trine', angle: 120, orb: 7 },
    { type: 'opposition', angle: 180, orb: 8 }
  ];
  var WEIGHT = { Sun: 10, Moon: 10, Asc: 9, MC: 7, Mercury: 6, Venus: 6, Mars: 6, Jupiter: 5, Saturn: 5, Uranus: 3, Neptune: 3, Pluto: 3, Node: 2 };
  var ASPECT_WEIGHT = { conjunction: 1.0, opposition: 0.95, square: 0.9, trine: 0.8, sextile: 0.6 };

  function aspectBetween(lonA, lonB, orbScale) {
    var sep = Math.abs(angDiff(lonA, lonB));
    for (var i = 0; i < ASPECTS.length; i++) {
      var a = ASPECTS[i], diff = Math.abs(sep - a.angle), lim = a.orb * (orbScale || 1);
      if (diff <= lim) return { type: a.type, angle: a.angle, orb: diff, limit: lim };
    }
    return null;
  }

  function natalAspects(points) {
    // points: {Name: lon}
    var names = Object.keys(points), out = [];
    for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
      var A = names[i], B = names[j];
      if (A === 'Node' || B === 'Node') continue;
      if ((A === 'Asc' && B === 'MC') || (A === 'MC' && B === 'Asc')) continue;
      var lum = (A === 'Sun' || A === 'Moon' || B === 'Sun' || B === 'Moon') ? 1.2 : 1;
      var asp = aspectBetween(points[A], points[B], lum);
      if (!asp) continue;
      var generational = ['Uranus', 'Neptune', 'Pluto'].indexOf(A) > -1 && ['Uranus', 'Neptune', 'Pluto'].indexOf(B) > -1;
      out.push({
        a: A, b: B, type: asp.type, orb: asp.orb,
        score: generational ? 0 : (WEIGHT[A] + WEIGHT[B]) * ASPECT_WEIGHT[asp.type] * (1 - asp.orb / asp.limit)
      });
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  // ---------- Chart ----------
  function buildChart(inp) {
    var timeKnown = !!inp.timeKnown;
    var hour = timeKnown ? inp.hour : 12, minute = timeKnown ? inp.minute : 0;
    var utcMs = localToUtcMs(inp.year, inp.month, inp.day, hour, minute, inp.tz);
    var pos = positions(utcMs);
    var haveLoc = typeof inp.lat === 'number' && typeof inp.lon === 'number' && isFinite(inp.lat) && isFinite(inp.lon);
    var houseKnown = timeKnown && haveLoc;
    var ang = houseKnown ? angles(jdFromMs(utcMs), inp.lat, inp.lon) : null;
    var anchor = houseKnown ? signIndex(ang.asc) : signIndex(pos.Sun.lon);

    var bodies = {};
    PLANETS.concat(['Node']).forEach(function (n) {
      var s = signInfo(pos[n].lon);
      s.retro = pos[n].retro; s.speed = pos[n].speed;
      s.house = ((s.index - anchor + 12) % 12) + 1;
      bodies[n] = s;
    });
    var asc = ang ? signInfo(ang.asc) : null, mc = ang ? signInfo(ang.mc) : null;

    var pts = {};
    PLANETS.forEach(function (n) { pts[n] = pos[n].lon; });
    if (ang) { pts.Asc = ang.asc; pts.MC = ang.mc; }

    var elCount = { fire: 0, earth: 0, air: 0, water: 0 }, moCount = { cardinal: 0, fixed: 0, mutable: 0 };
    var ELS = ['fire', 'earth', 'air', 'water'], MOS = ['cardinal', 'fixed', 'mutable'];
    function tally(idx, w) { elCount[ELS[idx % 4]] += w; moCount[MOS[idx % 3]] += w; }
    PLANETS.forEach(function (n) { tally(bodies[n].index, (n === 'Sun' || n === 'Moon') ? 2 : 1); });
    if (asc) tally(asc.index, 2);
    function top(o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0]; }
    var lacking = ELS.filter(function (e) { return elCount[e] <= 1; });

    // Sign stelliums (3+ planets, excluding the Node)
    var bySign = {};
    PLANETS.forEach(function (n) { (bySign[bodies[n].index] = bySign[bodies[n].index] || []).push(n); });
    var stellium = null;
    Object.keys(bySign).forEach(function (k) { if (bySign[k].length >= 3 && (!stellium || bySign[k].length > stellium.planets.length)) stellium = { sign: SIGNS[+k], planets: bySign[k] }; });

    // Moon sign could differ if birth time unknown and Moon is near a sign boundary (+-12h ~ +-6.6 deg)
    var moonUncertain = !timeKnown && (bodies.Moon.within < 6.7 || bodies.Moon.within > 23.3);

    return {
      utcMs: utcMs, timeKnown: timeKnown, houseKnown: houseKnown, houseMode: houseKnown ? 'whole-sign' : 'solar',
      anchorIndex: anchor, asc: asc, mc: mc, bodies: bodies, points: pts,
      aspects: natalAspects(pts), elements: elCount, modalities: moCount,
      dominantElement: top(elCount), dominantModality: top(moCount), lackingElements: lacking,
      stellium: stellium, moonUncertain: moonUncertain,
      retroCount: PLANETS.filter(function (n) { return bodies[n].retro; }).length
    };
  }

  // ---------- Transits ----------
  var TRANSIT_ORB = { Sun: 3, Moon: 4, Mercury: 2.5, Venus: 2.5, Mars: 2.5, Jupiter: 3, Saturn: 3, Uranus: 2.5, Neptune: 2.5, Pluto: 2.5 };

  function transitAspects(chart, nowMs, transitNames, targetNames, orbCap) {
    var tp = positions(nowMs), out = [];
    transitNames.forEach(function (t) {
      targetNames.forEach(function (n) {
        if (chart.points[n] === undefined) return;
        var maxOrb = Math.min(TRANSIT_ORB[t], orbCap || 99);
        var asp = aspectBetween(tp[t].lon, chart.points[n], 1);
        if (!asp || asp.orb > maxOrb) return;
        if ((t === 'Sun' || t === 'Moon' || t === 'Mercury' || t === 'Venus' || t === 'Mars') && asp.type === 'sextile' && asp.orb > maxOrb * 0.8) return;
        out.push({
          transit: t, natal: n, type: asp.type, orb: asp.orb, retro: tp[t].retro,
          score: WEIGHT[t] * WEIGHT[n] * ASPECT_WEIGHT[asp.type] * (1 - asp.orb / (maxOrb + 0.01))
        });
      });
    });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }

  // ---------- Moon phases ----------
  function phaseAngle(ms) { return rev(lonAt('Moon', ms) - lonAt('Sun', ms)); }
  function phaseName(angle) {
    var names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
    return names[Math.floor(((angle + 22.5) % 360) / 45)];
  }
  // time of next phase with elongation == target (0 new, 90 first quarter, 180 full, 270 last quarter)
  function nextPhase(ms, target) {
    var step = 3 * 3600000, t = ms, prev = angDiff(phaseAngle(t), target);
    for (var i = 0; i < 400; i++) {
      var t2 = t + step, cur = angDiff(phaseAngle(t2), target);
      if (prev < 0 && cur >= 0 && Math.abs(cur - prev) < 90) {
        var lo = t, hi = t2;
        for (var k = 0; k < 24; k++) { var mid = (lo + hi) / 2; (angDiff(phaseAngle(mid), target) < 0 ? lo = mid : hi = mid); }
        return (lo + hi) / 2;
      }
      t = t2; prev = cur;
    }
    return null;
  }

  return {
    SIGNS: SIGNS, PLANETS: PLANETS, WEIGHT: WEIGHT,
    rev: rev, angDiff: angDiff, jdFromMs: jdFromMs, msFromJd: msFromJd,
    tzOffsetMs: tzOffsetMs, localToUtcMs: localToUtcMs, isValidTz: isValidTz,
    lonAt: lonAt, bodyLonLat: bodyLonLat, positions: positions, signInfo: signInfo, signIndex: signIndex,
    angles: angles, aspectBetween: aspectBetween, natalAspects: natalAspects, buildChart: buildChart, transitAspects: transitAspects,
    phaseAngle: phaseAngle, phaseName: phaseName, nextPhase: nextPhase, gmstDeg: gmstDeg, obliquity: obliquity
  };
})();

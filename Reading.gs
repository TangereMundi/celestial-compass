/**
 * Reading.gs — turns a chart (see Astro.gs) into written readings.
 *
 * Everything here is template-based and runs offline: no AI service needed, no per-reading
 * cost. All text lives in the tables at the top, so you can rewrite the voice of the site
 * without touching any logic. Each reading is {title, sections:[{h, p:[...], list:[...]}]}.
 */
var READING = (function () {
  'use strict';
  var A = ASTRO;

  // ================= TEXT TABLES (edit freely) =================
  var SUN = [
    'You are built to begin things. There is a pilot light in you that ignites fast: courage, directness, a refusal to wait for permission. The lesson of your life is knowing when to charge and when to let others catch up.',
    'You are the steady one other people lean on. You build slowly and well, trust what you can touch and taste, and carry a loyalty that is both your greatest strength and the thing that keeps you in places you have outgrown.',
    'Your mind is your home. Curious and quick, always connecting one idea to another, you are a natural translator between worlds. Your growth comes from going deep on the few things that matter instead of lightly across everything.',
    'You feel the weather in every room. Protective, intuitive and deeply loyal, you create belonging wherever you go. Your growth is learning that caring for others does not require abandoning your own shell.',
    'You came here to shine, and warmth is how you do it. Generous, proud and creative, you light people up simply by taking your own life seriously. Your growth is letting applause be a bonus rather than the fuel.',
    'You notice what others miss, and you want to make it better. Precise, humble and quietly devoted, you carry a craftsperson’s pride. Your growth is trusting that “good enough” is not a betrayal of your standards.',
    'You are a bridge-builder with an eye for beauty and fairness. Charming and reflective, you weigh every side before you choose. Your growth is choosing anyway, and letting some people be disappointed.',
    'You live at depth. Intense, perceptive and fiercely private, you see through surfaces to what is really going on. Your growth is letting trust be a risk you take rather than a test others must pass.',
    'You are on a quest for meaning. Honest, adventurous and hopeful, you need a horizon to walk toward. Your growth is staying present long enough to finish the road you are already on.',
    'You play the long game. Disciplined, dry-humoured and quietly ambitious, you have probably carried responsibility since you were young. Your growth is letting yourself rest, and receive, without earning it first.',
    'You think from the future backward. Independent, inventive and a little unconventional, you belong to ideas and causes more than to crowds. Your growth is letting individuals, not just humanity, get close.',
    'You are porous in the best and hardest way. Compassionate, imaginative and deeply intuitive, you feel the undercurrents beneath everything. Your growth is building banks for the river so you can flow without dissolving.'
  ];
  var MOON = [
    'You react fast and recover fast, and you need the freedom to feel what you feel without being managed.',
    'You find safety through comfort, routine and the physical world. Under stress you go quiet and dig in.',
    'You process feelings by talking and thinking them through. You need variety, and someone to bounce thoughts with.',
    'Your feelings run deep and in tides. Home, memory and the people you love are your anchors.',
    'You need to feel appreciated, and you give love warmly. Being overlooked hurts more than you let on.',
    'You calm yourself by being useful and keeping life in order. Worry is your tell, and kindness toward yourself is your medicine.',
    'You need harmony and good company to feel settled. Conflict drains you faster than it seems to.',
    'You feel everything intensely and show only a fraction of it. Loyalty and emotional honesty are non-negotiable.',
    'You need space, humour and a sense of meaning. You recover by moving: travelling, learning, laughing.',
    'You hold your feelings with composure and handle crises well. The quiet task is letting someone see you wobble.',
    'You step back to understand your emotions. You need friendship, independence and room to be different.',
    'You absorb the moods around you like a sponge. Solitude, music, water and creativity restore you.'
  ];
  var RISING = [
    'People meet someone direct, energetic and quick to act.',
    'People meet someone calm, grounded and pleasant to be around.',
    'People meet someone curious, talkative and mentally agile.',
    'People meet someone gentle and watchful, and they sense your protectiveness quickly.',
    'People meet someone warm, expressive and hard to overlook.',
    'People meet someone modest, observant and capable.',
    'People meet someone graceful, diplomatic and easy to like.',
    'People meet someone magnetic and composed who gives little away.',
    'People meet someone open, optimistic and a little restless.',
    'People meet someone serious, reliable and older than your years.',
    'People meet someone distinctive, friendly and slightly detached.',
    'People meet someone soft, dreamy and hard to pin down.'
  ];
  var VENUS = [
    'In love you are bold and ardent. You want the chase, and a partner who matches your fire.',
    'In love you are sensual and loyal. You show devotion through presence, touch and reliability.',
    'In love you need conversation and play, and a partner who keeps you mentally curious.',
    'In love you nurture, and you need emotional safety before you open fully.',
    'In love you are generous and romantic. You want to adore and be adored.',
    'In love you show care through acts of service, and you value a partner who is honest and grounded.',
    'In love you are a romantic idealist. Partnership itself is a path you value.',
    'In love you want total depth, trust and loyalty. It is all or nothing.',
    'In love you need freedom, laughter and a shared quest.',
    'In love you are slow to commit and devoted once you do. Love is built season by season.',
    'In love you need a friend first, and the space to stay yourself.',
    'In love you are tender and idealistic. You love with your whole imagination.'
  ];
  var MARS = [
    'You pursue goals head-on and thrive on challenge.',
    'Your drive is slow-burning and relentless: hard to start, impossible to stop.',
    'You act through ideas and words, often juggling many projects at once.',
    'You act hardest when protecting what matters. Your drive is moody but fiercely loyal.',
    'You pursue goals with pride and flair, and you need to feel you are leading.',
    'You work precisely and tirelessly, and best with a clear system.',
    'You act best in collaboration and dislike open confrontation, so anger can go passive.',
    'Your will is formidable, strategic and long-memoried.',
    'You are driven by ideals and adventure, and impatient with petty limits.',
    'You are disciplined, ambitious and built for endurance.',
    'You fight for causes and act in independent, unconventional ways.',
    'Your drive is intuitive and fluid, and strongest when serving something you believe in.'
  ];
  var MERCURY = [
    'You think fast and speak plainly.', 'You think deliberately and decide once.', 'Your mind is quick, witty and endlessly curious.',
    'You think with your memory and your feelings.', 'You communicate with confidence and a flair for drama.', 'Your mind is analytical and hungry for detail.',
    'You weigh both sides and speak diplomatically.', 'Your mind probes motives and keeps its secrets.', 'You think big-picture and say it straight.',
    'You think practically, strategically and dryly.', 'Your thinking is original and ahead of the curve.', 'You think in images and impressions, and intuition leads.'
  ];
  var KEYWORDS = [
    'bold, direct, impatient', 'steady, sensual, stubborn', 'curious, chatty, restless', 'protective, moody, nostalgic',
    'warm, proud, theatrical', 'precise, helpful, critical', 'harmonious, charming, undecided', 'intense, private, probing',
    'optimistic, frank, restless', 'disciplined, serious, ambitious', 'inventive, detached, independent', 'dreamy, compassionate, elusive'
  ];
  var DAY_MOON = [
    { mood: 'Energy runs high and tempers run short.', best: 'starting things, exercise, decisive calls', careful: 'impulsive replies' },
    { mood: 'A calm, sensual, practical day.', best: 'money matters, cooking, rest', careful: 'digging in your heels' },
    { mood: 'Chatty, restless and curious.', best: 'writing, networking, learning', careful: 'scattered focus' },
    { mood: 'Feelings and family come forward.', best: 'home, nurturing, trusting your intuition', careful: 'taking things personally' },
    { mood: 'Warm, expressive and proud.', best: 'creative work, being visible, play', careful: 'bruised ego' },
    { mood: 'Sharp, orderly and health-minded.', best: 'planning, tidying up, detail work', careful: 'over-criticism, yours or theirs' },
    { mood: 'Social, aesthetic and indecisive.', best: 'negotiation, relationships, beauty', careful: 'people-pleasing' },
    { mood: 'Intense, private and truth-seeking.', best: 'deep work, honest talks, research', careful: 'power struggles' },
    { mood: 'Optimistic, restless and outspoken.', best: 'learning, travel, big-picture planning', careful: 'overpromising' },
    { mood: 'Serious, productive and reserved.', best: 'career, structure, long-term goals', careful: 'overworking' },
    { mood: 'Detached, inventive and social.', best: 'groups, technology, fresh ideas', careful: 'emotional distance' },
    { mood: 'Dreamy, sensitive and intuitive.', best: 'creativity, rest, compassion', careful: 'escapism and vague plans' }
  ];
  var HOUSE_TOPIC = [
    'your identity, body and how you begin things', 'your money, possessions and self-worth', 'your communication, learning and local world',
    'your home, roots and family', 'your creativity, romance and joy', 'your work, routines and health',
    'your close partnerships', 'shared resources, intimacy and transformation', 'your beliefs, travel and higher learning',
    'your career, reputation and direction', 'your friends, community and hopes', 'your inner life, rest and the unseen'
  ];
  var ELEMENT_TEXT = {
    fire: 'Fire dominates your chart: you run on enthusiasm, courage and vision. You act first and refine later.',
    earth: 'Earth dominates your chart: you are practical, steady and grounded in what is real. People trust you to follow through.',
    air: 'Air dominates your chart: you live in ideas, conversation and connection. You understand the world by talking it through.',
    water: 'Water dominates your chart: you navigate life through feeling, intuition and empathy. You read people before they speak.'
  };
  var LACKING_TEXT = {
    fire: 'Little fire in your chart suggests that spontaneity and self-belief are muscles worth training on purpose.',
    earth: 'Little earth in your chart suggests that practical routines will not come automatically, so build them deliberately.',
    air: 'Little air in your chart suggests that stepping back to look at situations objectively takes conscious effort.',
    water: 'Little water in your chart suggests that naming your feelings, rather than analysing or acting past them, is your growth edge.'
  };
  var MODALITY_TEXT = {
    cardinal: 'Cardinal signs lead your chart, which makes you an initiator: you are happiest starting things and setting direction.',
    fixed: 'Fixed signs lead your chart, which makes you a stabiliser: you hold the line, finish what you start, and resist being rushed.',
    mutable: 'Mutable signs lead your chart, which makes you an adapter: you read the situation, adjust, and carry people through change.'
  };
  var PLANET_CORE = {
    Sun: 'identity and purpose', Moon: 'emotions and needs', Mercury: 'mind and voice', Venus: 'love and values', Mars: 'drive and desire',
    Jupiter: 'growth and faith', Saturn: 'discipline and fear', Uranus: 'freedom and change', Neptune: 'dreams and intuition', Pluto: 'power and transformation',
    Asc: 'self-presentation', MC: 'public role'
  };
  var NATAL_ASPECT_TEXT = {
    conjunction: 'These two energies fuse. You experience them as one voice: powerful when focused, hard to separate.',
    sextile: 'These two cooperate easily, which gives you a talent that grows the more you use it.',
    square: 'These two pull in different directions. That inner friction has probably driven a good share of your growth.',
    trine: 'These two flow together naturally. It is a gift you may undervalue precisely because it comes so easily.',
    opposition: 'These two sit across from each other like a seesaw. Your task is balancing both rather than picking a side.'
  };
  var ASPECT_VERB = { conjunction: 'is joined with', sextile: 'is in sextile with', square: 'is in square with', trine: 'is in trine with', opposition: 'is opposite' };
  var TRANSIT_VERB = { conjunction: 'conjoins', sextile: 'sextiles', square: 'squares', trine: 'trines', opposition: 'opposes' };
  var TRANSIT_ACTION = {
    Sun: 'the spotlight and extra vitality', Moon: 'mood and sensitivity', Mercury: 'conversation and decisions', Venus: 'affection, money and harmony',
    Mars: 'drive and friction', Jupiter: 'growth and opportunity', Saturn: 'responsibility and reality-checks', Uranus: 'disruption and liberation',
    Neptune: 'intuition and fog', Pluto: 'pressure and deep change'
  };
  var NATAL_DOMAIN = {
    Sun: 'your sense of self and vitality', Moon: 'your emotional life', Mercury: 'how you think and communicate', Venus: 'your relationships and values',
    Mars: 'your drive and desires', Asc: 'how you present yourself', MC: 'your career and public role'
  };
  var TRANSIT_ASPECT_LINE = {
    conjunction: function (a, d) { return 'Expect ' + a + ' to concentrate on ' + d + ': intensity you can use, if you choose where to put it.'; },
    sextile: function (a, d) { return 'Expect ' + a + ' to open a door around ' + d + '. It only takes one small step from you.'; },
    square: function (a, d) { return 'Expect ' + a + ' to create friction around ' + d + ': uncomfortable, but it pushes you to act.'; },
    trine: function (a, d) { return 'Expect ' + a + ' to flow easily into ' + d + '. Support is available, so lean into it.'; },
    opposition: function (a, d) { return 'Expect ' + a + ' to pull against ' + d + ', with other people or outside events holding up the mirror.'; }
  };
  var RETRO_NOTE = {
    Mercury: 'Mercury is retrograde: double-check details, back up your files, and revisit or finish things instead of launching new ones.',
    Venus: 'Venus is retrograde: old relationships and money questions resurface. Review rather than commit.',
    Mars: 'Mars is retrograde: energy runs lower and tempers run inward. Pace yourself and avoid forcing outcomes.'
  };
  var PROFECTION_TEXT = [
    'a year of fresh starts, body, image and self-definition', 'a year of earning, spending and sorting out what you value', 'a year of learning, short journeys, siblings and communication',
    'a year centred on home, family and emotional foundations', 'a year of creativity, romance, children and play', 'a year of work, routines, service and health',
    'a year when partnerships, contracts and one-to-one relationships take centre stage', 'a year of deep change, shared money, intimacy and letting go', 'a year of travel, study, beliefs and widening horizons',
    'a year when career, status and public direction come to the fore', 'a year of friends, networks, groups and long-term hopes', 'a year of retreat, rest, spirituality and closing old chapters'
  ];
  var RULERS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ================= helpers =================
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function localParts(ms, tz) {
    var off = A.tzOffsetMs(tz || 'UTC', ms), d = new Date(ms + off);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours() };
  }
  function fmtDate(ms, tz, withWeekday) {
    var p = localParts(ms, tz);
    return (withWeekday ? DAYS[p.wd] + ' ' : '') + p.d + ' ' + MONTHS[p.m] + ' ' + p.y;
  }
  function fmtShort(ms, tz) { var p = localParts(ms, tz); return p.d + ' ' + MONTHS[p.m].slice(0, 3); }
  function houseLine(chart, house) {
    return house ? 'in your ' + ord(house) + ' house (' + HOUSE_TOPIC[house - 1] + ')' : '';
  }
  function transitHouse(chart, lon) { return ((A.signIndex(lon) - chart.anchorIndex + 12) % 12) + 1; }
  function listJoin(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function houseWord(chart) { return chart.houseMode === 'whole-sign' ? 'house' : 'house (counted from your Sun sign, since birth time or place is missing)'; }

  var PERSONAL_RETRO = ['Mercury', 'Venus', 'Mars'];
  var LABEL = { Asc: 'Ascendant', MC: 'Midheaven' };
  function label(n) { return LABEL[n] || n; }

  function transitSentence(t) {
    var action = TRANSIT_ACTION[t.transit] + (t.retro && PERSONAL_RETRO.indexOf(t.transit) > -1 ? ' (retrograde, so turned inward)' : '');
    var head = 'Transiting ' + t.transit + ' ' + TRANSIT_VERB[t.type] + ' your natal ' + label(t.natal) + (t.orb < 0.5 ? ' (almost exact).' : '.');
    return head + ' ' + TRANSIT_ASPECT_LINE[t.type](action, NATAL_DOMAIN[t.natal]);
  }
  function uniqueTransits(list, n) {
    var seen = {}, out = [];
    list.forEach(function (t) {
      var k = t.transit + '|' + t.natal;
      if (!seen[k] && out.length < n) { seen[k] = 1; out.push(t); }
    });
    return out;
  }
  function targets(chart) { return chart.houseKnown ? ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Asc', 'MC'] : ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars']; }
  var SLOW = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var FAST = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'];

  function retroNotes(pos) {
    var out = [];
    ['Mercury', 'Venus', 'Mars'].forEach(function (n) { if (pos[n].retro) out.push(RETRO_NOTE[n]); });
    return out;
  }

  // ================= FREE READING =================
  function free(chart, nowMs, ctx) {
    var B = chart.bodies, tz = ctx.tz, first = ctx.firstName || 'friend', S = [];
    S.push({
      h: 'Welcome, ' + first,
      p: ['This reading is calculated from the real positions of the planets at the moment you were born' + (chart.timeKnown ? '' : ' (we used midday, since you did not give a birth time)') + '. It is a mirror, not a verdict. Read it slowly and notice what lands.']
    });

    S.push({ h: 'Your Sun in ' + B.Sun.sign + ': who you are', p: [SUN[B.Sun.index] + (chart.houseKnown ? ' Your Sun sits ' + houseLine(chart, B.Sun.house) + ', so much of your life energy gathers there.' : '')] });
    S.push({ h: 'Your Moon in ' + B.Moon.sign + ': what you need', p: [MOON[B.Moon.index] + (chart.houseKnown ? ' It lives ' + houseLine(chart, B.Moon.house) + '.' : '') + (chart.moonUncertain ? ' (Without a birth time your Moon could be in the neighbouring sign, so treat this one as provisional.)' : '')] });
    if (chart.asc) S.push({ h: 'Your Rising sign, ' + chart.asc.sign + ': how you arrive', p: [RISING[chart.asc.index] + ' Your Midheaven, the point of your public reputation, falls in ' + chart.mc.sign + '.'] });
    else S.push({ h: 'Your Rising sign: still hidden', p: ['Your Rising sign, houses and Midheaven need an exact birth time and place. Add them and your full chart, the part that makes a reading feel personal, will unlock.'] });

    var rm = [VENUS[B.Venus.index], MARS[B.Mars.index]];
    S.push({ h: 'Heart and drive: Venus in ' + B.Venus.sign + ', Mars in ' + B.Mars.sign, p: [rm[0], rm[1]] });
    var mind = 'Mercury in ' + B.Mercury.sign + ': ' + MERCURY[B.Mercury.index];
    if (B.Mercury.retro) mind += ' Mercury was retrograde when you were born, which often means you think things through inwardly before you speak, and your best ideas arrive late and original.';
    S.push({ h: 'Your mind', p: [mind] });

    var shape = [ELEMENT_TEXT[chart.dominantElement], MODALITY_TEXT[chart.dominantModality]];
    if (chart.lackingElements.length) shape.push(LACKING_TEXT[chart.lackingElements[0]]);
    if (chart.stellium) shape.push('You have a stellium in ' + chart.stellium.sign + ': ' + listJoin(chart.stellium.planets) + ' all gather there. That sign’s themes (' + KEYWORDS[A.SIGNS.indexOf(chart.stellium.sign)] + ') run through your whole life.');
    if (chart.retroCount >= 4) shape.push(chart.retroCount + ' of your planets were retrograde at birth. You tend to process life inwardly and on your own timeline.');
    var sig = chart.aspects.filter(function (x) { return x.score > 0; })[0];
    if (sig) shape.push('Your tightest signature aspect: your ' + label(sig.a) + ' (' + PLANET_CORE[sig.a] + ') ' + ASPECT_VERB[sig.type] + ' your ' + label(sig.b) + ' (' + PLANET_CORE[sig.b] + '). ' + NATAL_ASPECT_TEXT[sig.type]);
    S.push({ h: 'The shape of your chart', p: shape });

    // current sky
    var tp = A.positions(nowMs), now = [];
    var moon = A.signInfo(tp.Moon.lon);
    var hits = uniqueTransits(A.transitAspects(chart, nowMs, SLOW, targets(chart), 3), 2);
    var jh = transitHouse(chart, tp.Jupiter.lon), sh = transitHouse(chart, tp.Saturn.lon);
    now.push('Jupiter, the planet of growth, is moving through ' + A.signInfo(tp.Jupiter.lon).sign + ' and your ' + ord(jh) + ' ' + houseWord(chart) + ': an opening around ' + HOUSE_TOPIC[jh - 1] + '.');
    now.push('Saturn, the planet of structure, is in ' + A.signInfo(tp.Saturn.lon).sign + ' and your ' + ord(sh) + ' house: the place where life asks for patience and honest effort, around ' + HOUSE_TOPIC[sh - 1] + '.');
    hits.forEach(function (t) { now.push(transitSentence(t)); });
    S.push({ h: 'What is moving for you now', p: now });

    var tip = DAY_MOON[moon.index];
    S.push({ h: 'Today’s sky', p: ['The Moon is in ' + moon.sign + ' today. ' + tip.mood + ' Good for: ' + tip.best + '. Watch out for: ' + tip.careful + '.'] });
    return { title: 'Your free birth chart reading', sections: S };
  }

  // ================= DAILY =================
  function daily(chart, nowMs, ctx) {
    var tp = A.positions(nowMs), moon = A.signInfo(tp.Moon.lon), tip = DAY_MOON[moon.index];
    var phase = A.phaseName(A.phaseAngle(nowMs)), S = [];
    var mh = transitHouse(chart, tp.Moon.lon);
    S.push({ h: 'The Moon today: ' + moon.sign + ' (' + phase + ')', p: [tip.mood + ' The Moon is passing through your ' + ord(mh) + ' ' + houseWord(chart) + ', which turns your attention to ' + HOUSE_TOPIC[mh - 1] + '.'] });
    var hits = uniqueTransits(A.transitAspects(chart, nowMs, FAST.concat(SLOW), targets(chart), 3), 3);
    if (hits.length) S.push({ h: 'Your personal weather', p: hits.map(transitSentence) });
    else S.push({ h: 'Your personal weather', p: ['No sharp planetary contacts to your chart today. It is a good day for steady routine, and for finishing what is already in motion.'] });
    S.push({ h: 'Use today for', p: ['Best for: ' + tip.best + '.', 'Be careful with: ' + tip.careful + '.'] });
    var r = retroNotes(tp);
    if (r.length) S.push({ h: 'Retrograde reminder', p: r });
    return { title: 'Your daily guidance for ' + fmtDate(nowMs, ctx.tz, true), sections: S };
  }

  // ================= WEEKLY =================
  function sampleHits(chart, startMs, days, step, names, orb, n) {
    var all = [];
    for (var t = startMs; t <= startMs + days * 86400000; t += step * 86400000)
      all = all.concat(A.transitAspects(chart, t, names, targets(chart), orb));
    all.sort(function (x, y) { return y.score - x.score; });
    return uniqueTransits(all, n);
  }
  function phasesBetween(startMs, endMs) {
    var out = [], targets4 = [[0, 'New Moon'], [180, 'Full Moon']];
    targets4.forEach(function (tg) {
      var t = A.nextPhase(startMs, tg[0]);
      while (t && t <= endMs) { out.push({ ms: t, name: tg[1], sign: A.signInfo(A.lonAt('Moon', t)) }); t = A.nextPhase(t + 5 * 86400000, tg[0]); }
    });
    out.sort(function (a, b) { return a.ms - b.ms; });
    return out;
  }
  function sunSeasonLine(chart, nowMs, tz) {
    var tp = A.positions(nowMs), sun = A.signInfo(tp.Sun.lon), h = transitHouse(chart, tp.Sun.lon);
    var until = nowMs + ((30 - sun.within) / Math.max(0.9, tp.Sun.speed)) * 86400000;
    return 'The Sun is in ' + sun.sign + ' until about ' + fmtShort(until, tz) + ', lighting up your ' + ord(h) + ' ' + houseWord(chart) + ' (' + HOUSE_TOPIC[h - 1] + ').';
  }
  function weekly(chart, nowMs, ctx) {
    var tz = ctx.tz, end = nowMs + 7 * 86400000, tp = A.positions(nowMs), S = [];
    S.push({ h: 'The theme of the week', p: [sunSeasonLine(chart, nowMs, tz),
      'Mercury is in ' + A.signInfo(tp.Mercury.lon).sign + ' (' + KEYWORDS[A.signIndex(tp.Mercury.lon)] + '), shaping how everyone communicates. Venus is in ' + A.signInfo(tp.Venus.lon).sign + ' (' + KEYWORDS[A.signIndex(tp.Venus.lon)] + '), shaping what feels attractive and valuable. Mars is in ' + A.signInfo(tp.Mars.lon).sign + ' (' + KEYWORDS[A.signIndex(tp.Mars.lon)] + '), shaping where energy goes.'] });
    var ph = phasesBetween(nowMs, end);
    if (ph.length) S.push({ h: 'Moon dates', list: ph.map(function (x) { return fmtDate(x.ms, tz, true) + ': ' + x.name + ' in ' + x.sign.sign + (x.name === 'New Moon' ? ' (set an intention)' : ' (notice what is complete)'); }) });
    var hits = sampleHits(chart, nowMs, 7, 1, FAST.filter(function (n) { return n !== 'Moon'; }).concat(SLOW), 2.5, 3);
    S.push({ h: 'Your personal weather', p: hits.length ? hits.map(transitSentence) : ['A quiet week astrologically. Use the calm to build rather than react.'] });
    var r = retroNotes(tp);
    if (r.length) S.push({ h: 'Retrograde reminder', p: r });
    S.push({ h: 'A question for the week', p: ['Where in ' + HOUSE_TOPIC[transitHouse(chart, tp.Sun.lon) - 1] + ' are you being asked to show up more fully?'] });
    return { title: 'Your week ahead: ' + fmtShort(nowMs, tz) + ' to ' + fmtShort(end, tz), sections: S };
  }

  // ================= MONTHLY =================
  function monthly(chart, nowMs, ctx) {
    var tz = ctx.tz, end = nowMs + 30 * 86400000, tp = A.positions(nowMs), S = [];
    S.push({ h: 'The focus of the month', p: [sunSeasonLine(chart, nowMs, tz)] });
    var ph = phasesBetween(nowMs, end);
    if (ph.length) S.push({ h: 'New and Full Moons', p: ph.map(function (x) {
      var h = transitHouse(chart, x.sign.lon);
      return fmtDate(x.ms, tz, true) + ', ' + x.name + ' in ' + x.sign.label + ': it activates your ' + ord(h) + ' ' + houseWord(chart) + ', so the theme is ' + HOUSE_TOPIC[h - 1] + (x.name === 'New Moon' ? '. A good moment to plant an intention.' : '. Something here comes to light or reaches completion.');
    }) });
    var vh = transitHouse(chart, tp.Venus.lon), mh = transitHouse(chart, tp.Mars.lon);
    S.push({ h: 'Love and energy', p: ['Venus is in ' + A.signInfo(tp.Venus.lon).sign + ', moving through ' + HOUSE_TOPIC[vh - 1] + ': what you enjoy and value shifts there.',
      'Mars is in ' + A.signInfo(tp.Mars.lon).sign + ', moving through ' + HOUSE_TOPIC[mh - 1] + ': that is where your drive, and your friction, concentrate.'] });
    var hits = sampleHits(chart, nowMs, 30, 3, SLOW.concat(['Mars', 'Venus', 'Mercury']), 2.5, 4);
    S.push({ h: 'Key planetary contacts this month', p: hits.length ? hits.map(transitSentence) : ['No major contacts to your chart this month. Steady progress is available.'] });
    var r = retroNotes(tp);
    if (r.length) S.push({ h: 'Retrograde reminder', p: r });
    return { title: 'Your guidance for ' + MONTHS[localParts(nowMs, tz).m] + ' ' + localParts(nowMs, tz).y, sections: S };
  }

  // ================= YEARLY =================
  function yearly(chart, nowMs, ctx) {
    var tz = ctx.tz, tp = A.positions(nowMs), S = [], bd = localParts(chart.utcMs, tz), nw = localParts(nowMs, tz);
    var age = nw.y - bd.y - ((nw.m < bd.m || (nw.m === bd.m && nw.d < bd.d)) ? 1 : 0);
    var profHouse = (age % 12) + 1, profSign = (chart.anchorIndex + profHouse - 1) % 12, lord = RULERS[profSign];
    var lordBody = chart.bodies[lord], lordNow = A.signInfo(tp[lord].lon);
    S.push({ h: 'Your year at a glance', p: ['Counting forward from your ' + (chart.houseKnown ? 'Rising sign' : 'Sun sign') + ', this birthday year (age ' + age + ') activates your ' + ord(profHouse) + ' house, ' + PROFECTION_TEXT[profHouse - 1] + '.',
      'Its guiding planet, your “lord of the year”, is ' + lord + ' (ruler of ' + A.SIGNS[profSign] + '). In your birth chart ' + lord + ' is in ' + lordBody.sign + ' (' + ord(lordBody.house) + ' house); right now it is in ' + lordNow.sign + '. Watch that planet: when it is stirred, the year’s themes switch on.'] });
    var jh = transitHouse(chart, tp.Jupiter.lon), sh = transitHouse(chart, tp.Saturn.lon);
    S.push({ h: 'Where luck and effort land', p: ['Jupiter, in ' + A.signInfo(tp.Jupiter.lon).sign + ', expands your ' + ord(jh) + ' house: ' + HOUSE_TOPIC[jh - 1] + '. Say yes to offers here.',
      'Saturn, in ' + A.signInfo(tp.Saturn.lon).sign + ', tests your ' + ord(sh) + ' house: ' + HOUSE_TOPIC[sh - 1] + '. Lay solid foundations here and the pressure becomes mastery.'] });

    // scan the next 365 days for slow-planet contacts (windows within 1 degree)
    var windows = {}, tgt = chart.houseKnown ? ['Sun', 'Moon', 'Asc', 'MC', 'Venus', 'Mars', 'Mercury'] : ['Sun', 'Moon', 'Venus', 'Mars', 'Mercury'];
    for (var dd = 0; dd <= 365; dd += 3) {
      var t = nowMs + dd * 86400000, pos = A.positions(t);
      SLOW.forEach(function (tr) {
        tgt.forEach(function (nat) {
          if (chart.points[nat] === undefined) return;
          var asp = A.aspectBetween(pos[tr].lon, chart.points[nat], 1);
          if (!asp || asp.orb > 1.2) return;
          var k = tr + '|' + nat + '|' + asp.type, w = windows[k];
          if (!w) w = windows[k] = { transit: tr, natal: nat, type: asp.type, from: t, to: t, best: asp.orb, bestMs: t, retro: pos[tr].retro, orb: asp.orb };
          w.to = t; if (asp.orb < w.best) { w.best = asp.orb; w.bestMs = t; w.orb = asp.orb; }
        });
      });
    }
    var list = Object.keys(windows).map(function (k) { var w = windows[k]; w.score = A.WEIGHT[w.transit] * A.WEIGHT[w.natal] * (w.type === 'trine' || w.type === 'sextile' ? 0.9 : 1); return w; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
    if (list.length) S.push({
      h: 'Key periods in the next twelve months',
      p: ['These are the slow, significant contacts. Dates are approximate and mark when each is closest to exact.'],
      list: list.sort(function (a, b) { return a.bestMs - b.bestMs; }).map(function (w) {
        return fmtShort(w.bestMs, tz) + ': ' + w.transit + ' ' + TRANSIT_VERB[w.type] + ' your ' + label(w.natal) + '. ' + TRANSIT_ASPECT_LINE[w.type](TRANSIT_ACTION[w.transit], NATAL_DOMAIN[w.natal]);
      })
    });
    else S.push({ h: 'Key periods in the next twelve months', p: ['No slow planet makes a tight contact to your core points this year. Your own choices set the tone more than outside pressure does.'] });
    S.push({ h: 'How to use this report', p: ['Treat the dates as weather forecasts, not appointments. Note the two or three periods that match what is already happening in your life, and plan important decisions around the supportive ones.'] });
    return { title: 'Your year-ahead report', sections: S };
  }

  function guidance(kind, chart, nowMs, ctx) {
    var fn = { daily: daily, weekly: weekly, monthly: monthly, yearly: yearly }[kind];
    if (!fn) throw new Error('Unknown guidance type: ' + kind);
    return fn(chart, nowMs, ctx);
  }

  // ================= render =================
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toText(r) {
    var out = [r.title, ''];
    r.sections.forEach(function (s) {
      out.push(s.h.toUpperCase());
      (s.p || []).forEach(function (x) { out.push(x); });
      (s.list || []).forEach(function (x) { out.push('- ' + x); });
      out.push('');
    });
    return out.join('\n');
  }
  function toHtml(r) {
    var h = '<h1 style="font-family:Georgia,serif;font-size:24px;color:#1b1f3b;margin:0 0 18px">' + esc(r.title) + '</h1>';
    r.sections.forEach(function (s) {
      h += '<h2 style="font-family:Georgia,serif;font-size:17px;color:#7a5c12;margin:22px 0 6px">' + esc(s.h) + '</h2>';
      (s.p || []).forEach(function (x) { h += '<p style="margin:0 0 10px;line-height:1.6;color:#2b2b38">' + esc(x) + '</p>'; });
      if (s.list) h += '<ul style="margin:0 0 10px;padding-left:20px;color:#2b2b38;line-height:1.6">' + s.list.map(function (x) { return '<li style="margin-bottom:6px">' + esc(x) + '</li>'; }).join('') + '</ul>';
    });
    return h;
  }

  return { free: free, guidance: guidance, toHtml: toHtml, toText: toText, esc: esc, fmtDate: fmtDate, localParts: localParts, TEXT: { SUN: SUN, MOON: MOON, RISING: RISING, VENUS: VENUS, MARS: MARS, MERCURY: MERCURY, DAY_MOON: DAY_MOON, HOUSE_TOPIC: HOUSE_TOPIC } };
})();

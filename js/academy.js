/* =====================================================================
   PROBE ACADEMY: guided tutorial + kids space-weather quiz
   For PROBE THE BASE (vanilla JS, no bundler, works offline)

   Load after your other scripts (in index.html):
     a stylesheet link to css/academy.css
     a script tag for js/academy.js

   Then in MissionScene.create():
     ProbeAcademy.init({
       mission: 'mars' | 'moon',
       difficulty: 'cadet' | 'engineer' | 'commander',
       targets: {                       // CSS selectors (or elements) in your HUD
         budget: '#power-budget', lifeSupport: '#row-lifeSupport',
         shielding: '#row-shielding', research: '#row-research',
         comms: '#row-comms', sliders: '#slider-panel'
       },
       getState: () => ({               // read from your mission state
         lifeSupport, shielding, research, comms,   // kW
         capacity,                                  // current kW capacity
         radiation,                                 // raw mSv/h
         alertActive                                // true while a flare is on
       }),
       pause: () => scene.pauseMission(), resume: () => scene.resumeMission(),
       triggerFlare: () => scene.startPracticeFlare(),
       endFlare: () => scene.endPracticeFlare(),
       onQuizComplete: (result) => scene.quizResult = result
     });

   Training mission:      ProbeAcademy.startTutorial()
   Normal mission:        ProbeAcademy.armMissionQuiz()  // quiz opens once the
                          player makes the right trade-off during a flare
   Scene shutdown:        ProbeAcademy.disarm()
   Settings toggle:       ProbeAcademy.prefs.get('tutorial', true) / .set('tutorial', bool)
   ===================================================================== */
(function (global) {
  'use strict';

  var DANGER_MSV = 0.2;        // net radiation limit, same as the game
  var LIFE_MIN = 25;           // kW, same as the game
  var FULL_SHIELD = 40;        // kW that blocks 100%
  var STORE_KEY = 'probe.academy.v1';

  var reducedMotion = function () {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  /* ---------------- Saved preferences ---------------- */
  var prefs = {
    read: function () {
      try { return JSON.parse(global.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    },
    get: function (key, fallback) {
      var v = this.read()[key];
      return v === undefined ? fallback : v;
    },
    set: function (key, value) {
      try {
        var o = this.read(); o[key] = value;
        global.localStorage.setItem(STORE_KEY, JSON.stringify(o));
      } catch (e) { /* storage blocked: keep playing */ }
    }
  };

  /* ---------------- Question bank ----------------
     level: 1 = Cadet, 2 = Engineer, 3 = Commander
     place: 'any', 'mars' or 'moon'
     Facts checked against NASA sources; keep them short enough to read aloud. */
  var BANK = [
    { id: 'sun-star', level: 1, place: 'any',
      q: 'What is the Sun?',
      options: ['A star', 'A planet', 'A moon'], answer: 0,
      hint: 'It’s like the twinkly dots you see at night, only much, much closer.',
      fact: 'The Sun is our nearest star. Its storms, like flares and CMEs, are called space weather.' },
    { id: 'flare-what', level: 1, place: 'any',
      q: 'What is a solar flare?',
      options: ['A sudden burst of energy from the Sun', 'A shooting star burning up', 'A rainstorm on Mars'], answer: 0,
      hint: 'It starts on the Sun, not on a planet.',
      fact: 'A flare is a bright burst of light and energy from the Sun. NASA’s DONKI database records the big ones, and this game reads it.' },
    { id: 'flare-x', level: 1, place: 'any',
      q: 'Flares get a letter. Which letter means the biggest flare?',
      options: ['C', 'M', 'X'], answer: 2,
      hint: 'On a treasure map, this letter marks the spot.',
      fact: 'From smallest to biggest the main classes go C, M, X. An X flare is the most powerful kind.' },
    { id: 'flare-10x', level: 2, place: 'any',
      q: 'An M flare is about how many times stronger than a C flare?',
      options: ['2 times', '10 times', '1,000 times'], answer: 1,
      hint: 'Count all your fingers.',
      fact: 'Each step up, from C to M to X, is about 10 times stronger. So an X flare is about 100 times stronger than a C flare.' },
    { id: 'shield-job', level: 1, place: 'any',
      q: 'What does Shielding do in your base?',
      options: ['Blocks radiation from reaching the crew', 'Makes oxygen to breathe', 'Sends science to Earth'], answer: 0,
      hint: 'Think of a knight’s shield.',
      fact: 'In this game, 40 kW of shielding blocks all the radiation and 20 kW blocks half. Real bases could use thick walls, water or soil.' },
    { id: 'life-job', level: 1, place: 'any',
      q: 'What does Life Support give the crew?',
      options: ['Air to breathe and warmth', 'Faster rockets', 'Photos of Earth'], answer: 0,
      hint: 'It’s the one thing the crew can never switch off.',
      fact: 'Life Support makes air, controls temperature and cleans the water. That’s why it must stay at 25 kW or more.' },
    { id: 'tradeoff', level: 1, place: 'any',
      q: 'In a solar storm, which systems can you turn down to save power?',
      options: ['Research and Comms', 'Life Support', 'Every system'], answer: 0,
      hint: 'Look for the ones labelled “optional”.',
      fact: 'That’s the trade-off: you lose a little science, but the crew stays safe. Turn them back on when the storm passes.' },
    { id: 'shelter-water', level: 2, place: 'any',
      q: 'What can astronauts pack around themselves to make a storm shelter?',
      options: ['Water and supplies', 'Balloons', 'Paper maps'], answer: 0,
      hint: 'It’s heavy, and you drink it every day.',
      fact: 'Water is good at stopping radiation. For the Artemis Moon missions, NASA plans for the crew to shelter behind supply bags inside the Orion capsule.' },
    { id: 'cme-time', level: 2, place: 'any',
      q: 'Sunlight takes about 8 minutes to reach Earth. A CME cloud from the Sun usually takes…',
      options: ['About 1 to 3 days', 'About 1 second', 'About 10 years'], answer: 0,
      hint: 'Much slower than light, but much faster than a year.',
      fact: 'A CME (coronal mass ejection) is a giant cloud of gas thrown out by the Sun. Most take days to arrive, but very fast ones can arrive in less than a day.' },
    { id: 'aurora', level: 2, place: 'any',
      q: 'What makes the northern lights (auroras) on Earth?',
      options: ['Particles from the Sun hitting our air', 'Fireworks', 'Moonlight on the ice'], answer: 0,
      hint: 'They happen more often after big solar storms.',
      fact: 'Earth’s magnetic field guides particles from the Sun towards the poles. When they hit the air, it glows.' },
    { id: 'xray', level: 3, place: 'any',
      q: 'Your crew got 1 mSv of radiation. One chest X-ray is about 0.1 mSv. How many chest X-rays is that?',
      options: ['1', '10', '100'], answer: 1,
      hint: 'How many 0.1s add up to 1?',
      fact: 'mSv (millisievert) measures radiation dose. NASA’s career limit for an astronaut is 600 mSv.' },
    { id: 'donki', level: 3, place: 'any',
      q: 'Which NASA database keeps track of solar flares and CMEs?',
      options: ['DONKI', 'Hubble', 'Artemis'], answer: 0,
      hint: 'It sounds a bit like a farm animal.',
      fact: 'DONKI stands for Database Of Notifications, Knowledge, Information. This game asks it for the latest flares and CMEs.' },
    { id: 'mars-why', level: 2, place: 'mars',
      q: 'Why does a Mars base need more radiation protection than a house on Earth?',
      options: ['Mars has thin air and no global magnetic shield', 'Mars is closer to the Sun', 'Mars is made of metal'], answer: 0,
      hint: 'Earth has an invisible bubble around it. Mars doesn’t.',
      fact: 'Earth’s thick air and magnetic field block most solar particles. Mars has neither, so much more radiation reaches the ground.' },
    { id: 'mars-dust', level: 2, place: 'mars',
      q: 'What has made solar panels on Mars rovers make less power?',
      options: ['Dust covering the panels', 'Rain', 'Ocean waves'], answer: 0,
      hint: 'Mars is a dry, rusty desert.',
      fact: 'In 2018 a giant dust storm blocked the sunlight, and NASA’s Opportunity rover ran out of power.' },
    { id: 'mars-rad', level: 3, place: 'mars',
      q: 'In September 2017 a huge X flare hit Mars. Which NASA rover measured the radiation on the ground?',
      options: ['Curiosity', 'Sojourner', 'Voyager'], answer: 0,
      hint: 'Its name means wanting to find things out.',
      fact: 'Curiosity’s RAD instrument measured that storm from the surface. It’s the same event this game uses for Mars when it’s offline.' },
    { id: 'moon-why', level: 2, place: 'moon',
      q: 'Why does a Moon base need radiation shielding?',
      options: ['The Moon has almost no air and no magnetic shield', 'The Moon is as hot as the Sun', 'The Moon glows at night'], answer: 0,
      hint: 'On the Moon the sky is black even in the daytime. Why?',
      fact: 'With almost no air and no global magnetic field, the Moon’s surface gets the full blast of solar radiation.' },
    { id: 'moon-night', level: 3, place: 'moon',
      q: 'A night on the Moon lasts about how long?',
      options: ['About 14 Earth days', 'About 8 hours', 'About 1 year'], answer: 0,
      hint: 'It’s about half of one month.',
      fact: 'During the long lunar night, solar panels make no power, so a Moon base needs batteries or another power source.' },
    { id: 'power-math', level: 2, place: 'any',
      q: 'Your panels make 60 kW. Life Support uses 25 kW and Shielding uses 30 kW. How much is left for Research and Comms?',
      options: ['5 kW', '15 kW', '55 kW'], answer: 0,
      hint: 'Add the two systems together, then take that away from 60.',
      fact: '25 + 30 = 55, and 60 − 55 = 5. Mission controllers do sums like this all the time to stop the base browning out.' },
    { id: 'shield-full', level: 1, place: 'any',
      q: 'In this game, 20 kW of Shielding blocks half the radiation. How much blocks all of it?',
      options: ['40 kW', '25 kW', '100 kW'], answer: 0,
      hint: 'Half is 20. What is double 20?',
      fact: 'Double the shielding, double the protection: 40 kW blocks 100% of the radiation in your base.' },
    { id: 'msv-what', level: 2, place: 'any',
      q: 'What does “mSv” measure?',
      options: ['How much radiation a body takes in', 'How fast a rocket flies', 'How hot the Sun is'], answer: 0,
      hint: 'You see it next to the radiation numbers in your HUD.',
      fact: 'mSv means millisievert. It measures radiation dose, which is how much radiation the body has absorbed.' },
    { id: 'mars-sol', level: 3, place: 'mars',
      q: 'A day on Mars is called a sol. About how long is one sol?',
      options: ['24 hours and 40 minutes', '12 hours', '3 Earth days'], answer: 0,
      hint: 'It is only a little longer than a day on Earth.',
      fact: 'A sol lasts about 24 hours and 40 minutes, so Mars rover teams shift their working day a bit later every day.' },
    { id: 'moon-gravity', level: 2, place: 'moon',
      q: 'Gravity on the Moon is about how strong compared with Earth?',
      options: ['About one-sixth', 'Twice as strong', 'Exactly the same'], answer: 0,
      hint: 'Apollo astronauts could bounce like kangaroos.',
      fact: 'Moon gravity is about one-sixth of Earth’s. A 30 kg backpack would feel like about 5 kg.' },
    { id: 'moon-artemis', level: 1, place: 'moon',
      q: 'Which NASA program is sending astronauts back to the Moon?',
      options: ['Artemis', 'Curiosity', 'Hubble'], answer: 0,
      hint: 'In Greek stories, she is the twin sister of Apollo.',
      fact: 'Artemis is named after Apollo’s twin sister. Apollo was the program that first landed people on the Moon.' }
  ];

  /* ---------------- Small helpers ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9l-5.8 3.2 1.4-6.4L2.7 9.3l6.5-.7z" fill="#ce7372" stroke="#8c2f35" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  var TICK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

  function mascot(extraClass) {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<svg class="pa-mascot ' + (extraClass || '') + '" viewBox="0 0 80 80" aria-hidden="true">' +
        '<line x1="40" y1="22" x2="40" y2="9" stroke="#04102a" stroke-width="3" stroke-linecap="round"/>' +
        '<circle class="pa-ant" cx="40" cy="7" r="4.5" fill="#ce7372" stroke="#04102a" stroke-width="2"/>' +
        '<line x1="14" y1="45" x2="22" y2="45" stroke="#04102a" stroke-width="3"/>' +
        '<line x1="58" y1="45" x2="66" y2="45" stroke="#04102a" stroke-width="3"/>' +
        '<rect x="2" y="36" width="13" height="18" rx="2" fill="#9ee1e7" stroke="#04102a" stroke-width="2.5"/>' +
        '<line x1="8.5" y1="36" x2="8.5" y2="54" stroke="#04102a" stroke-width="1.5"/>' +
        '<rect x="65" y="36" width="13" height="18" rx="2" fill="#9ee1e7" stroke="#04102a" stroke-width="2.5"/>' +
        '<line x1="71.5" y1="36" x2="71.5" y2="54" stroke="#04102a" stroke-width="1.5"/>' +
        '<circle cx="40" cy="46" r="22" fill="#c8e3ff" stroke="#04102a" stroke-width="3"/>' +
        '<path d="M22 54 Q40 66 58 54" fill="none" stroke="#aa85b4" stroke-width="3" stroke-linecap="round"/>' +
        '<rect x="26" y="35" width="28" height="17" rx="8.5" fill="#04102a"/>' +
        '<circle class="pa-eye" cx="34" cy="43.5" r="3.3" fill="#9ee1e7"/>' +
        '<circle class="pa-eye" cx="46" cy="43.5" r="3.3" fill="#9ee1e7"/>' +
        '<circle cx="35.2" cy="42.3" r="1" fill="#c8e3ff"/>' +
        '<circle cx="47.2" cy="42.3" r="1" fill="#c8e3ff"/>' +
      '</svg>';
    return wrap.firstChild;
  }
  function talk(svg) {
    if (!svg) return;
    svg.classList.remove('is-talking');
    void svg.getBoundingClientRect();
    svg.classList.add('is-talking');
  }

  /* ---------------- Config + game state ---------------- */
  var cfg = {
    mission: 'mars',
    difficulty: 'cadet',
    questionsPerQuiz: 3,
    quizEnabled: true,
    targets: {},
    getState: function () { return {}; },
    pause: function () {}, resume: function () {},
    triggerFlare: function () {}, endFlare: function () {},
    onTutorialEnd: function () {}, onQuizComplete: function () {}
  };

  function init(options) {
    for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) cfg[k] = options[k];
    return api;
  }

  function readState() {
    var s = {};
    try { s = cfg.getState() || {}; } catch (e) { console.info('[PROBE Academy] getState failed', e); }
    var ls = num(s.lifeSupport), sh = num(s.shielding);
    var total = s.totalPower != null ? num(s.totalPower) : ls + sh + num(s.research) + num(s.comms);
    var net = s.netRadiation != null
      ? num(s.netRadiation)
      : Math.max(0, num(s.radiation) * (1 - sh / FULL_SHIELD));
    return { ls: ls, sh: sh, total: total, net: net, cap: num(s.capacity), alert: !!s.alertActive };
  }
  /* During the peak of a big flare, full protection can cost more power than the
     panels make (e.g. 25 kW life support + 37 kW shielding > 60 kW). So "radiation
     OK" means: in the green, OR shielded as much as the budget allows. That is the
     real trade-off we want to reward. */
  function bestShield(st) {
    return Math.max(0, Math.min(FULL_SHIELD, Math.floor(st.cap) - LIFE_MIN));
  }
  function checksFor(st) {
    var radOk = st.net <= DANGER_MSV || (st.cap > 0 && st.sh >= bestShield(st) - 1);
    return { life: st.ls >= LIFE_MIN, rad: radOk, power: st.total <= st.cap };
  }

  /* =====================================================================
     TUTORIAL
     ===================================================================== */
  var STEPS = [
    { title: 'Hi, I’m Probe!', target: null, next: 'Let’s go',
      text: 'I help run this base. Let’s practise one solar storm together, so you’re ready for the real thing.' },
    { title: 'Your power budget', target: 'budget',
      text: 'The solar panels give you this much power. Use more than that and the base browns out: the lights flicker and the crew gets hurt.' },
    { title: 'Life Support', target: 'lifeSupport',
      text: 'This makes air to breathe and keeps the crew warm. Keep it at 25 kW or more, always.' },
    { title: 'Shielding', target: 'shielding',
      text: 'This blocks radiation from the Sun. 40 kW blocks all of it. 20 kW blocks half.' },
    { title: 'Research and Comms', target: ['research', 'comms'],
      text: 'These earn science points and send them to Earth. They’re useful, but optional. In a storm, they can wait.' },
    { title: 'Flare! Protect the crew', target: 'sliders', action: true,
      text: 'A solar flare just hit. Radiation is rising and your panels make less power. Move the sliders until all three checks turn green.' },
    { title: 'Storm handled!', target: null, next: 'Take the space quiz', final: true,
      text: 'The crew is safe. You gave up some science to protect them, and that trade-off is exactly what real mission controllers do. When a storm passes, turn Research and Comms back on.' }
  ];

  var tut = null; // active tutorial state

  function resolveTargets(key) {
    if (key == null) return [];
    var keys = Array.isArray(key) ? key : [key];
    var out = [];
    keys.forEach(function (k) {
      var t = cfg.targets[k];
      var node = typeof t === 'string' ? document.querySelector(t) : t;
      if (node && node.getBoundingClientRect) out.push(node);
      else if (t) console.info('[PROBE Academy] tutorial target not found:', k, t);
    });
    return out;
  }
  function unionRect(nodes) {
    if (!nodes.length) return null;
    var r = { top: Infinity, left: Infinity, right: -Infinity, bottom: -Infinity };
    nodes.forEach(function (n) {
      var b = n.getBoundingClientRect();
      r.top = Math.min(r.top, b.top); r.left = Math.min(r.left, b.left);
      r.right = Math.max(r.right, b.right); r.bottom = Math.max(r.bottom, b.bottom);
    });
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    return r.width > 0 && r.height > 0 ? r : null;
  }

  function startTutorial() {
    if (tut) return;
    closeQuiz(true);
    prefs.set('tutorialSeen', true);
    var spot = el('div', 'pa-root pa-spot is-empty');
    var coach = el('div', 'pa-root pa-coach');
    coach.setAttribute('role', 'dialog');
    coach.setAttribute('aria-live', 'polite');
    document.body.appendChild(spot);
    document.body.appendChild(coach);
    tut = { i: -1, spot: spot, coach: coach, raf: 0, poll: 0, hintTimer: 0, goodTicks: 0, lastKey: '' };
    goStep(0);
    loopPosition();
  }

  function goStep(i) {
    if (!tut) return;
    clearInterval(tut.poll); clearTimeout(tut.hintTimer);
    tut.i = i;
    var step = STEPS[i];
    if (step.action) { cfg.resume(); cfg.triggerFlare(); } else { cfg.pause(); }
    renderCoach(step);
    tut.spot.classList.toggle('is-light', !!step.action);
    tut.lastKey = '';
    if (step.action) startActionStep();
  }

  function renderCoach(step) {
    var c = tut.coach;
    c.textContent = '';
    c.classList.toggle('is-alert', !!step.action);
    var m = mascot(); c.appendChild(m);
    var h = el('h3', null, step.title); h.id = 'pa-coach-title';
    c.setAttribute('aria-labelledby', 'pa-coach-title');
    c.appendChild(h);
    c.appendChild(el('p', null, step.text));

    if (step.action) {
      var list = el('ul', 'pa-check');
      [['life', 'Life Support 25 kW or more'],
       ['rad', 'Crew shielded from radiation'],
       ['power', 'Power under budget']].forEach(function (row) {
        var li = el('li'); li.dataset.check = row[0];
        var tick = el('span', 'pa-tick'); tick.innerHTML = TICK_SVG;
        li.appendChild(tick);
        li.appendChild(el('span', null, row[1]));
        li.appendChild(el('span', 'pa-val', ''));
        list.appendChild(li);
      });
      c.appendChild(list);
      tut.nudgeBox = el('div'); c.appendChild(tut.nudgeBox);
    }

    var foot = el('div', 'pa-coach-foot');
    if (!step.final) {
      var skip = el('button', 'pa-btn pa-btn--quiet', 'Skip tutorial');
      skip.type = 'button';
      skip.addEventListener('click', function () { endTutorial(false); });
      foot.appendChild(skip);
    }
    if (step.action) {
      var hint = el('button', 'pa-btn pa-btn--amber pa-push', 'Hint');
      hint.type = 'button';
      hint.addEventListener('click', showNudge);
      foot.appendChild(hint);
    } else {
      var label = step.final && cfg.quizEnabled === false ? 'Start the mission' : (step.next || 'Next');
      var next = el('button', 'pa-btn pa-push', label);
      next.type = 'button';
      next.addEventListener('click', function () {
        if (step.final) {
          endTutorial(true);
          if (cfg.quizEnabled === false) cfg.resume(); else startQuiz();
        }
        else goStep(tut.i + 1);
      });
      foot.appendChild(next);
      setTimeout(function () { try { next.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
    c.appendChild(foot);

    var dots = el('div', 'pa-steps'); dots.setAttribute('aria-hidden', 'true');
    STEPS.forEach(function (_, k) {
      dots.appendChild(el('span', k === tut.i ? 'is-on' : (k < tut.i ? 'is-past' : '')));
    });
    c.appendChild(dots);
    talk(m);
  }

  function startActionStep() {
    tut.goodTicks = 0;
    tut.hintTimer = setTimeout(showNudge, 12000);
    tut.poll = setInterval(function () {
      var st = readState(), ok = checksFor(st);
      var vals = {
        life: st.ls + ' kW',
        rad: round1(st.net) + ' mSv/h',
        power: st.total + ' / ' + st.cap + ' kW'
      };
      Array.prototype.forEach.call(tut.coach.querySelectorAll('.pa-check li'), function (li) {
        var key = li.dataset.check;
        li.classList.toggle('is-done', ok[key]);
        li.querySelector('.pa-val').textContent = vals[key];
      });
      if (ok.life && ok.rad && ok.power) {
        tut.goodTicks++;
        if (tut.goodTicks >= 3) { // held green for ~0.75 s
          clearInterval(tut.poll); clearTimeout(tut.hintTimer);
          setTimeout(function () { if (tut) goStep(tut.i + 1); }, 650);
        }
      } else {
        tut.goodTicks = 0;
      }
    }, 250);
  }

  function showNudge() {
    if (!tut || !tut.nudgeBox) return;
    var st = readState(), ok = checksFor(st);
    var msg;
    if (!ok.power) msg = 'You’re over budget. Slide Research and Comms down first. That frees power for Shielding.';
    else if (!ok.life) msg = 'Life Support dropped below 25 kW. Slide it back up so the crew can breathe.';
    else if (!ok.rad) msg = 'Slide Shielding up. Every kilowatt blocks more radiation. 40 kW blocks it all.';
    else if (st.net > DANGER_MSV) msg = 'Great trade-off! Shielding is as high as your power allows. The storm will fade soon.';
    else msg = 'All green. Hold it there!';
    tut.nudgeBox.textContent = '';
    tut.nudgeBox.appendChild(el('div', 'pa-nudge', msg));
    talk(tut.coach.querySelector('.pa-mascot'));
  }

  function loopPosition() {
    if (!tut) return;
    var step = STEPS[tut.i];
    var rect = unionRect(resolveTargets(step && step.target));
    var key = rect ? [rect.top, rect.left, rect.width, rect.height].map(Math.round).join(',') : 'none';
    key += '|' + global.innerWidth + 'x' + global.innerHeight + '|' + tut.i + '|' + tut.coach.offsetHeight;
    if (key !== tut.lastKey) { tut.lastKey = key; placeSpot(rect); placeCoach(rect); }
    tut.raf = global.requestAnimationFrame(loopPosition);
  }

  function placeSpot(rect) {
    var s = tut.spot;
    if (!rect) { s.classList.add('is-empty'); s.style.top = ''; s.style.left = ''; s.style.width = ''; s.style.height = ''; return; }
    var pad = 8;
    s.classList.remove('is-empty');
    s.style.top = (rect.top - pad) + 'px';
    s.style.left = (rect.left - pad) + 'px';
    s.style.width = (rect.width + pad * 2) + 'px';
    s.style.height = (rect.height + pad * 2) + 'px';
  }

  function placeCoach(rect) {
    var c = tut.coach, vw = global.innerWidth, vh = global.innerHeight;
    var w = c.offsetWidth, h = c.offsetHeight, gap = 22, edge = 14, topMin = 50;
    var top, left;
    if (!rect) {
      left = (vw - w) / 2; top = (vh - h) / 2;
    } else if (vw < 640) {
      left = (vw - w) / 2;
      top = (rect.top + rect.height / 2 > vh / 2) ? topMin : vh - h - edge;
    } else if (rect.right + gap + w <= vw - edge) {
      left = rect.right + gap; top = rect.top + rect.height / 2 - h / 2;
    } else if (rect.left - gap - w >= edge) {
      left = rect.left - gap - w; top = rect.top + rect.height / 2 - h / 2;
    } else if (rect.bottom + gap + h <= vh - edge) {
      top = rect.bottom + gap + 30; left = rect.left + rect.width / 2 - w / 2;
    } else {
      top = rect.top - gap - h; left = rect.left + rect.width / 2 - w / 2;
    }
    c.style.left = clamp(left, edge, Math.max(edge, vw - w - edge)) + 'px';
    c.style.top = clamp(top, topMin, Math.max(topMin, vh - h - edge)) + 'px';
  }

  function endTutorial(completed) {
    if (!tut) return;
    clearInterval(tut.poll); clearTimeout(tut.hintTimer);
    global.cancelAnimationFrame(tut.raf);
    tut.spot.remove(); tut.coach.remove();
    tut = null;
    if (completed) prefs.set('tutorialDone', true);
    cfg.endFlare();
    if (!completed) cfg.resume();
    try { cfg.onTutorialEnd({ completed: completed }); } catch (e) { console.info(e); }
  }

  /* =====================================================================
     MISSION WATCHER: quiz after the player makes the trade-off in a flare
     ===================================================================== */
  var watch = { timer: 0, startTimer: 0, fired: false, good: 0 };

  function armMissionQuiz() {
    disarm();
    if (cfg.quizEnabled === false) return;
    watch.fired = false; watch.good = 0;
    watch.timer = setInterval(function () {
      if (watch.fired || tut || quiz) return;
      var st = readState();
      if (!st.alert) { watch.good = 0; return; }
      var ok = checksFor(st);
      watch.good = (ok.life && ok.rad && ok.power) ? watch.good + 1 : 0;
      if (watch.good >= 4) { // green for ~1.2 s during the flare
        watch.fired = true;
        clearInterval(watch.timer);
        toast('Alert handled! The crew is safe.');
        watch.startTimer = setTimeout(function () { watch.startTimer = 0; startQuiz(); }, 1500);
      }
    }, 300);
  }
  function disarm() { clearInterval(watch.timer); watch.timer = 0; clearTimeout(watch.startTimer); watch.startTimer = 0; }

  function toast(text) {
    var t = el('div', 'pa-root pa-toast');
    t.setAttribute('role', 'status');
    t.appendChild(mascot());
    t.appendChild(el('span', null, text));
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* =====================================================================
     QUIZ
     ===================================================================== */
  var LEVELS = { cadet: [1, 2], engineer: [1, 2, 3], commander: [2, 3] };
  var quiz = null;

  function pickQuestions() {
    var levels = LEVELS[cfg.difficulty] || [1, 2, 3];
    var pool = BANK.filter(function (q) {
      return levels.indexOf(q.level) !== -1 && (q.place === 'any' || q.place === cfg.mission);
    });
    var local = shuffle(pool.filter(function (q) { return q.place === cfg.mission; }));
    var general = shuffle(pool.filter(function (q) { return q.place === 'any'; }));
    var n = cfg.questionsPerQuiz, picked = [];
    if (local.length) picked.push(local.shift());           // always one about your planet
    while (picked.length < n && general.length) picked.push(general.shift());
    while (picked.length < n && local.length) picked.push(local.shift());
    return shuffle(picked).map(function (q) {
      var order = shuffle(q.options.map(function (t, i) { return { t: t, i: i }; }));
      return {
        id: q.id, q: q.q, hint: q.hint, fact: q.fact,
        opts: order.map(function (o) { return o.t; }),
        correct: order.findIndex(function (o) { return o.i === q.answer; })
      };
    });
  }

  function startQuiz() {
    if (quiz) return;
    cfg.pause();
    var scrim = el('div', 'pa-root pa-scrim');
    var card = el('div', 'pa-card' + (cfg.mission === 'moon' ? ' is-moon' : ''));
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    scrim.appendChild(card);
    document.body.appendChild(scrim);
    quiz = {
      scrim: scrim, card: card, items: pickQuestions(), i: 0,
      stars: 0, firstTry: 0, hints: 0, q: null, prevFocus: document.activeElement
    };
    quiz.keyHandler = onQuizKey;
    document.addEventListener('keydown', quiz.keyHandler, true);
    renderQuestion(false);
  }

  function renderQuestion(swap) {
    var item = quiz.items[quiz.i];
    quiz.q = { worth: 3, hintLevel: 0, wrong: 0, done: false };
    var card = quiz.card;
    card.textContent = '';
    if (swap) { card.classList.remove('is-swap'); void card.offsetWidth; card.classList.add('is-swap'); }

    var place = cfg.mission === 'moon' ? 'Moon' : 'Mars';
    card.appendChild(el('div', 'pa-tab', place + ' quiz: question ' + (quiz.i + 1) + ' of ' + quiz.items.length));

    var head = el('div', 'pa-qhead');
    var planets = el('div', 'pa-planets'); planets.setAttribute('aria-hidden', 'true');
    quiz.items.forEach(function (_, k) {
      planets.appendChild(el('span', k < quiz.i ? 'is-done' : (k === quiz.i ? 'is-now' : '')));
    });
    head.appendChild(planets);
    var tally = el('div', 'pa-tally');
    tally.innerHTML = STAR_SVG;
    var tallyNum = el('span', null, String(quiz.stars));
    tally.appendChild(tallyNum);
    tally.setAttribute('aria-label', quiz.stars + ' stars so far');
    head.appendChild(tally);
    card.appendChild(head);
    quiz.tally = tally; quiz.tallyNum = tallyNum;

    var h = el('h2', 'pa-q', item.q); h.id = 'pa-q-' + quiz.i;
    card.setAttribute('aria-labelledby', h.id);
    card.appendChild(h);

    var list = el('div', 'pa-opts'); list.setAttribute('role', 'group');
    quiz.optEls = item.opts.map(function (text, k) {
      var b = el('button', 'pa-opt');
      b.type = 'button';
      var key = el('span', 'pa-key', String.fromCharCode(65 + k));
      key.setAttribute('aria-hidden', 'true');
      b.appendChild(key);
      b.appendChild(el('span', null, text));
      b.addEventListener('click', function () { choose(k); });
      list.appendChild(b);
      return b;
    });
    card.appendChild(list);

    quiz.feedback = el('p', 'pa-feedback'); quiz.feedback.setAttribute('aria-live', 'polite');
    card.appendChild(quiz.feedback);
    quiz.extra = el('div'); card.appendChild(quiz.extra);

    var foot = el('div', 'pa-qfoot');
    quiz.hintBtn = el('button', 'pa-btn pa-btn--amber', 'Hint (costs 1 star)');
    quiz.hintBtn.type = 'button';
    quiz.hintBtn.addEventListener('click', useHint);
    foot.appendChild(quiz.hintBtn);
    quiz.worthEl = el('div', 'pa-worth');
    foot.appendChild(quiz.worthEl);
    quiz.nextBtn = el('button', 'pa-btn pa-push', quiz.i === quiz.items.length - 1 ? 'See my stars' : 'Next question');
    quiz.nextBtn.type = 'button';
    quiz.nextBtn.hidden = true;
    quiz.nextBtn.addEventListener('click', nextQuestion);
    foot.appendChild(quiz.nextBtn);
    card.appendChild(foot);
    renderWorth();

    setTimeout(function () { try { quiz && quiz.optEls[0].focus({ preventScroll: true }); } catch (e) {} }, 80);
  }

  function renderWorth() {
    var w = quiz.worthEl; w.textContent = '';
    w.appendChild(el('span', null, quiz.q.done ? 'You earned' : 'Worth'));
    for (var k = 0; k < 3; k++) {
      var holder = document.createElement('span');
      holder.innerHTML = STAR_SVG;
      var svg = holder.firstChild;
      if (k >= quiz.q.worth) svg.classList.add('is-lost');
      w.appendChild(svg);
    }
    w.setAttribute('aria-label', (quiz.q.done ? 'You earned ' : 'This question is worth ') + quiz.q.worth + ' stars');
  }

  function useHint() {
    var q = quiz.q, item = quiz.items[quiz.i];
    if (q.done || q.hintLevel >= 2) return;
    q.hintLevel++; quiz.hints++;
    q.worth = Math.max(1, q.worth - 1);
    if (q.hintLevel === 1) {
      var clue = el('div', 'pa-clue');
      clue.appendChild(document.createTextNode('Probe’s clue: ' + item.hint));
      quiz.extra.textContent = '';
      quiz.extra.appendChild(clue);
      quiz.hintBtn.textContent = 'Remove a wrong answer (1 star)';
    } else {
      var candidates = quiz.optEls.filter(function (b, k) {
        return k !== item.correct && !b.classList.contains('is-wrong') && !b.classList.contains('is-out');
      });
      if (candidates.length) {
        var pick = candidates[Math.floor(Math.random() * candidates.length)];
        pick.classList.add('is-out'); pick.disabled = true;
        quiz.feedback.textContent = 'Probe crossed out one wrong answer.';
      }
      quiz.hintBtn.textContent = 'No more hints';
      quiz.hintBtn.disabled = true;
    }
    refreshHint();
    renderWorth();
  }

  // With only the right answer and one other left, removing one more would give it away.
  function refreshHint() {
    if (quiz.q.hintLevel !== 1) return;
    var open = quiz.optEls.filter(function (b) { return !b.disabled; }).length;
    if (open <= 2) { quiz.hintBtn.textContent = 'No more hints'; quiz.hintBtn.disabled = true; }
  }

  function choose(k) {
    var q = quiz.q, item = quiz.items[quiz.i], btn = quiz.optEls[k];
    if (q.done || btn.disabled) return;
    if (k === item.correct) {
      q.done = true;
      btn.classList.add('is-right');
      quiz.optEls.forEach(function (b) { b.classList.add('is-locked'); b.setAttribute('aria-disabled', 'true'); });
      if (q.wrong === 0 && q.hintLevel === 0) quiz.firstTry++;
      quiz.stars += q.worth;
      quiz.feedback.textContent = '';
      flyStars(btn, q.worth);
      var fact = el('div', 'pa-fact');
      fact.appendChild(el('strong', null, q.wrong === 0 ? 'Correct!' : 'You got it!'));
      fact.appendChild(document.createTextNode(item.fact));
      quiz.extra.textContent = '';
      quiz.extra.appendChild(fact);
      quiz.hintBtn.hidden = true;
      quiz.nextBtn.hidden = false;
      renderWorth();
      setTimeout(function () { try { quiz && quiz.nextBtn.focus({ preventScroll: true }); } catch (e) {} }, 60);
    } else {
      q.wrong++;
      q.worth = Math.max(1, q.worth - 1);
      btn.classList.add('is-wrong');
      btn.disabled = true;
      quiz.feedback.textContent = 'Not that one. Try again!';
      refreshHint();
      renderWorth();
    }
  }

  function flyStars(fromEl, count) {
    var bump = function () {
      if (!quiz) return;
      quiz.tallyNum.textContent = String(quiz.stars);
      quiz.tally.setAttribute('aria-label', quiz.stars + ' stars so far');
      quiz.tally.classList.remove('is-bump'); void quiz.tally.offsetWidth; quiz.tally.classList.add('is-bump');
    };
    if (reducedMotion()) { bump(); return; }
    var a = fromEl.getBoundingClientRect(), b = quiz.tally.getBoundingClientRect();
    var sx = a.left + a.width * 0.25, sy = a.top + a.height / 2;
    var tx = b.left + 6, ty = b.top + 4;
    for (var i = 0; i < count; i++) {
      var s = el('div', 'pa-root pa-spark');
      s.innerHTML = STAR_SVG;
      s.style.left = (sx + i * 18) + 'px';
      s.style.top = sy + 'px';
      s.style.setProperty('--dx', (tx - sx - i * 18) + 'px');
      s.style.setProperty('--dy', (ty - sy) + 'px');
      s.style.setProperty('--wob', ((i - 1) * 30) + 'px');
      s.style.setProperty('--d', (i * 0.09) + 's');
      document.body.appendChild(s);
      (function (node) { setTimeout(function () { node.remove(); }, 1100); })(s);
    }
    setTimeout(bump, 700 + (count - 1) * 90);
  }

  function nextQuestion() {
    if (!quiz.q.done) return;
    if (quiz.i < quiz.items.length - 1) { quiz.i++; renderQuestion(true); }
    else renderResults();
  }

  function rankFor(ratio) {
    if (ratio >= 0.8) return { title: 'Space Weather Pro', line: 'You know your flares from your CMEs. Mission control would be proud.' };
    if (ratio >= 0.5) return { title: 'Storm Watcher', line: 'Nice work. A few more missions and you’ll be a Space Weather Pro.' };
    return { title: 'Flare Spotter', line: 'Every astronaut starts here. Play again and the clues get easier.' };
  }

  function renderResults() {
    var max = quiz.items.length * 3;
    var ratio = quiz.stars / max;
    var rank = rankFor(ratio);
    var card = quiz.card;
    card.textContent = '';
    card.classList.remove('is-swap'); void card.offsetWidth; card.classList.add('is-swap');
    card.appendChild(el('div', 'pa-tab', 'Quiz complete'));
    var wrap = el('div', 'pa-result');
    var m = mascot(); wrap.appendChild(m);
    var h = el('h2', null, rank.title); h.id = 'pa-result-title';
    card.setAttribute('aria-labelledby', h.id);
    wrap.appendChild(h);
    var row = el('div', 'pa-starrow');
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', quiz.stars + ' of ' + max + ' stars');
    for (var k = 0; k < max; k++) {
      var holder = document.createElement('span');
      holder.innerHTML = STAR_SVG;
      var svg = holder.firstChild;
      if (k < quiz.stars) { svg.classList.add('is-earned'); svg.style.setProperty('--d', (0.15 + k * 0.1) + 's'); }
      else svg.classList.add('is-empty');
      row.appendChild(svg);
    }
    wrap.appendChild(row);
    wrap.appendChild(el('p', null,
      'You earned ' + quiz.stars + ' of ' + max + ' stars and got ' + quiz.firstTry + ' of ' +
      quiz.items.length + ' right first time. ' + rank.line));
    var back = el('button', 'pa-btn', 'Back to the mission');
    back.type = 'button';
    back.addEventListener('click', function () { closeQuiz(false); });
    wrap.appendChild(back);
    card.appendChild(wrap);
    talk(m);

    quiz.result = {
      stars: quiz.stars, maxStars: max, firstTry: quiz.firstTry,
      questions: quiz.items.length, hintsUsed: quiz.hints, rank: rank.title,
      questionIds: quiz.items.map(function (q) { return q.id; })
    };
    if (quiz.stars > prefs.get('quizBest', 0)) prefs.set('quizBest', quiz.stars);
    setTimeout(function () { try { back.focus({ preventScroll: true }); } catch (e) {} }, 80);
  }

  function onQuizKey(e) {
    if (!quiz) return;
    if (e.key === 'Tab') { trapFocus(e); return; }
    e.stopPropagation(); // keep game shortcuts (P, Esc, M, L) from firing under the quiz
    var k = e.key.toLowerCase();
    var idx = 'abcd'.indexOf(k); if (idx === -1) idx = '1234'.indexOf(k);
    if (quiz.result) return;
    if (idx !== -1 && quiz.optEls[idx]) { e.preventDefault(); choose(idx); }
    else if (k === 'h') { e.preventDefault(); useHint(); }
  }
  function trapFocus(e) {
    var f = Array.prototype.filter.call(quiz.card.querySelectorAll('button'), function (b) {
      return !b.disabled && !b.hidden && b.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeQuiz(silent) {
    if (!quiz) return;
    document.removeEventListener('keydown', quiz.keyHandler, true);
    quiz.scrim.remove();
    var result = quiz.result, prev = quiz.prevFocus;
    quiz = null;
    if (silent) return;
    cfg.resume();
    if (prev && prev.focus) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
    if (result) { try { cfg.onQuizComplete(result); } catch (e) { console.info(e); } }
  }

  function destroy() { disarm(); endTutorial(false); closeQuiz(true); }

  /* ---------------- Report text for the REPORT download ---------------- */
  function reportLines(result) {
    if (!result) return '';
    return [
      'SPACE QUIZ',
      '  Rank: ' + result.rank,
      '  Stars: ' + result.stars + ' / ' + result.maxStars,
      '  Right first time: ' + result.firstTry + ' / ' + result.questions,
      '  Hints used: ' + result.hintsUsed
    ].join('\n');
  }

  var api = {
    init: init,
    startTutorial: startTutorial,
    skipTutorial: function () { endTutorial(false); },
    startQuiz: startQuiz,
    armMissionQuiz: armMissionQuiz,
    disarm: disarm,
    destroy: destroy,
    isFirstRun: function () { return !prefs.get('tutorialSeen', false); },
    reportLines: reportLines,
    prefs: prefs,
    BANK: BANK,
    LEVELS: LEVELS,
    _checksFor: checksFor
  };
  global.ProbeAcademy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

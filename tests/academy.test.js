// PROBE Academy tests: question bank, quiz picking, trade-off checks, HUD contract.
// Run with:  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Academy = require('../js/academy.js');
const { GAME_CONFIG, computeNetRadiation } = require('../js/simulation.js');
const { NASA_PRESETS, fetchNasaScenario } = require('../js/scenarios.js');

const root = path.join(__dirname, '..');

test('question bank: every question is well formed', () => {
    const ids = new Set();
    for (const q of Academy.BANK) {
        assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
        ids.add(q.id);
        assert.ok([1, 2, 3].includes(q.level), `${q.id}: level must be 1, 2 or 3`);
        assert.ok(['any', 'mars', 'moon'].includes(q.place), `${q.id}: bad place`);
        assert.ok(q.q && q.hint && q.fact, `${q.id}: needs question, hint and fact`);
        assert.ok(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4, `${q.id}: 2-4 options`);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${q.id}: answer index out of range`);
        assert.equal(new Set(q.options).size, q.options.length, `${q.id}: options must be different`);
    }
    assert.ok(Academy.BANK.length >= 20, 'at least 20 questions');
});

test('every mission and difficulty has a full quiz, including one planet question', () => {
    for (const place of ['mars', 'moon']) {
        for (const [difficulty, levels] of Object.entries(Academy.LEVELS)) {
            const pool = Academy.BANK.filter((q) => levels.includes(q.level) && (q.place === 'any' || q.place === place));
            assert.ok(pool.length >= 3, `${place}/${difficulty}: only ${pool.length} questions`);
            assert.ok(pool.some((q) => q.place === place), `${place}/${difficulty}: no planet-specific question`);
        }
    }
    // The game's difficulty keys map onto the academy levels.
    for (const key of Object.keys(GAME_CONFIG.difficulty)) {
        assert.ok(Academy.LEVELS[key.toLowerCase()], `no quiz levels for ${key}`);
    }
});

test('trade-off check rewards the best possible shielding during a real flare', () => {
    const check = Academy._checksFor;
    for (const mode of ['MARS', 'MOON']) {
        const ev = NASA_PRESETS[mode].timeline.find((e) => e.alert);
        const cap = Math.floor(NASA_PRESETS[mode].baseSolarKW * ev.solar_efficiency);
        // The default allocation during a flare is over budget: not OK.
        const idle = { ls: 35, sh: 25, total: 90, net: computeNetRadiation(ev.radiation_mSv_hr, 25), cap };
        const bad = check(idle);
        assert.equal(bad.power, false, `${mode}: idle player is over budget`);
        // The smart trade-off: 25 kW life support, everything else into shielding.
        const sh = Math.min(40, cap - 25);
        const smart = check({ ls: 25, sh, total: 25 + sh, net: computeNetRadiation(ev.radiation_mSv_hr, sh), cap });
        assert.deepEqual(smart, { life: true, rad: true, power: true }, `${mode}: smart trade-off counts as handled`);
    }
});

test('the tutorial practice storm can be fully shielded on both bases', () => {
    for (const mode of ['MARS', 'MOON']) {
        const cap = Math.min(70, NASA_PRESETS[mode].baseSolarKW);
        const needShield = Math.ceil(GAME_CONFIG.shieldingDivisor * (1 - GAME_CONFIG.radiationDangerThreshold / 1.6));
        assert.ok(GAME_CONFIG.lifeSupportMinKW + needShield <= cap, `${mode}: practice storm must be winnable`);
        assert.ok(computeNetRadiation(1.6, needShield) <= GAME_CONFIG.radiationDangerThreshold);
    }
});

test('quiz result becomes readable report lines', () => {
    const text = Academy.reportLines({ rank: 'Storm Watcher', stars: 6, maxStars: 9, firstTry: 2, questions: 3, hintsUsed: 1 });
    assert.match(text, /SPACE QUIZ/);
    assert.match(text, /Stars: 6 \/ 9/);
    assert.equal(Academy.reportLines(null), '');
});

test('HUD has every element the tutorial spotlight and system checks need', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const ids = [
        'row-ls', 'row-shield', 'row-research', 'row-comms', 'slider-panel', 'budget-row',
        'check-life', 'check-rad', 'check-power', 'check-life-val', 'check-rad-val', 'check-power-val',
        'phase-chip', 'coach-tip', 'help-btn', 'slider-ls', 'slider-shield', 'slider-research', 'slider-comms'
    ];
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
    assert.ok(html.includes('js/academy.js') && html.includes('css/academy.css'), 'academy files are loaded');
    assert.ok(html.indexOf('js/academy.js') < html.indexOf('js/main.js'), 'academy.js loads before main.js');
});

test('the mission manual ships with the game', () => {
    assert.ok(fs.existsSync(path.join(root, 'manual', 'index.html')), 'manual/index.html');
    assert.ok(fs.existsSync(path.join(root, 'manual', 'PROBE-THE-BASE-Manual.pdf')), 'manual PDF');
});

test('offline scenarios still load with the academy present', async () => {
    const s = await fetchNasaScenario('MARS', { live: false });
    assert.equal(s.dataMode, 'PRESET');
    assert.ok(s.timeline.some((e) => e.alert));
});

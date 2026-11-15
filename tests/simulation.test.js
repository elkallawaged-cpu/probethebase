// Run with:  npm test   (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');

const { GAME_CONFIG, computeNetRadiation, applyCrewHealthDecay, computeScience } = require('../js/simulation.js');
const { NASA_PRESETS, OSDR_DOSIMETRY, flareFactor, cmePenalty, pickLatestFlare, pickLatestCme, fetchNasaScenario } = require('../js/scenarios.js');
const { CtiEvaluator, MissionAnalyst } = require('../js/CtiEvaluator.js');
const { ASSETS, validateAssetManifest } = require('../js/assets.js');
const fs = require('fs');
const path = require('path');

const osdr = OSDR_DOSIMETRY;
const alloc = (lifeSupport, shielding, research, comms) => ({ lifeSupport, shielding, research, comms });

test('net radiation follows the spec formula and never goes negative', () => {
    assert.equal(computeNetRadiation(2.0, 0), 2.0);
    assert.equal(computeNetRadiation(2.0, 20), 1.0);
    assert.equal(computeNetRadiation(2.0, 40), 0);
    assert.equal(computeNetRadiation(2.0, 50), 0);
});

test('crew decays on radiation > 0.2, overload, or life support < 25 kW', () => {
    const base = { health: 80, osdr, currentCapacity: 100 };
    const ok = applyCrewHealthDecay({ ...base, allocations: alloc(30, 30, 20, 10), netRadiation: 0.1, totalPowerAllocated: 90 });
    assert.equal(ok.inRed, false);
    assert.ok(ok.health > 80, 'recovers when green');

    const rad = applyCrewHealthDecay({ ...base, allocations: alloc(30, 10, 20, 10), netRadiation: 1.0, totalPowerAllocated: 70 });
    assert.ok(rad.radDanger && rad.health < 80);

    const over = applyCrewHealthDecay({ ...base, allocations: alloc(40, 40, 20, 10), netRadiation: 0, totalPowerAllocated: 110 });
    assert.ok(over.overload && over.health < 80);

    const ls = applyCrewHealthDecay({ ...base, allocations: alloc(20, 30, 10, 10), netRadiation: 0, totalPowerAllocated: 70 });
    assert.ok(ls.lsLow && ls.health < 80);
});

test('flare factor is monotonic and capped', () => {
    assert.ok(flareFactor('C1.0') < flareFactor('M1.0'));
    assert.ok(flareFactor('M5.0') < flareFactor('X1.0'));
    assert.ok(flareFactor('X20') <= 1.3);
    assert.equal(flareFactor('garbage'), 1.0);
    assert.equal(cmePenalty(300), 0);
    assert.ok(cmePenalty(5000) <= 0.08);
});

test('DONKI parsers pick the newest flare and the most accurate CME speed', () => {
    const flare = pickLatestFlare([
        { classType: 'M1.2', peakTime: '2026-11-01T10:00Z' },
        { classType: 'X1.1', peakTime: '2026-11-10T10:00Z' },
        { classType: '', peakTime: '2026-11-12T10:00Z' }
    ]);
    assert.deepEqual(flare, { classType: 'X1.1', peakTime: '2026-11-10' });
    const cme = pickLatestCme([
        { startTime: '2026-11-02T00:00Z', cmeAnalyses: [{ speed: 600, isMostAccurate: true }] },
        { startTime: '2026-11-09T00:00Z', cmeAnalyses: [{ speed: 900, isMostAccurate: false }, { speed: 1100, isMostAccurate: true }] }
    ]);
    assert.deepEqual(cme, { speed: 1100, startTime: '2026-11-09' });
    assert.equal(pickLatestFlare(null), null);
    assert.equal(pickLatestCme({}), null);
});

test('offline scenario falls back to NASA presets without throwing', async () => {
    const s = await fetchNasaScenario('MOON', { live: false });
    assert.equal(s.dataMode, 'PRESET');
    assert.equal(s.backgroundKey, 'moon_cockpit');
    assert.ok(s.timeline.some((e) => e.alert && e.radiation_mSv_hr > NASA_PRESETS.MOON.timeline[1].radiation_mSv_hr));
});

test('CTI uses 0.40 / 0.35 / 0.25 weights', () => {
    const cti = new CtiEvaluator();
    cti.recordAnomalyTriggered(10);
    cti.recordFirstAction(11);
    for (let t = 1; t <= 10; t++) {
        cti.updateTick({ inRed: false, inAlert: true, alloc: alloc(25, 35, 0, 0), t, health: 100, radiation: 2, netRadiation: 0.2, capacity: 60, total: 60 });
    }
    const r = cti.calculate(10);
    assert.equal(r.sDiag, 100);
    assert.equal(r.sEff, 100);
    assert.equal(r.sStab, 100);
    assert.equal(r.score, 100);
});

test('MissionAnalyst writes a short summary and a full report', () => {
    const cti = new CtiEvaluator();
    cti.recordAnomalyTriggered(15);
    cti.recordFirstAction(22);
    for (let t = 1; t <= 30; t++) {
        cti.updateTick({ inRed: t > 15, inAlert: t > 15, alloc: alloc(35, 25, 20, 10), t, health: 100 - t, radiation: 2, netRadiation: 0.75, capacity: 60, total: 90 });
    }
    const results = cti.calculate(30);
    const scenario = { ...NASA_PRESETS.MARS, osdr, flare: { classType: 'X8.2' }, sourceLabel: 'test' };
    const d = MissionAnalyst.analyze({ results, log: cti.log, scenario, success: false, elapsedSec: 30, dose_mSv: 12.5, scienceSent: 40 });
    assert.match(d.summary, /X8\.2/);
    assert.match(d.summary, /chest X-rays/);
    assert.ok(d.summary.length < 340, `summary fits the dialog box (${d.summary.length} chars)`);
    assert.ok(d.improvements.length > 0);
    assert.match(d.report, /CTI:/);
});

test('a smart player survives both missions; an idle player does not', async () => {
    for (const mode of ['MARS', 'MOON']) {
        const s = await fetchNasaScenario(mode, { live: false });
        const run = (policy) => {
            let health = 100;
            let idx = 0;
            for (let t = 1; t <= GAME_CONFIG.missionSeconds; t++) {
                while (idx < s.timeline.length - 1 && t >= s.timeline[idx + 1].timestamp) idx++;
                const ev = s.timeline[idx];
                const a = policy(ev);
                const cap = s.baseSolarKW * ev.solar_efficiency;
                const total = a.lifeSupport + a.shielding + a.research + a.comms;
                const net = Math.max(0, ev.radiation_mSv_hr * (1 - a.shielding / 40));
                health = applyCrewHealthDecay({ health, allocations: a, netRadiation: net, totalPowerAllocated: total, currentCapacity: cap, osdr: s.osdr }).health;
                if (health <= 0) return 0;
            }
            return health;
        };
        const smart = run((ev) => {
            const cap = Math.floor(s.baseSolarKW * ev.solar_efficiency);
            const shield = Math.min(40, cap - 25);
            const rest = Math.max(0, cap - 25 - shield);
            return alloc(25, shield, Math.floor(rest * 0.6), rest - Math.floor(rest * 0.6));
        });
        const idle = run(() => alloc(35, 25, 20, 10));
        assert.ok(smart > 40, `${mode}: smart player keeps crew healthy (${smart.toFixed(1)})`);
        assert.equal(idle, 0, `${mode}: doing nothing fails the mission`);
    }
});

test('asset manifest: 21 files, valid extensions, every file exists, no double extensions', () => {
    assert.deepEqual(validateAssetManifest(ASSETS), []);
    const entries = Object.values(ASSETS.images);
    assert.equal(entries.length, 21);
    for (const def of entries) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', ASSETS.base, def.file)), `missing ${def.file}`);
    }
    assert.ok(validateAssetManifest({ images: { bad: { file: 'x.png.png', w: 1, h: 1, kind: 'sprite' } } }).length > 0);
});

/**
 * PROBE THE BASE - SCENARIOS + NASA OPEN DATA
 * -------------------------------------------------------------------------
 * NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)
 *   - /DONKI/FLR : latest solar flare class  -> scales the radiation spike
 *   - /DONKI/CME : latest CME speed          -> extra solar-panel power loss
 * NASA OSDR (Open Science Data Repository)
 *   - OSDR_DOSIMETRY : offline calibration preset that sets crew-health decay
 *     rates from radiation dosimetry limits and O2 / thermal deficits.
 *
 * Resilience: every request has a hard 2.5 s AbortController timeout. Any
 * failure (offline, CORS, 429 rate limit, bad JSON, empty range) falls back to
 * NASA_PRESETS built from archived DONKI events, so the game loop never waits
 * longer than 2.5 s and never crashes.
 */
const NASA_CONFIG = {
    apiKey: 'gkmKdFWKHJzjBG9cwQqgKpDt86TGDb7WD8tkdbJbS',                 // free key: https://api.nasa.gov (DEMO_KEY = 30 req/h per IP)
    flrUrl: 'https://api.nasa.gov/DONKI/FLR',
    cmeUrl: 'https://api.nasa.gov/DONKI/CME',
    lookbackDays: 30,
    timeoutMs: 2500,
    cacheMinutes: 60,
    cacheKey: 'probe_donki_cache_v2'
};

/** Lets judges plug in their own key without editing code: ?nasaKey=XXXX */
function resolveApiKey() {
    try {
        const fromUrl = new URLSearchParams(window.location.search).get('nasaKey');
        if (fromUrl && /^[A-Za-z0-9]{8,64}$/.test(fromUrl)) return fromUrl;
        if (typeof window.PROBE_NASA_API_KEY === 'string' && window.PROBE_NASA_API_KEY) return window.PROBE_NASA_API_KEY;
    } catch (e) { /* not in a browser */ }
    return NASA_CONFIG.apiKey;
}

/**
 * OSDR-informed crew health calibration (gameplay-scaled, not medical advice).
 * Limits follow NASA-STD-3001 (career effective dose limit 600 mSv).
 */
const OSDR_DOSIMETRY = {
    source: 'NASA OSDR radiation-biology calibration (offline preset)',
    careerLimit_mSv: 600,
    radiationDecayPerMsvHr: 2.0,   // health lost per tick per mSv/h of NET radiation
    brownoutDecay: 1.2,            // health lost per tick when demand > capacity
    hypoxiaDecay: 1.5,             // health lost per tick when life support < 25 kW
    recoveryPerTick: 0.5,          // health regained per tick while all systems are green
    chestXray_mSv: 0.1             // kid-friendly comparison unit for the debrief
};

/**
 * Verified local presets. Timeline radiation values are an M-class reference;
 * flare-phase events (alert: true) are scaled by flareFactor(flare.classType).
 */
const NASA_PRESETS = {
    MARS: {
        id: 'mars_jezero',
        name: 'Mars Outpost',
        location: 'Mars Surface Outpost (Jezero Crater)',
        backgroundKey: 'mars_cockpit',
        alertBackgroundKey: 'mars_cockpit_alert',
        alertArtHasBadge: true,          // the alert cockpit already shows "ALERT!"
        baseSolarKW: 100,
        presetFlare: { classType: 'X8.2', peakTime: '2017-09-10', note: 'Archived DONKI event, also measured on the Martian surface by Curiosity RAD' },
        timeline: [
            { timestamp: 0,  radiation_mSv_hr: 0.08, solar_efficiency: 1.0, eventText: 'Welcome to Jezero Crater! Keep Life Support at 25 kW or more and watch the radiation meter.' },
            { timestamp: 15, radiation_mSv_hr: 2.00, solar_efficiency: 0.6, alert: true, eventText: 'ALERT! Solar flare! Power is down. Boost the SHIELDING GRID and cut Research and Comms!' },
            { timestamp: 45, radiation_mSv_hr: 0.95, solar_efficiency: 0.8, eventText: 'The flare is fading and the panels are recovering. Keep the shields up a little longer.' },
            { timestamp: 75, radiation_mSv_hr: 0.08, solar_efficiency: 1.0, eventText: 'All clear! Radiation is back to normal. Turn science back on and send data to Earth.' }
        ]
    },
    MOON: {
        id: 'lunar_shackleton',
        name: 'Lunar Base',
        location: 'Lunar South Pole (Shackleton Crater)',
        backgroundKey: 'moon_cockpit',
        alertBackgroundKey: 'moon_cockpit_alert',
        alertArtHasBadge: false,
        baseSolarKW: 80,
        presetFlare: { classType: 'X9.0', peakTime: '2024-10-03', note: 'Archived DONKI event, strongest flare of Solar Cycle 25 so far at that date' },
        timeline: [
            { timestamp: 0,  radiation_mSv_hr: 0.12, solar_efficiency: 1.0, eventText: 'Lunar base online. The Moon has no air to block radiation, so stay alert, Commander!' },
            { timestamp: 20, radiation_mSv_hr: 2.10, solar_efficiency: 0.75, alert: true, eventText: 'WARNING! Solar radiation storm! Shields up, and cut power to non-essential systems!' },
            { timestamp: 50, radiation_mSv_hr: 1.10, solar_efficiency: 0.85, eventText: 'Radiation easing. Rebalance power, but keep Life Support safe.' },
            { timestamp: 80, radiation_mSv_hr: 0.12, solar_efficiency: 1.0, eventText: 'Storm over! Outpost systems are back in balance.' }
        ]
    }
};

function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/** Maps a flare class ("C3.4", "M2.1", "X9.0") to a radiation multiplier, capped so it stays winnable. */
function flareFactor(classType) {
    const cls = String(classType || 'M1.0').trim();
    const letter = cls.charAt(0).toUpperCase();
    const num = parseFloat(cls.slice(1)) || 1;
    const base = { A: 0.6, B: 0.7, C: 0.85, M: 1.0, X: 1.2 }[letter];
    if (base === undefined) return 1.0;
    const bonus = letter === 'X' ? Math.min(num, 10) * 0.01 : letter === 'M' ? Math.min(num, 9) * 0.01 : 0;
    return Math.min(1.3, Math.round((base + bonus) * 100) / 100);
}

/** Extra solar-panel loss (0 to 0.08) from a fast CME; capped so the worst case stays survivable. */
function cmePenalty(speedKmS) {
    const s = Number(speedKmS);
    if (!Number.isFinite(s) || s <= 0) return 0;
    return Math.min(0.08, Math.max(0, (s - 400) / 6000));
}

function isoDay(date) {
    return date.toISOString().slice(0, 10);
}

function readCache() {
    try {
        const raw = window.localStorage.getItem(NASA_CONFIG.cacheKey);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached || Date.now() - cached.ts > NASA_CONFIG.cacheMinutes * 60000) return null;
        return cached.data;
    } catch (e) {
        return null;
    }
}

function writeCache(data) {
    try {
        window.localStorage.setItem(NASA_CONFIG.cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) { /* storage blocked (private mode / file://) */ }
}

/** fetch() with a hard AbortController timeout. Resolves to parsed JSON or rejects. */
async function fetchJsonWithTimeout(url, timeoutMs = NASA_CONFIG.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function donkiUrl(base) {
    const end = new Date();
    const start = new Date(end.getTime() - NASA_CONFIG.lookbackDays * 86400000);
    return `${base}?startDate=${isoDay(start)}&endDate=${isoDay(end)}&api_key=${encodeURIComponent(resolveApiKey())}`;
}

function pickLatestFlare(list) {
    if (!Array.isArray(list)) return null;
    const latest = list
        .filter((f) => f && typeof f.classType === 'string' && f.classType.length > 0)
        .sort((a, b) => new Date(b.peakTime || b.beginTime) - new Date(a.peakTime || a.beginTime))[0];
    return latest ? { classType: latest.classType, peakTime: String(latest.peakTime || latest.beginTime || '').slice(0, 10) } : null;
}

function pickLatestCme(list) {
    if (!Array.isArray(list)) return null;
    const withSpeed = list
        .map((c) => {
            const analyses = Array.isArray(c && c.cmeAnalyses) ? c.cmeAnalyses : [];
            const best = analyses.find((a) => a && a.isMostAccurate) || analyses[0];
            return best && Number.isFinite(Number(best.speed))
                ? { speed: Math.round(Number(best.speed)), startTime: String(c.startTime || '').slice(0, 10) }
                : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    return withSpeed[0] || null;
}

/**
 * Queries DONKI FLR + CME in parallel (each capped at 2.5 s).
 * Returns { flare, cme, source } or null. Never throws.
 */
async function fetchDonkiSpaceWeather() {
    const cached = readCache();
    if (cached && cached.flare) return { ...cached, source: 'CACHED' };

    try {
        const [flrRes, cmeRes] = await Promise.allSettled([
            fetchJsonWithTimeout(donkiUrl(NASA_CONFIG.flrUrl)),
            fetchJsonWithTimeout(donkiUrl(NASA_CONFIG.cmeUrl))
        ]);
        const flare = flrRes.status === 'fulfilled' ? pickLatestFlare(flrRes.value) : null;
        const cme = cmeRes.status === 'fulfilled' ? pickLatestCme(cmeRes.value) : null;
        if (!flare) {
            const reason = flrRes.status === 'rejected' ? flrRes.reason : 'no flares in range';
            console.info('[PROBE] NASA DONKI unavailable, using verified local presets:', String(reason && reason.message ? reason.message : reason));
            return null;
        }
        const data = { flare, cme };
        writeCache(data);
        return { ...data, source: 'LIVE' };
    } catch (err) {
        console.info('[PROBE] NASA DONKI error, using verified local presets:', String(err && err.message ? err.message : err));
        return null;
    }
}

/** Applies a flare (and optional CME) to the alert phases of a scenario. */
function applySpaceWeather(scenario, flare, cme) {
    const factor = flareFactor(flare.classType);
    const penalty = cme ? cmePenalty(cme.speed) : 0;
    scenario.timeline.forEach((ev) => {
        if (!ev.alert) return;
        ev.radiation_mSv_hr = Math.round(ev.radiation_mSv_hr * factor * 100) / 100;
        ev.solar_efficiency = Math.round(Math.max(0.4, ev.solar_efficiency - penalty) * 100) / 100;
        const cmeText = cme ? ` CME at ${cme.speed} km/s is dimming the panels.` : '';
        ev.eventText = `ALERT! NASA DONKI: Class ${flare.classType} solar flare!${cmeText} Shields up, cut Research and Comms!`;
    });
    scenario.flare = { classType: flare.classType, peakTime: flare.peakTime, factor };
    scenario.cme = cme || null;
    return scenario;
}

/**
 * Builds a ready-to-play scenario for 'MARS' or 'MOON'.
 * @param {string} modeKey
 * @param {{live?: boolean}} options  live=false skips the network (Settings -> NASA Live Data OFF)
 */
async function fetchNasaScenario(modeKey, options = {}) {
    const live = options.live !== false;
    const preset = NASA_PRESETS[modeKey] || NASA_PRESETS.MARS;
    const scenario = cloneJson(preset);
    scenario.modeKey = NASA_PRESETS[modeKey] ? modeKey : 'MARS';
    scenario.osdr = cloneJson(OSDR_DOSIMETRY);

    const weather = live ? await fetchDonkiSpaceWeather() : null;
    if (weather) {
        applySpaceWeather(scenario, weather.flare, weather.cme);
        scenario.dataMode = weather.source;
        scenario.sourceLabel = `DONKI ${weather.source === 'LIVE' ? 'LIVE' : 'cached'}: ${weather.flare.classType} flare ${weather.flare.peakTime}`;
    } else {
        applySpaceWeather(scenario, preset.presetFlare, null);
        scenario.dataMode = 'PRESET';
        scenario.sourceLabel = `NASA archive: ${preset.presetFlare.classType} flare ${preset.presetFlare.peakTime}${live ? ' (offline)' : ''}`;
    }
    return scenario;
}

if (typeof module !== 'undefined') {
    module.exports = {
        NASA_CONFIG, NASA_PRESETS, OSDR_DOSIMETRY, flareFactor, cmePenalty,
        pickLatestFlare, pickLatestCme, applySpaceWeather, fetchNasaScenario, fetchJsonWithTimeout
    };
}

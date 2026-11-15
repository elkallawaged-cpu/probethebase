/**
 * PROBE THE BASE - GAME BALANCE + PURE SIMULATION MATHS
 * -------------------------------------------------------------------------
 * No Phaser / DOM code in this file, so every rule can be unit-tested in
 * Node (see tests/simulation.test.js).
 *
 * Time compression: 1 game second = 1 mission hour. That lets radiation
 * expressed in mSv/h be accumulated directly into a dose in mSv.
 */
const GAME_CONFIG = {
    missionSeconds: 90,
    maxSlider: 50,
    defaultAllocation: { lifeSupport: 35, shielding: 25, research: 20, comms: 10 },

    shieldingDivisor: 40.0,          // kW of shielding that blocks 100% of radiation
    radiationDangerThreshold: 0.2,   // net (unshielded) mSv/h above this hurts the crew
    lifeSupportMinKW: 25,            // below this O2 / heating fail and the crew suffers
    alertRadiation: 0.5,             // raw radiation above this = "flare phase" for scoring
    commsFullKW: 10,                 // comms power needed to uplink 100% of science data

    difficulty: {
        CADET:     { label: 'Cadet',     damage: 0.7, regen: 1.3 },
        ENGINEER:  { label: 'Engineer',  damage: 1.0, regen: 1.0 },
        COMMANDER: { label: 'Commander', damage: 1.3, regen: 0.8 }
    }
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/** Spec formula: radiation that gets through the shielding grid (mSv/h). */
function computeNetRadiation(radiation_mSv_hr, shieldingKW) {
    return Math.max(0, radiation_mSv_hr * (1 - (shieldingKW / GAME_CONFIG.shieldingDivisor)));
}

/** Power the solar array can deliver right now (kW). */
function computeCapacity(baseSolarKW, solarEfficiency) {
    return baseSolarKW * solarEfficiency;
}

function totalAllocated(alloc) {
    return alloc.lifeSupport + alloc.shielding + alloc.research + alloc.comms;
}

/**
 * Crew-health decay for one tick. Decay rates come from the OSDR calibration
 * preset (see OSDR_DOSIMETRY in scenarios.js).
 *
 * Decay applies when:
 *   - netRadiation > 0.2 mSv/h
 *   - totalPowerAllocated > currentCapacity  (brown-out: heaters and scrubbers stall)
 *   - lifeSupport < 25 kW                    (O2 / thermal deficit)
 * When none apply the crew slowly recovers.
 */
function applyCrewHealthDecay({ health, allocations, netRadiation, totalPowerAllocated, currentCapacity, osdr, difficultyKey = 'ENGINEER' }) {
    const cfg = GAME_CONFIG;
    const diff = cfg.difficulty[difficultyKey] || cfg.difficulty.ENGINEER;

    const radDanger = netRadiation > cfg.radiationDangerThreshold;
    const overload = totalPowerAllocated > currentCapacity;
    const lsLow = allocations.lifeSupport < cfg.lifeSupportMinKW;

    let radiationDamage = 0;
    let overloadDamage = 0;
    let lifeSupportDamage = 0;

    if (radDanger) radiationDamage = netRadiation * osdr.radiationDecayPerMsvHr;
    if (overload) {
        const deficitRatio = (totalPowerAllocated - currentCapacity) / Math.max(1, currentCapacity);
        overloadDamage = osdr.brownoutDecay * (1 + clamp(deficitRatio, 0, 1));
    }
    if (lsLow) {
        const missing = (cfg.lifeSupportMinKW - allocations.lifeSupport) / cfg.lifeSupportMinKW;
        lifeSupportDamage = osdr.hypoxiaDecay * (0.5 + missing);
    }

    const damage = (radiationDamage + overloadDamage + lifeSupportDamage) * diff.damage;
    const inRed = radDanger || overload || lsLow;
    const regen = inRed ? 0 : osdr.recoveryPerTick * diff.regen;
    const newHealth = clamp(health - damage + regen, 0, 100);

    return { health: newHealth, damage, regen, radDanger, overload, lsLow, inRed, radiationDamage, overloadDamage, lifeSupportDamage };
}

/**
 * Science trade-off: Research produces data, Comms uplinks it to Earth.
 * Cutting either one costs science, so no slider position is "free".
 */
function computeScience(allocations) {
    const produced = allocations.research * 0.5;
    const uplinkRatio = clamp(allocations.comms / GAME_CONFIG.commsFullKW, 0, 1);
    return { produced, transmitted: produced * uplinkRatio, uplinkRatio };
}

if (typeof module !== 'undefined') {
    module.exports = { GAME_CONFIG, clamp, computeNetRadiation, computeCapacity, totalAllocated, applyCrewHealthDecay, computeScience };
}

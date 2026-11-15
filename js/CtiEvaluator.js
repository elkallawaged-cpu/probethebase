/**
 * PROBE THE BASE - AI SCORING ENGINE + AI MISSION ANALYST
 * -------------------------------------------------------------------------
 * Critical Thinking Index (CTI)
 *   CTI = 100 * (0.40 * S_diag + 0.35 * S_eff + 0.25 * S_stab)
 *
 *   S_diag  Diagnostic Speed     latency (s) from flare alert to the first slider move.
 *                                <= 2 s -> 1.0, >= 15 s -> 0.0, linear in between.
 *   S_eff   Resource Efficiency  share of power on critical survival systems
 *                                (Life Support + Shielding) vs non-essential
 *                                (Research + Comms) while a flare is active.
 *   S_stab  System Stability     share of mission seconds spent in the green band
 *                                (no radiation danger, no overload, life support OK).
 *
 * MissionAnalyst
 *   An on-device, explainable "AI analyst" (rule-based expert system): it reads
 *   the per-second telemetry log and the CTI components and writes a short,
 *   kid-friendly debrief: what went well, what to try next, and the crew's
 *   radiation dose in chest-X-ray units. No network, no personal data.
 */
const CTI_DEFAULTS = {
    wDiag: 0.40,
    wEff: 0.35,
    wStab: 0.25,
    graceSec: 2,
    maxReactSec: 15
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

class CtiEvaluator {
    constructor(cfg = CTI_DEFAULTS) {
        this.cfg = cfg;
        this.reset();
    }

    reset() {
        this.reactionTimes = [];
        this.anomalyStart = null;
        this.anomalies = 0;
        this.ticks = 0;
        this.greenTicks = 0;
        this.alertTotalKW = 0;
        this.alertCriticalKW = 0;
        this.log = [];
    }

    /** Flare alert fired at mission time t (seconds, may be fractional). */
    recordAnomalyTriggered(t) {
        if (this.anomalyStart !== null) this.reactionTimes.push(Math.max(0, t - this.anomalyStart));
        this.anomalyStart = t;
        this.anomalies++;
    }

    /** First slider movement after an alert closes the latency window. */
    recordFirstAction(t) {
        if (this.anomalyStart === null) return;
        this.reactionTimes.push(Math.max(0, t - this.anomalyStart));
        this.anomalyStart = null;
    }

    updateTick({ inRed, inAlert, alloc, t, health, radiation, netRadiation, capacity, total }) {
        this.ticks++;
        if (!inRed) this.greenTicks++;
        if (inAlert) {
            this.alertTotalKW += alloc.lifeSupport + alloc.shielding + alloc.research + alloc.comms;
            this.alertCriticalKW += alloc.lifeSupport + alloc.shielding;
        }
        this.log.push({
            t, health: Math.round(health * 10) / 10, radiation, netRadiation: Math.round(netRadiation * 100) / 100,
            capacity: Math.round(capacity), total, inRed, inAlert, ...alloc
        });
    }

    calculate(durationSec) {
        const cfg = this.cfg;

        const times = [...this.reactionTimes];
        if (this.anomalyStart !== null) times.push(Math.max(0, durationSec - this.anomalyStart));
        let avgReact = null;
        let sDiag = 1;
        if (times.length > 0) {
            avgReact = times.reduce((a, b) => a + b, 0) / times.length;
            sDiag = clamp01(1 - Math.max(0, avgReact - cfg.graceSec) / (cfg.maxReactSec - cfg.graceSec));
        }

        let sEff = 1;
        if (this.anomalies > 0 || this.alertTotalKW > 0) {
            sEff = this.alertTotalKW > 0 ? clamp01(this.alertCriticalKW / this.alertTotalKW) : 0;
        }

        const sStab = this.ticks > 0 ? clamp01(this.greenTicks / this.ticks) : 1;

        const score = Math.round(100 * (cfg.wDiag * sDiag + cfg.wEff * sEff + cfg.wStab * sStab));

        let rank = 'Cadet';
        if (score >= 85) rank = 'Outpost Commander';
        else if (score >= 70) rank = 'Flight Engineer';
        else if (score >= 50) rank = 'Mission Specialist';

        return {
            score,
            sDiag: Math.round(sDiag * 100),
            sEff: Math.round(sEff * 100),
            sStab: Math.round(sStab * 100),
            avgReact: avgReact === null ? null : Math.round(avgReact * 10) / 10,
            anomalies: this.anomalies,
            answered: this.reactionTimes.length,
            rank
        };
    }
}

class MissionAnalyst {
    /**
     * @param {object} p
     * @param {object} p.results     output of CtiEvaluator.calculate()
     * @param {Array}  p.log         CtiEvaluator.log
     * @param {object} p.scenario    scenario from fetchNasaScenario()
     * @param {boolean} p.success
     * @param {number} p.elapsedSec
     * @param {number} p.dose_mSv    cumulative net dose
     * @param {number} p.scienceSent science points uplinked to Earth
     * @returns {{headline:string, summary:string, strengths:string[], improvements:string[], report:string}}
     */
    static analyze(p) {
        const { results, log, scenario, success, elapsedSec, dose_mSv, scienceSent } = p;
        const flare = scenario.flare ? scenario.flare.classType : 'solar';
        const xrays = Math.round(dose_mSv / scenario.osdr.chestXray_mSv);
        const alertTicks = log.filter((r) => r.inAlert);
        const overloadTicks = log.filter((r) => r.total > r.capacity).length;
        const lowLsTicks = log.filter((r) => r.lifeSupport < 25).length;
        const radTicks = log.filter((r) => r.netRadiation > 0.2).length;
        const peakNet = log.reduce((m, r) => Math.max(m, r.netRadiation), 0);
        const avgShieldAlert = alertTicks.length
            ? Math.round(alertTicks.reduce((s, r) => s + r.shielding, 0) / alertTicks.length)
            : 0;

        const strengths = [];
        const improvements = [];

        if (results.avgReact !== null && results.sDiag >= 85) strengths.push(`lightning-fast reaction (${results.avgReact}s)`);
        if (results.sEff >= 80) strengths.push(`${results.sEff}% of storm power on survival systems`);
        if (results.sStab >= 75) strengths.push(`base stayed green ${results.sStab}% of the time`);
        if (scienceSent >= 300) strengths.push(`${Math.round(scienceSent)} science points sent to Earth`);

        if (results.answered === 0 || results.sDiag < 70) improvements.push('move a slider within 2 seconds of an alert');
        if (results.sEff < 70) improvements.push('cut Research and Comms first when a flare hits');
        if (overloadTicks > 5) improvements.push('keep total power under the capacity number');
        if (lowLsTicks > 3) improvements.push('never drop Life Support below 25 kW');
        if (radTicks > 8 && avgShieldAlert < 35) improvements.push(`raise Shielding to about 35 kW during flares (you averaged ${avgShieldAlert} kW)`);
        if (scienceSent < 150) improvements.push('turn Research and Comms back on once the storm passes');

        const headline = success
            ? `${results.rank.toUpperCase()}: mission complete`
            : `Crew evacuated at ${elapsedSec}s: let's learn from it`;

        let reactPart = `You reacted to the ${flare} flare in ${results.avgReact}s.`;
        if (results.anomalies === 0) reactPart = 'No flare alerts reached the base this time.';
        else if (results.answered === 0) reactPart = `No slider moved after the ${flare} flare alert.`;
        const effPart = `${results.sEff}% of storm power went to Life Support + Shielding, and the base was green ${results.sStab}% of the time.`;
        const dosePart = `Crew dose: ${dose_mSv.toFixed(1)} mSv (about ${xrays} chest X-rays).`;
        const nextPart = improvements.length
            ? `Next time: ${improvements[0]}.`
            : 'Next time: try Commander difficulty!';
        const summary = `${reactPart} ${effPart} ${dosePart} ${nextPart}`;

        const report = [
            'PROBE THE BASE - AI MISSION DEBRIEF',
            `Mission: ${scenario.location}`,
            `Data: ${scenario.sourceLabel}`,
            `Outcome: ${success ? 'SUCCESS' : 'FAILED'} after ${elapsedSec}s`,
            `CTI: ${results.score} (${results.rank})`,
            `  Diagnostic speed: ${results.sDiag}%  | avg reaction: ${results.avgReact === null ? 'n/a' : results.avgReact + 's'}`,
            `  Resource efficiency: ${results.sEff}%`,
            `  System stability: ${results.sStab}%`,
            `Peak net radiation: ${peakNet.toFixed(2)} mSv/h`,
            `Crew dose: ${dose_mSv.toFixed(2)} mSv (${((dose_mSv / scenario.osdr.careerLimit_mSv) * 100).toFixed(2)}% of the 600 mSv NASA career limit)`,
            `Science sent to Earth: ${Math.round(scienceSent)} pts`,
            '',
            `Strengths: ${strengths.length ? strengths.join('; ') : 'keep practising, every flare teaches something'}`,
            `To improve: ${improvements.length ? improvements.join('; ') : 'nothing major, excellent balance'}`,
            '',
            'Summary:',
            summary
        ].join('\n');

        return { headline, summary, strengths, improvements, report };
    }
}

if (typeof module !== 'undefined') module.exports = { CtiEvaluator, MissionAnalyst, CTI_DEFAULTS };

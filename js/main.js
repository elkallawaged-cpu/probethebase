/**
 * PROBE THE BASE - Junior Astronaut Trainer (NASA Space Apps Challenge)
 * -------------------------------------------------------------------------
 * Scene flow:
 *   BootScene -> TitleScene -> (START) ModeSelectScene -> MainGameScene
 *                                      (optional PROBE Academy tutorial + quiz)
 *                           -> (OPTIONS) SettingsScene
 *                           -> (QUIT) QuitScene
 *
 * Canvas: fixed 1280x720 inside #game-container. The whole stage (canvas +
 * Tailwind HUD) is scaled as one unit with a CSS transform so nothing is
 * ever clipped and the HUD always lines up with the canvas.
 */
const W = 1280;
const H = 720;
const CX = W / 2;
const CY = H / 2;
const FONT = 'Segoe UI, Inter, system-ui, -apple-system, sans-serif';

/* Layout constants (all values in 1280x720 game pixels). */
const LAYOUT = {
    alertBadge: { x: 640, y: 220, w: 260 },
    // dialog_box is a 9-slice; its frame stroke sits 36 px below the sprite top and 47 px above
    // the bottom, so textY is the visual centre of the frame interior.
    dialog:     { x: 640, y: 650, w: 900, h: 140, textY: 645, alpha: 0.88 },
    // card_welcome is cropped to its title band so it reads as a banner, not a box.
    welcome:    { x: 640, y: 114, scale: 0.62, crop: { x: 30, y: 118, w: 830, h: 150 } },
    academyRowY: 214,
    subtitleY:  286,
    planets:    { y: 418, size: 200, marsX: 420, moonX: 860 },
    banners:    { y: 568, scale: 0.75 },
    infoY:      636,
    result: {
        card:   { x: 640, y: 360, scale: 0.85 },
        badgeComplete: { x: 640, y: 82, w: 380 },
        medal:  { x: 640, y: 248, size: 116 },
        ctiY:   450,
        buttonsY: 520,
        analystHeaderY: 574,
        dialog: { x: 640, y: 636, w: 960, h: 160, textY: 631 }
    }
};

let telemetryChartInstance = null;
const $ = (id) => document.getElementById(id);

/* ======================================================================= */
/* Settings (persisted)                                                    */
/* ======================================================================= */
const Settings = {
    key: 'probe_settings_v1',
    data: { sound: true, live: true, difficulty: 'ENGINEER', tutorial: 'AUTO', quiz: true },
    load() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(this.key) || '{}');
            this.data = { ...this.data, ...saved };
            if (!GAME_CONFIG.difficulty[this.data.difficulty]) this.data.difficulty = 'ENGINEER';
            if (!['AUTO', 'ALWAYS', 'OFF'].includes(this.data.tutorial)) this.data.tutorial = 'AUTO';
            this.data.quiz = this.data.quiz !== false;
        } catch (e) { /* storage blocked */ }
        return this.data;
    },
    save() {
        try { window.localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
    }
};
Settings.load();

const History = {
    key: 'probe_history_v1',
    all() {
        try { return JSON.parse(window.localStorage.getItem(this.key) || '[]'); } catch (e) { return []; }
    },
    push(entry) {
        try {
            const list = this.all();
            list.push(entry);
            window.localStorage.setItem(this.key, JSON.stringify(list.slice(-30)));
        } catch (e) { /* storage blocked */ }
    },
    best() {
        return this.all().reduce((m, r) => Math.max(m, r.score || 0), 0);
    }
};

const hasAcademy = () => typeof window.ProbeAcademy !== 'undefined';

/** Should this flight start with the Probe tutorial? (Settings -> Practice with Probe) */
function tutorialWanted() {
    if (!hasAcademy()) return false;
    if (Settings.data.tutorial === 'ALWAYS') return true;
    if (Settings.data.tutorial === 'OFF') return false;
    return ProbeAcademy.isFirstRun() && History.all().length === 0;
}

function openManual() {
    try { window.open('manual/', '_blank', 'noopener'); } catch (e) { console.info('[PROBE] Could not open manual:', e.message); }
}

/* ======================================================================= */
/* Sound: synthesised with the Web Audio API (no audio files, no 404s)     */
/* ======================================================================= */
const Sfx = {
    hum: null,

    ctx(scene) {
        const mgr = scene && scene.sound;
        const ctx = mgr && mgr.context;
        if (!ctx || ctx.state !== 'running' || mgr.mute || !Settings.data.sound) return null;
        return ctx;
    },

    dest(scene) {
        const mgr = scene.sound;
        return mgr.destination || mgr.masterMuteNode || mgr.context.destination;
    },

    tone(scene, { freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.15, delay = 0 }) {
        const ctx = this.ctx(scene);
        if (!ctx) return;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(this.dest(scene));
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    },

    play(scene, name) {
        switch (name) {
            case 'click':
                this.tone(scene, { freq: 660, to: 990, type: 'triangle', dur: 0.08, vol: 0.12 });
                break;
            case 'hover':
                this.tone(scene, { freq: 520, type: 'sine', dur: 0.05, vol: 0.05 });
                break;
            case 'alert':
                [0, 0.32, 0.64].forEach((d) => this.tone(scene, { freq: 880, to: 440, type: 'sawtooth', dur: 0.28, vol: 0.09, delay: d }));
                break;
            case 'success':
                [523, 659, 784, 1047].forEach((f, i) => this.tone(scene, { freq: f, type: 'triangle', dur: 0.25, vol: 0.13, delay: i * 0.12 }));
                break;
            case 'fail':
                [392, 330, 262, 196].forEach((f, i) => this.tone(scene, { freq: f, type: 'square', dur: 0.3, vol: 0.06, delay: i * 0.18 }));
                break;
            case 'tick':
                this.tone(scene, { freq: 1200, type: 'sine', dur: 0.03, vol: 0.03 });
                break;
            default:
                break;
        }
    },

    startHum(scene) {
        this.stopHum();
        const ctx = this.ctx(scene);
        if (!ctx) return;
        const gain = ctx.createGain();
        gain.gain.value = 0.025;
        const a = ctx.createOscillator();
        const b = ctx.createOscillator();
        a.type = 'sine'; a.frequency.value = 55;
        b.type = 'sine'; b.frequency.value = 55.8;
        a.connect(gain); b.connect(gain);
        gain.connect(this.dest(scene));
        a.start(); b.start();
        this.hum = { a, b, gain };
    },

    stopHum() {
        if (!this.hum) return;
        try { this.hum.a.stop(); this.hum.b.stop(); this.hum.gain.disconnect(); } catch (e) { /* already stopped */ }
        this.hum = null;
    }
};

/* ======================================================================= */
/* Phaser helpers                                                          */
/* ======================================================================= */

/** Full 1280x720 art: always anchored at (640, 360) with setDisplaySize(1280, 720). */
function addFullscreen(scene, key) {
    return scene.add.image(CX, CY, key).setOrigin(0.5).setDisplaySize(W, H);
}

function txt(scene, x, y, str, style = {}) {
    return scene.add.text(x, y, str, {
        fontFamily: FONT, fontSize: '16px', color: '#e2f6ff', resolution: 2, ...style
    });
}

/** Rounded glass button. Graphics for looks, a Zone for precise clicks. */
function glassButton(scene, x, y, label, onClick, opts = {}) {
    const w = opts.w || 170;
    const h = opts.h || 44;
    const g = scene.add.graphics();
    const draw = (hover) => {
        g.clear();
        g.fillStyle(hover ? 0x3b2f5c : 0x2a2240, 0.95);
        g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
        g.lineStyle(2, hover ? 0x00f0ff : 0xeceef4, 1);
        g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    };
    draw(false);
    const t = txt(scene, x, y, label, { fontSize: opts.fontSize || '17px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); t.setColor('#00f0ff'); Sfx.play(scene, 'hover'); });
    zone.on('pointerout', () => { draw(false); t.setColor('#ffffff'); });
    zone.on('pointerdown', () => { Sfx.play(scene, 'click'); onClick(); });
    const depth = opts.depth || 20;
    g.setDepth(depth); t.setDepth(depth + 1); zone.setDepth(depth + 2);
    return { g, t, zone };
}

function starfield(scene) {
    scene.add.rectangle(CX, CY, W, H, 0x050b1f);
    const g = scene.add.graphics();
    for (let i = 0; i < 140; i++) {
        g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.2, 0.9));
        g.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.FloatBetween(0.6, 1.8));
    }
}

/** Scales an image to a target width keeping proportions; remembers base scale for hover tweens. */
function fitWidth(img, width) {
    img.setScale(width / img.width);
    img.baseScale = img.scaleX;
    return img;
}

/* ======================================================================= */
/* BootScene: load, validate, unlock audio                                 */
/* ======================================================================= */
class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    preload() {
        const problems = validateAssetManifest(ASSETS);
        if (problems.length) console.warn('[PROBE] Asset manifest problems:', problems);

        txt(this, CX, CY - 40, 'LOADING MISSION DATA...', { fontSize: '22px', color: '#00f0ff', fontStyle: 'bold' }).setOrigin(0.5);
        const frame = this.add.graphics();
        frame.lineStyle(2, 0x00f0ff, 0.6).strokeRoundedRect(CX - 204, CY - 6, 408, 22, 11);
        const bar = this.add.graphics();
        this.load.on('progress', (v) => {
            bar.clear();
            bar.fillStyle(0x00f0ff, 1);
            bar.fillRoundedRect(CX - 200, CY - 2, Math.max(14, 400 * v), 14, 7);
        });

        this.missing = [];
        this.load.on('loaderror', (file) => this.missing.push(file.key));

        this.load.setPath(ASSETS.base);
        Object.entries(ASSETS.images).forEach(([key, def]) => {
            if (def.kind === 'spritesheet') this.load.spritesheet(key, def.file, def.frame);
            else this.load.image(key, def.file);
        });
    }

    create() {
        // Placeholder texture for anything that failed to load: the game never crashes.
        Object.entries(ASSETS.images).forEach(([key, def]) => {
            if (this.textures.exists(key) && !this.missing.includes(key)) return;
            if (this.textures.exists(key)) this.textures.remove(key);
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0x0b1220, 1).fillRect(0, 0, def.w, def.h);
            g.lineStyle(3, 0x00f0ff, 0.6).strokeRect(2, 2, def.w - 4, def.h - 4);
            g.generateTexture(key, def.w, def.h);
            g.destroy();
            if (def.kind === 'spritesheet') {
                const tex = this.textures.get(key);
                const n = Math.floor(def.w / def.frame.frameWidth);
                for (let i = 0; i < n; i++) tex.add(i, 0, i * def.frame.frameWidth, 0, def.frame.frameWidth, def.frame.frameHeight);
            }
        });
        if (this.missing.length) console.warn('[PROBE] Missing assets (placeholders used):', this.missing.join(', '));

        // Tap-to-begin gate: the first user gesture unlocks the Web Audio context.
        this.children.removeAll(true);
        Fade.enter(this, 300);
        starfield(this);
        txt(this, CX, CY - 30, 'PROBE THE BASE', { fontSize: '44px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        const prompt = txt(this, CX, CY + 40, 'TAP OR CLICK TO BEGIN TRAINING', { fontSize: '20px', color: '#00f0ff', fontStyle: 'bold' }).setOrigin(0.5);
        this.tweens.add({ targets: prompt, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
        txt(this, CX, H - 40, 'NASA Space Apps Challenge  |  Live data: NASA DONKI  |  Crew model: NASA OSDR', { fontSize: '13px', color: '#7f93b5' }).setOrigin(0.5);

        let started = false;
        const begin = () => {
            if (started) return;
            started = true;
            // Resume the AudioContext inside the gesture (fire-and-forget: some browsers
            // never settle the promise when no audio device exists, so we do not wait on it).
            const ctx = this.sound && this.sound.context;
            if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
            this.time.delayedCall(60, () => { Sfx.play(this, 'click'); Fade.go(this, 'TitleScene'); });
        };
        this.input.once('pointerdown', begin);
        this.input.keyboard.once('keydown', begin);
    }
}

/* ======================================================================= */
/* TitleScene: logo + START / OPTIONS / QUIT                               */
/* ======================================================================= */
class TitleScene extends Phaser.Scene {
    constructor() { super('TitleScene'); }

    create() {
        Fade.enter(this);
        const logo = addFullscreen(this, 'logo_title');
        const buttons = addFullscreen(this, 'menu_buttons');
        // Logo drifts in first, the START / OPTIONS / QUIT buttons follow.
        Fade.reveal(this, [logo, buttons], { duration: 650, stagger: 420 });

        const twinkle = this.add.graphics();
        this.time.addEvent({
            delay: 450, loop: true, callback: () => {
                twinkle.clear();
                for (let i = 0; i < 6; i++) {
                    twinkle.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.4, 1));
                    twinkle.fillCircle(Phaser.Math.Between(20, W - 20), Phaser.Math.Between(20, 240), Phaser.Math.FloatBetween(0.8, 2));
                }
            }
        });

        const actions = {
            start: () => Fade.go(this, 'ModeSelectScene'),
            options: () => Fade.go(this, 'SettingsScene'),
            quit: () => Fade.go(this, 'QuitScene')
        };
        const order = ['start', 'options', 'quit'];
        const highlight = this.add.graphics();
        let focus = 0;

        const showFocus = (i) => {
            focus = i;
            const z = MENU_BUTTON_ZONES[order[i]];
            highlight.clear();
            highlight.lineStyle(4, 0x00f0ff, 0.9);
            highlight.strokeRoundedRect(z.x - z.w / 2 - 6, z.y - z.h / 2 - 4, z.w + 12, z.h + 8, (z.h + 8) / 2);
        };

        order.forEach((name, i) => {
            const z = MENU_BUTTON_ZONES[name];
            const zone = this.add.zone(z.x, z.y, z.w, z.h).setInteractive({ useHandCursor: true });
            zone.on('pointerover', () => { showFocus(i); Sfx.play(this, 'hover'); });
            zone.on('pointerout', () => highlight.clear());
            zone.on('pointerdown', () => { Sfx.play(this, 'click'); actions[name](); });
        });

        txt(this, CX, 700, 'Arrow keys + ENTER also work  |  H opens the mission manual  |  Built for the NASA Space Apps Challenge', { fontSize: '13px', color: '#9fb6d6' }).setOrigin(0.5);

        const kb = this.input.keyboard;
        kb.on('keydown-LEFT', () => showFocus((focus + 2) % 3));
        kb.on('keydown-RIGHT', () => showFocus((focus + 1) % 3));
        kb.on('keydown-ENTER', () => { Sfx.play(this, 'click'); actions[order[focus]](); });
        kb.on('keydown-O', actions.options);
        kb.on('keydown-H', openManual);
    }
}

/* ======================================================================= */
/* SettingsScene: sound, live NASA data, difficulty, subsystem guide       */
/* ======================================================================= */
class SettingsScene extends Phaser.Scene {
    constructor() { super('SettingsScene'); }

    create() {
        Fade.enter(this);
        addFullscreen(this, 'settings_frame');
        fitWidth(this.add.image(CX, 188, 'settings_header'), 600);

        const tutorialLabels = { AUTO: 'FIRST FLIGHT', ALWAYS: 'EVERY FLIGHT', OFF: 'OFF' };
        const rows = [
            {
                label: 'Sound effects',
                value: () => (Settings.data.sound ? 'ON' : 'OFF'),
                next: () => { Settings.data.sound = !Settings.data.sound; applySoundSetting(this.game); }
            },
            {
                label: 'NASA live data (DONKI)',
                value: () => (Settings.data.live ? 'LIVE' : 'OFFLINE'),
                next: () => { Settings.data.live = !Settings.data.live; }
            },
            {
                label: 'Difficulty',
                value: () => GAME_CONFIG.difficulty[Settings.data.difficulty].label.toUpperCase(),
                next: () => {
                    const keys = Object.keys(GAME_CONFIG.difficulty);
                    Settings.data.difficulty = keys[(keys.indexOf(Settings.data.difficulty) + 1) % keys.length];
                }
            },
            {
                label: 'Practice with Probe',
                value: () => tutorialLabels[Settings.data.tutorial],
                next: () => {
                    const keys = Object.keys(tutorialLabels);
                    Settings.data.tutorial = keys[(keys.indexOf(Settings.data.tutorial) + 1) % keys.length];
                }
            },
            {
                label: 'Space quiz',
                value: () => (Settings.data.quiz ? 'ON' : 'OFF'),
                next: () => { Settings.data.quiz = !Settings.data.quiz; }
            }
        ];

        const ROW = { y0: 268, gap: 66, scale: 0.72 };
        rows.forEach((row, i) => {
            const y = ROW.y0 + i * ROW.gap;
            const panel = this.add.image(CX, y, 'settings_ui').setScale(ROW.scale);
            txt(this, CX - 345 * ROW.scale, y, row.label, { fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
            const value = txt(this, CX + 245 * ROW.scale, y, row.value(), { fontSize: '15px', fontStyle: 'bold', color: '#00f0ff' }).setOrigin(0.5);
            const zone = this.add.zone(CX, y, 760 * ROW.scale, 86 * ROW.scale).setInteractive({ useHandCursor: true });
            zone.on('pointerover', () => { panel.setTint(0xd8f8ff); Sfx.play(this, 'hover'); });
            zone.on('pointerout', () => panel.clearTint());
            zone.on('pointerdown', () => {
                row.next();
                Settings.save();
                value.setText(row.value());
                Sfx.play(this, 'click');
            });
        });

        const guide = [
            ['lifeSupport', 'Life Support', 'keep 25 kW or more'],
            ['shielding', 'Shielding', '40 kW blocks it all'],
            ['research', 'Research', 'makes science points'],
            ['comms', 'Comms', 'sends science to Earth']
        ];
        guide.forEach(([key, title, desc], i) => {
            const x = 290 + i * 233;
            this.add.image(x - 62, 606, 'subsystem_icons', SUBSYSTEM_FRAMES[key]).setDisplaySize(48, 48);
            txt(this, x - 30, 595, title, { fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
            txt(this, x - 30, 617, desc, { fontSize: '12px', color: '#b9c7e3', wordWrap: { width: 150 } }).setOrigin(0, 0.5);
        });

        glassButton(this, 190, 112, '< BACK', () => Fade.go(this, 'TitleScene'), { w: 130, h: 40 });
        this.input.keyboard.on('keydown-ESC', () => Fade.go(this, 'TitleScene'));
    }
}

function applySoundSetting(game) {
    game.sound.mute = !Settings.data.sound;
    if (!Settings.data.sound) Sfx.stopHum();
    const btn = $('mute-btn');
    if (btn) {
        btn.textContent = Settings.data.sound ? '🔊' : '🔇';
        btn.setAttribute('aria-pressed', String(!Settings.data.sound));
    }
}

/* ======================================================================= */
/* ModeSelectScene: Mars or Moon                                           */
/* ======================================================================= */
class ModeSelectScene extends Phaser.Scene {
    constructor() { super('ModeSelectScene'); }

    create() {
        this.loading = false;
        Fade.enter(this);
        addFullscreen(this, 'settings_frame');

        const wc = LAYOUT.welcome;
        const welcome = this.add.image(wc.x, wc.y, 'card_welcome').setScale(wc.scale);
        welcome.setCrop(wc.crop.x, wc.crop.y, wc.crop.w, wc.crop.h);
        const bw = wc.crop.w * wc.scale;
        const bh = wc.crop.h * wc.scale;
        this.add.graphics().lineStyle(2, 0x00f0ff, 0.55)
            .strokeRoundedRect(wc.x - bw / 2 - 4, wc.y - bh / 2 - 4, bw + 8, bh + 8, 14);

        // PROBE Academy row: practice toggle for this flight + the mission manual
        this.training = tutorialWanted();
        const trainLabel = () => `PRACTICE WITH PROBE: ${this.training ? 'ON' : 'OFF'}`;
        const trainBtn = glassButton(this, CX - 130, LAYOUT.academyRowY, trainLabel(), () => {
            if (!hasAcademy()) return;
            this.training = !this.training;
            trainBtn.t.setText(trainLabel());
        }, { w: 300, h: 40, fontSize: '15px' });
        glassButton(this, CX + 150, LAYOUT.academyRowY, 'MISSION MANUAL', openManual, { w: 220, h: 40, fontSize: '15px' });
        txt(this, CX, LAYOUT.subtitleY, 'CHOOSE YOUR MISSION', { fontSize: '22px', fontStyle: 'bold', color: '#00f0ff' }).setOrigin(0.5);

        this.infoText = txt(this, CX, LAYOUT.infoY, 'Hover a planet to see its mission profile', {
            fontSize: '16px', color: '#cfe3ff', align: 'center'
        }).setOrigin(0.5);

        const best = History.best();
        txt(this, 1100, 104, best ? `Best CTI: ${best}` : 'No missions yet', { fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        txt(this, 1100, 126, `${Settings.data.live ? 'NASA LIVE DATA' : 'OFFLINE PRESETS'}  |  ${GAME_CONFIG.difficulty[Settings.data.difficulty].label}`, {
            fontSize: '12px', color: '#9fb6d6'
        }).setOrigin(0.5);

        const p = LAYOUT.planets;
        this.createChoice('MARS', p.marsX, 'mars_planet', 'select_mars',
            'MARS: 100 kW solar array, thin atmosphere. Archived flare preset: X8.2 (2017).');
        this.createChoice('MOON', p.moonX, 'moon_planet', 'select_moon',
            'MOON: 80 kW solar array, no atmosphere at all. Archived flare preset: X9.0 (2024).');

        glassButton(this, 190, 112, '< BACK', () => { if (!this.loading) Fade.go(this, 'TitleScene'); }, { w: 130, h: 40 });
        this.input.keyboard.on('keydown-ESC', () => { if (!this.loading) Fade.go(this, 'TitleScene'); });
        this.input.keyboard.on('keydown-M', () => this.startMission('MARS'));
        this.input.keyboard.on('keydown-L', () => this.startMission('MOON'));
        this.input.keyboard.on('keydown-H', openManual);
    }

    createChoice(mode, x, planetKey, bannerKey, info) {
        const p = LAYOUT.planets;
        const planet = this.add.image(x, p.y, planetKey).setDisplaySize(p.size, p.size);
        planet.baseScale = planet.scaleX;
        this.tweens.add({ targets: planet, angle: 360, duration: 60000, repeat: -1 });

        const banner = this.add.image(x, LAYOUT.banners.y, bannerKey).setScale(LAYOUT.banners.scale);
        banner.baseScale = banner.scaleX;

        const over = () => {
            this.tweens.add({ targets: planet, scale: planet.baseScale * 1.08, duration: 150 });
            this.tweens.add({ targets: banner, scale: banner.baseScale * 1.06, duration: 150 });
            if (!this.loading) this.infoText.setText(info);
            Sfx.play(this, 'hover');
        };
        const out = () => {
            this.tweens.add({ targets: planet, scale: planet.baseScale, duration: 150 });
            this.tweens.add({ targets: banner, scale: banner.baseScale, duration: 150 });
        };
        [planet, banner].forEach((obj) => {
            obj.setInteractive({ useHandCursor: true });
            obj.on('pointerover', over);
            obj.on('pointerout', out);
            obj.on('pointerdown', () => this.startMission(mode));
        });
    }

    async startMission(mode) {
        if (this.loading) return;
        this.loading = true;
        Sfx.play(this, 'click');
        this.infoText.setText(Settings.data.live ? 'Contacting NASA DONKI space-weather database...' : 'Loading verified NASA presets...');
        let scenario;
        try {
            scenario = await fetchNasaScenario(mode, { live: Settings.data.live });
        } catch (e) {
            scenario = await fetchNasaScenario(mode, { live: false });
        }
        if (!this.sys.isActive()) return;
        Fade.go(this, 'MainGameScene', { scenario, training: !!this.training });
    }
}

/* ======================================================================= */
/* MainGameScene: the mission                                              */
/* ======================================================================= */
class MainGameScene extends Phaser.Scene {
    constructor() { super('MainGameScene'); }

    init(data) {
        this.scenario = data.scenario;
        this.difficultyKey = Settings.data.difficulty;
        this.crewHealth = 100;
        this.elapsedSec = 0;
        this.missionMs = 0;
        this.timelineIdx = 0;
        this.ended = false;
        this.paused = false;
        this.dose_mSv = 0;
        this.scienceSent = 0;
        this.alertVisualOn = false;
        this.ctiEvaluator = new CtiEvaluator();

        // PROBE Academy state
        this.training = !!data.training && hasAcademy();
        this.inTutorial = false;      // mission clock frozen while Probe teaches
        this.academyHold = false;     // quiz / tutorial step is holding the clock
        this.practice = null;         // practice-storm telemetry (tutorial only)
        this.quizResult = null;
        this.shuttingDown = false;
    }

    create() {
        this.events.once('shutdown', () => this.cleanup());
        Fade.enter(this, 500);

        addFullscreen(this, this.scenario.backgroundKey);
        this.alertBg = addFullscreen(this, this.scenario.alertBackgroundKey).setAlpha(0);

        const ab = LAYOUT.alertBadge;
        this.alertBadge = fitWidth(this.add.image(ab.x, ab.y, 'badge_alert'), ab.w).setAlpha(0).setDepth(5);

        const d = LAYOUT.dialog;
        this.dialogBox = this.makeDialog(d.x, d.y, d.w, d.h).setAlpha(d.alpha).setDepth(6);
        this.dialogText = txt(this, d.x, d.textY, this.scenario.timeline[0].eventText, {
            fontSize: '15px', color: '#e8fbff', align: 'center', fontStyle: 'bold', wordWrap: { width: d.w - 150 }, lineSpacing: 3
        }).setOrigin(0.5).setDepth(7);

        this.resetHud();
        this.initChart();
        this.bindHud();

        this.input.keyboard.on('keydown-P', () => this.togglePause());
        this.input.keyboard.on('keydown-ESC', () => this.togglePause());

        Sfx.startHum(this);
        this.setupAcademy();
    }

    /* ---------------- PROBE Academy: tutorial + quiz ---------------- */

    setupAcademy() {
        if (!hasAcademy()) return;
        ProbeAcademy.init({
            mission: this.scenario.modeKey === 'MOON' ? 'moon' : 'mars',
            difficulty: String(this.difficultyKey).toLowerCase(),
            quizEnabled: Settings.data.quiz,
            targets: {
                budget: '#budget-row', lifeSupport: '#row-ls', shielding: '#row-shield',
                research: '#row-research', comms: '#row-comms', sliders: '#slider-panel'
            },
            getState: () => {
                const a = this.getCurrentAllocations();
                const d = this.currentData();
                return {
                    lifeSupport: a.lifeSupport, shielding: a.shielding, research: a.research, comms: a.comms,
                    capacity: this.currentCapacityKW(),
                    radiation: d.radiation_mSv_hr,
                    alertActive: !!d.alert && !this.ended
                };
            },
            pause: () => { this.academyHold = true; Sfx.stopHum(); },
            resume: () => {
                this.academyHold = false;
                if (!this.inTutorial && !this.ended && !this.paused && !this.shuttingDown) Sfx.startHum(this);
            },
            triggerFlare: () => this.startPracticeFlare(),
            endFlare: () => this.endPracticeFlare(),
            onTutorialEnd: ({ completed }) => this.onTutorialEnd(completed),
            onQuizComplete: (result) => { this.quizResult = result; }
        });

        if (this.training) {
            this.inTutorial = true;
            Sfx.stopHum();
            ProbeAcademy.startTutorial();
        } else {
            ProbeAcademy.armMissionQuiz();
        }
    }

    onTutorialEnd(completed) {
        if (this.shuttingDown || this.ended) return;
        this.inTutorial = false;
        // A finished tutorial already showed its quiz; a skipped one gets the normal mission quiz.
        if (!completed) ProbeAcademy.armMissionQuiz();
        this.dialogText.setText(`Practice over. The real mission starts now! ${this.scenario.timeline[0].eventText}`);
        if (!this.academyHold && !this.paused) Sfx.startHum(this);
    }

    /**
     * Practice storm used by the tutorial: an M-class flare that CAN be fully
     * shielded (1.6 mSv/h and a 70 kW budget: 25 kW life support + 35 kW shielding
     * fits). The mission clock is frozen, so nothing here hurts the crew.
     */
    startPracticeFlare() {
        const kw = Math.min(70, this.scenario.baseSolarKW);
        this.practice = {
            radiation_mSv_hr: 1.6,
            solar_efficiency: kw / this.scenario.baseSolarKW,
            alert: true,
            eventText: 'PRACTICE STORM: an M-class flare! Cut Research and Comms, raise Shielding, and keep Life Support at 25 kW or more.'
        };
        Sfx.play(this, 'alert');
        this.cameras.main.shake(350, 0.006);
        this.setAlertVisual(true);
        this.dialogText.setText(this.practice.eventText);
        this.refreshLiveReadouts();
    }

    endPracticeFlare() {
        if (!this.practice || this.shuttingDown) return;
        this.practice = null;
        this.setAlertVisual(false);
        this.resetSliders();
        this.dialogText.setText(this.scenario.timeline[0].eventText);
        this.refreshLiveReadouts();
    }

    /** dialog_box as a 9-slice so the frame corners stay crisp at any size. */
    makeDialog(x, y, w, h) {
        if (this.add.nineslice) return this.add.nineslice(x, y, 'dialog_box', undefined, w, h, 70, 70, 56, 56);
        return this.add.image(x, y, 'dialog_box').setDisplaySize(w, h);
    }

    update(time, delta) {
        if (this.ended || this.paused || this.inTutorial || this.academyHold) return;
        this.missionMs += Math.min(delta, 250);
        while (!this.ended && this.missionMs >= (this.elapsedSec + 1) * 1000) this.onSecondTick();
    }

    missionTime() {
        return Math.round(this.missionMs / 100) / 10;
    }

    /* ---------------- HUD ---------------- */

    resetSliders() {
        const d = GAME_CONFIG.defaultAllocation;
        const map = { ls: d.lifeSupport, shield: d.shielding, research: d.research, comms: d.comms };
        Object.entries(map).forEach(([id, v]) => {
            const s = $(`slider-${id}`);
            s.value = v;
            s.disabled = false;
            $(`val-${id}`).textContent = v;
        });
    }

    resetHud() {
        const d = GAME_CONFIG.defaultAllocation;
        this.resetSliders();
        const first = this.scenario.timeline[0];
        $('health-bar').style.width = '100%';
        $('health-bar').classList.remove('hp-low');
        $('health-val').textContent = '100%';
        $('radiation-val').textContent = `${first.radiation_mSv_hr.toFixed(2)} mSv/h`;
        $('net-radiation-val').textContent = `${computeNetRadiation(first.radiation_mSv_hr, d.shielding).toFixed(2)} mSv/h`;
        ['radiation-val', 'net-radiation-val', 'power-val', 'val-ls'].forEach((id) => $(id).classList.remove('danger'));
        $('live-cti-val').textContent = '100';
        $('science-val').textContent = '0';
        $('timer-val').textContent = `${GAME_CONFIG.missionSeconds}s`;
        $('mission-name').textContent = this.scenario.name;
        $('data-source').textContent = this.scenario.sourceLabel || '';
        $('data-source').classList.toggle('text-emerald-300', this.scenario.dataMode === 'LIVE');
        $('pause-overlay').classList.add('hidden');
        $('pause-btn').textContent = 'PAUSE';
        Fade.showHud($('hud-overlay'));
        this.refreshLiveReadouts();
    }

    initChart() {
        if (telemetryChartInstance) {
            telemetryChartInstance.destroy();
            telemetryChartInstance = null;
        }
        const existing = typeof Chart.getChart === 'function' ? Chart.getChart('telemetryChart') : null;
        if (existing) existing.destroy();

        const maxRad = Math.max(...this.scenario.timeline.map((e) => e.radiation_mSv_hr));
        telemetryChartInstance = new Chart($('telemetryChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'Solar radiation', data: [], borderColor: '#fb7185', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                    { label: 'Reaching crew', data: [], borderColor: '#22d3ee', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                    { label: 'Danger line', data: [], borderColor: 'rgba(250,204,21,0.7)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                events: [],
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false, min: 0, max: Math.ceil(maxRad * 1.15 * 10) / 10 } }
            }
        });
    }

    bindHud() {
        ['ls', 'shield', 'research', 'comms'].forEach((id) => {
            $(`slider-${id}`).oninput = (e) => {
                if (this.ended || this.paused) return;
                $(`val-${id}`).textContent = e.target.value;
                if (!this.inTutorial) this.ctiEvaluator.recordFirstAction(this.missionTime());
                this.refreshLiveReadouts();
            };
        });
        $('pause-btn').onclick = () => this.togglePause();
        $('pause-overlay').onclick = () => this.togglePause();
    }

    togglePause() {
        if (this.ended || this.inTutorial || this.academyHold) return;
        this.paused = !this.paused;
        $('pause-overlay').classList.toggle('hidden', !this.paused);
        $('pause-btn').textContent = this.paused ? 'RESUME' : 'PAUSE';
        ['ls', 'shield', 'research', 'comms'].forEach((id) => { $(`slider-${id}`).disabled = this.paused; });
        if (this.paused) Sfx.stopHum(); else Sfx.startHum(this);
    }

    getCurrentAllocations() {
        const num = (id) => parseInt($(id).value, 10) || 0;
        return {
            lifeSupport: num('slider-ls'),
            shielding: num('slider-shield'),
            research: num('slider-research'),
            comms: num('slider-comms')
        };
    }

    /** Live "power budget" line under the sliders (updates instantly while dragging). */
    /** Telemetry right now: the practice storm during the tutorial, otherwise the mission timeline. */
    currentData() {
        return this.practice || this.scenario.timeline[this.timelineIdx];
    }

    /** Whole kW the panels deliver right now (floored so "fits" really fits). */
    currentCapacityKW() {
        return Math.floor(computeCapacity(this.scenario.baseSolarKW, this.currentData().solar_efficiency) + 1e-9);
    }

    /**
     * Instant feedback while dragging: radiation reaching the crew, the three
     * system-check lights, the coach tip, the phase chip and slider hints.
     */
    refreshLiveReadouts() {
        this.updateBudget();
        const d = this.currentData();
        const a = this.getCurrentAllocations();
        const cap = this.currentCapacityKW();
        const total = totalAllocated(a);
        const net = computeNetRadiation(d.radiation_mSv_hr, a.shielding);
        const bestShield = Math.max(0, Math.min(GAME_CONFIG.shieldingDivisor, cap - GAME_CONFIG.lifeSupportMinKW));
        const lifeOk = a.lifeSupport >= GAME_CONFIG.lifeSupportMinKW;
        const powerOk = total <= cap;
        const radSafe = net <= GAME_CONFIG.radiationDangerThreshold;
        const radBest = !radSafe && a.shielding >= bestShield - 1;

        $('radiation-val').textContent = `${d.radiation_mSv_hr.toFixed(2)} mSv/h`;
        $('net-radiation-val').textContent = `${net.toFixed(2)} mSv/h`;
        $('net-radiation-val').classList.toggle('danger', !radSafe);

        const setCheck = (id, state, value) => {
            const row = $(id);
            row.classList.remove('is-ok', 'is-warn', 'is-bad');
            row.classList.add(`is-${state}`);
            $(`${id}-val`).textContent = value;
        };
        setCheck('check-life', lifeOk ? 'ok' : 'bad', `${a.lifeSupport} kW`);
        setCheck('check-rad', radSafe ? 'ok' : (radBest ? 'warn' : 'bad'), radSafe ? 'safe' : (radBest ? 'best you can' : 'too high'));
        setCheck('check-power', powerOk ? 'ok' : 'bad', powerOk ? `${cap - total} kW spare` : `over ${total - cap} kW`);

        // Phase chip
        const storm = !!d.alert;
        const fading = !storm && d.radiation_mSv_hr > GAME_CONFIG.alertRadiation;
        const afterStorm = !storm && !fading && this.timelineIdx > 0 && !this.practice;
        const chip = $('phase-chip');
        const phase = this.practice ? ['practice', 'Practice'] : storm ? ['storm', 'Flare!'] : fading ? ['fading', 'Fading'] : afterStorm ? ['calm', 'All clear'] : ['calm', 'Calm'];
        chip.className = `phase-chip phase-${phase[0]}`;
        chip.textContent = phase[1];

        // Coach tip: the most urgent problem first, then advice for the phase
        let tip;
        if (!lifeOk) tip = 'Life Support needs 25 kW or more. Slide it up!';
        else if (!powerOk) tip = 'Too much power! Turn Research or Comms down.';
        else if (storm && !radSafe && !radBest) tip = 'Flare! Push Shielding up. Cut Research and Comms to free power.';
        else if (storm && radBest) tip = 'Great trade-off! Shielding is as high as your power allows.';
        else if (storm) tip = 'Crew is safe. Hold it there until the storm fades.';
        else if (fading) tip = 'The storm is fading. Keep Shielding up a little longer.';
        else if (afterStorm && (a.research < 10 || a.comms < GAME_CONFIG.commsFullKW)) tip = 'All clear! Turn Research and Comms back on to send science to Earth.';
        else if (afterStorm) tip = 'All clear and sending science. Nice flying!';
        else tip = 'Keep all three lights green. A flare could come at any time.';
        const tipEl = $('coach-tip');
        tipEl.textContent = tip;
        tipEl.classList.toggle('is-storm', storm || !lifeOk || !powerOk);

        // Slider hints (Cadet + Engineer)
        const hints = this.difficultyKey !== 'COMMANDER';
        const hint = (rowId, cls) => {
            const row = $(rowId);
            row.classList.remove('hint-up', 'hint-down');
            if (hints && cls) row.classList.add(cls);
        };
        hint('row-ls', !lifeOk ? 'hint-up' : null);
        hint('row-shield', storm && !radSafe && a.shielding < bestShield ? 'hint-up' : null);
        hint('row-research', storm && a.research > 0 ? 'hint-down' : (afterStorm && a.research < 10 ? 'hint-up' : null));
        hint('row-comms', storm && a.comms > 0 ? 'hint-down' : (afterStorm && a.comms < GAME_CONFIG.commsFullKW ? 'hint-up' : null));
    }

    updateBudget() {
        const capacity = this.currentCapacityKW();
        const total = totalAllocated(this.getCurrentAllocations());
        const el = $('budget-val');
        if (total > capacity) {
            el.textContent = `OVER by ${total - capacity} kW`;
            el.className = 'font-black text-rose-400';
        } else {
            el.textContent = `${capacity - total} kW spare`;
            el.className = 'font-black text-emerald-300';
        }
        $('power-val').textContent = `${total} / ${capacity} kW`;
        $('power-val').classList.toggle('danger', total > capacity);
        $('val-ls').classList.toggle('danger', this.getCurrentAllocations().lifeSupport < GAME_CONFIG.lifeSupportMinKW);
    }

    /* ---------------- 1 Hz telemetry loop ---------------- */

    onSecondTick() {
        if (this.ended) return;
        this.elapsedSec++;

        const tl = this.scenario.timeline;
        while (this.timelineIdx < tl.length - 1 && this.elapsedSec >= tl[this.timelineIdx + 1].timestamp) {
            this.timelineIdx++;
            this.triggerTimelineEvent(tl[this.timelineIdx]);
        }
        const currentData = tl[this.timelineIdx];
        const allocations = this.getCurrentAllocations();

        // Unshielded radiation that reaches the crew (spec formula).
        const netRadiation = Math.max(0, currentData.radiation_mSv_hr * (1 - (allocations.shielding / 40.0)));
        const totalPowerAllocated = allocations.lifeSupport + allocations.shielding + allocations.research + allocations.comms;
        const currentCapacity = this.scenario.baseSolarKW * currentData.solar_efficiency;

        // Crew decay when netRadiation > 0.2, totalPowerAllocated > currentCapacity, or lifeSupport < 25 kW.
        const sim = applyCrewHealthDecay({
            health: this.crewHealth,
            allocations,
            netRadiation,
            totalPowerAllocated,
            currentCapacity,
            osdr: this.scenario.osdr,
            difficultyKey: this.difficultyKey
        });
        this.crewHealth = sim.health;
        this.dose_mSv += netRadiation;

        // Science only counts while the base actually has the power to run it.
        const science = computeScience(allocations);
        if (!sim.overload) this.scienceSent += science.transmitted;

        this.ctiEvaluator.updateTick({
            inRed: sim.inRed,
            inAlert: currentData.radiation_mSv_hr > GAME_CONFIG.alertRadiation,
            alloc: allocations,
            t: this.elapsedSec,
            health: this.crewHealth,
            radiation: currentData.radiation_mSv_hr,
            netRadiation,
            capacity: currentCapacity,
            total: totalPowerAllocated
        });

        this.syncHud(sim, currentData, netRadiation);

        if (this.crewHealth <= 0) this.endMission(false);
        else if (this.elapsedSec >= GAME_CONFIG.missionSeconds) this.endMission(true);
    }

    syncHud(sim, currentData, netRadiation) {
        $('health-bar').style.width = `${this.crewHealth}%`;
        $('health-bar').classList.toggle('hp-low', this.crewHealth < 40);
        $('health-val').textContent = `${Math.round(this.crewHealth)}%`;

        $('radiation-val').classList.toggle('danger', currentData.radiation_mSv_hr > GAME_CONFIG.alertRadiation);

        $('science-val').textContent = String(Math.round(this.scienceSent));
        const left = Math.max(0, GAME_CONFIG.missionSeconds - this.elapsedSec);
        $('timer-val').textContent = `${left}s`;
        this.refreshLiveReadouts();

        if (telemetryChartInstance) {
            const c = telemetryChartInstance;
            c.data.labels.push(this.elapsedSec);
            c.data.datasets[0].data.push(currentData.radiation_mSv_hr);
            c.data.datasets[1].data.push(netRadiation);
            c.data.datasets[2].data.push(GAME_CONFIG.radiationDangerThreshold);
            if (c.data.labels.length > 20) {
                c.data.labels.shift();
                c.data.datasets.forEach((ds) => ds.data.shift());
            }
            c.update('none');
        }

        $('live-cti-val').textContent = String(this.ctiEvaluator.calculate(this.elapsedSec).score);
        if (left <= 5 && left > 0) Sfx.play(this, 'tick');
    }

    triggerTimelineEvent(ev) {
        this.dialogText.setText(ev.eventText);
        this.tweens.add({ targets: this.dialogText, alpha: { from: 0.2, to: 1 }, duration: 300 });
        this.refreshLiveReadouts();

        if (ev.alert) {
            Sfx.play(this, 'alert');
            this.cameras.main.shake(450, 0.008);
            this.ctiEvaluator.recordAnomalyTriggered(this.missionTime());
            this.setAlertVisual(true);
        } else if (this.alertVisualOn) {
            this.setAlertVisual(false);
        }
    }

    /** Crossfades the flare cockpit art in/out; pulses badge_alert when the art has no badge of its own. */
    setAlertVisual(on) {
        this.alertVisualOn = on;
        this.tweens.killTweensOf(this.alertBg);
        this.tweens.add({ targets: this.alertBg, alpha: on ? 1 : 0, duration: on ? 350 : 900 });

        this.tweens.killTweensOf(this.alertBadge);
        if (on && !this.scenario.alertArtHasBadge) {
            this.alertBadge.setAlpha(1);
            this.tweens.add({ targets: this.alertBadge, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
        } else {
            this.tweens.add({ targets: this.alertBadge, alpha: 0, duration: 300 });
        }
    }

    /* ---------------- end of mission ---------------- */

    endMission(success) {
        if (this.ended) return;
        this.ended = true;
        Sfx.stopHum();

        const results = this.ctiEvaluator.calculate(this.elapsedSec);
        const debrief = MissionAnalyst.analyze({
            results,
            log: this.ctiEvaluator.log,
            scenario: this.scenario,
            success,
            elapsedSec: this.elapsedSec,
            dose_mSv: this.dose_mSv,
            scienceSent: this.scienceSent
        });

        // Chart + HUD are torn down (HUD fades out) before the result screen is drawn.
        this.cleanup('soft');
        History.push({
            ts: new Date().toISOString(), mission: this.scenario.id, success, score: results.score,
            sDiag: results.sDiag, sEff: results.sEff, sStab: results.sStab, difficulty: this.difficultyKey,
            quizStars: this.quizResult ? this.quizResult.stars : null, training: this.training
        });
        Sfx.play(this, success ? 'success' : 'fail');

        this.tweens.killTweensOf(this.alertBadge);
        this.alertBadge.setVisible(false);
        this.dialogBox.setVisible(false);
        this.dialogText.setVisible(false);
        this.add.rectangle(CX, CY, W, H, 0x020617, 0.68).setDepth(10);
        this.cameras.main.fadeIn(500, Fade.COLOR.r, Fade.COLOR.g, Fade.COLOR.b);

        const R = LAYOUT.result;
        const card = this.add.image(R.card.x, R.card.y, success ? 'card_success' : 'card_failed')
            .setOrigin(0.5).setScale(R.card.scale).setDepth(11);
        card.setAlpha(0);
        this.tweens.add({ targets: card, alpha: 1, duration: 400 });

        if (success) {
            fitWidth(this.add.image(R.badgeComplete.x, R.badgeComplete.y, 'badge_complete'), R.badgeComplete.w).setDepth(12);
            this.add.image(R.medal.x, R.medal.y, 'badge_success').setDisplaySize(R.medal.size, R.medal.size).setDepth(12);
        } else {
            fitWidth(this.add.image(R.medal.x, R.medal.y, 'badge_alert'), 210).setDepth(12);
        }

        // CTI evaluation: anchored at y = 450, origin 0.5, below the card's own title text.
        const ctiLines = [
            `CRITICAL THINKING INDEX: ${results.score}  |  ${results.rank.toUpperCase()}`,
            `Diagnostic ${results.sDiag}%   Efficiency ${results.sEff}%   Stability ${results.sStab}%`,
            `Science sent: ${Math.round(this.scienceSent)} pts   Crew dose: ${this.dose_mSv.toFixed(1)} mSv` +
                (this.quizResult ? `   Quiz: ${this.quizResult.stars}/${this.quizResult.maxStars} stars` : '')
        ];
        this.add.text(CX, R.ctiY, ctiLines.join('\n'), {
            fontFamily: FONT, fontSize: '16px', color: '#00f0ff', align: 'center', fontStyle: 'bold', lineSpacing: 6, resolution: 2
        }).setOrigin(0.5).setDepth(12);

        const quiz = this.quizResult;
        const fullReport = debrief.report + (quiz && hasAcademy() ? `\n\n${ProbeAcademy.reportLines(quiz)}\n` : '');
        glassButton(this, CX - 175, R.buttonsY, 'PLAY AGAIN', () => Fade.restart(this, { scenario: this.scenario, training: false }), { w: 160, h: 40, depth: 13 });
        glassButton(this, CX, R.buttonsY, 'MENU', () => Fade.go(this, 'ModeSelectScene'), { w: 130, h: 40, depth: 13 });
        glassButton(this, CX + 175, R.buttonsY, 'REPORT', () => downloadReport(fullReport), { w: 160, h: 40, depth: 13 });

        // AI Mission Analyst summary in the bottom telemetry box.
        const rd = R.dialog;
        this.makeDialog(rd.x, rd.y, rd.w, rd.h).setAlpha(0.92).setDepth(12);
        txt(this, rd.x, R.analystHeaderY, `AI MISSION ANALYST  |  ${debrief.headline}`, {
            fontSize: '13px', fontStyle: 'bold', color: '#facc15'
        }).setOrigin(0.5).setDepth(13);
        txt(this, rd.x, rd.textY, debrief.summary, {
            fontSize: '14px', color: '#e8fbff', align: 'center', wordWrap: { width: rd.w - 170 }, lineSpacing: 3
        }).setOrigin(0.5).setDepth(13);

        this.input.keyboard.once('keydown-ENTER', () => Fade.restart(this, { scenario: this.scenario, training: false }));
        window.__PROBE_LAST_DEBRIEF__ = { ...debrief, quiz, fullReport };
    }

    /** cleanup('soft') fades the HUD out (end of mission); a plain cleanup() hides it instantly (scene shutdown). */
    cleanup(mode) {
        this.shuttingDown = true;
        if (hasAcademy()) ProbeAcademy.destroy();
        ['ls', 'shield', 'research', 'comms'].forEach((id) => { $(`slider-${id}`).oninput = null; });
        ['row-ls', 'row-shield', 'row-research', 'row-comms'].forEach((id) => $(id).classList.remove('hint-up', 'hint-down'));
        $('pause-btn').onclick = null;
        $('pause-overlay').onclick = null;
        $('pause-overlay').classList.add('hidden');
        Fade.hideHud($('hud-overlay'), mode !== 'soft');
        if (telemetryChartInstance) {
            telemetryChartInstance.destroy();
            telemetryChartInstance = null;
        }
        Sfx.stopHum();
    }
}

function downloadReport(text) {
    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `probe-the-base-debrief-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        console.info('[PROBE] Report download unavailable:', e.message);
    }
}

/* ======================================================================= */
/* QuitScene                                                               */
/* ======================================================================= */
class QuitScene extends Phaser.Scene {
    constructor() { super('QuitScene'); }

    create() {
        Fade.enter(this);
        starfield(this);
        const runs = History.all();
        txt(this, CX, 250, 'MISSION CONTROL SIGNING OFF', { fontSize: '34px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
        txt(this, CX, 305, 'Thanks for training with PROBE THE BASE, Commander!', { fontSize: '18px', color: '#00f0ff' }).setOrigin(0.5);
        const quizBest = hasAcademy() ? ProbeAcademy.prefs.get('quizBest', 0) : 0;
        txt(this, CX, 350, runs.length ? `Missions flown: ${runs.length}   |   Best CTI: ${History.best()}${quizBest ? `   |   Best quiz: ${quizBest} stars` : ''}` : 'Come back soon: the Sun never stops changing.', {
            fontSize: '16px', color: '#cfe3ff'
        }).setOrigin(0.5);
        txt(this, CX, 395, 'You can now close this browser tab.', { fontSize: '14px', color: '#8ea3c4' }).setOrigin(0.5);
        glassButton(this, CX, 470, 'RETURN TO BASE', () => Fade.go(this, 'TitleScene'), { w: 220, h: 46 });
        if (window.opener) window.close();
    }
}

/* ======================================================================= */
/* Boot + responsive stage scaling                                         */
/* ======================================================================= */
const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    parent: 'game-container',
    backgroundColor: '#020617',
    scale: { mode: Phaser.Scale.NONE, width: W, height: H },
    render: { antialias: true },
    banner: false,
    scene: [BootScene, TitleScene, SettingsScene, ModeSelectScene, MainGameScene, QuitScene]
});
window.__PROBE_GAME__ = game;

function phaserReady() {
    return game.isBooted && game.scale && game.scale.canvas;
}

/** Scales the 1280x720 stage (canvas + HUD) to fit the window with no scrollbars or clipping. */
function fitGameToWindow() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    $('game-container').style.transform = `scale(${s})`;
    if (phaserReady()) game.scale.refresh();
}

window.addEventListener('resize', fitGameToWindow);
window.addEventListener('orientationchange', () => setTimeout(fitGameToWindow, 200));
window.addEventListener('load', () => { fitGameToWindow(); setTimeout(fitGameToWindow, 400); });
game.events.once(Phaser.Core.Events.READY, () => { applySoundSetting(game); fitGameToWindow(); });
fitGameToWindow();

// Re-measure the canvas before pointer events so clicks land correctly after CSS scaling.
const refreshCanvasBounds = () => { if (phaserReady()) game.scale.updateBounds(); };
window.addEventListener('pointerdown', refreshCanvasBounds, true);
window.addEventListener('pointermove', refreshCanvasBounds, true);

$('mute-btn').addEventListener('click', () => {
    Settings.data.sound = !Settings.data.sound;
    Settings.save();
    applySoundSetting(game);
});

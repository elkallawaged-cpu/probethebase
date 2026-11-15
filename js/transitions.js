/**
 * PROBE THE BASE - smooth scene transitions (v3.2)
 * -------------------------------------------------------------------------
 * One place for every fade in the game so nothing can glitch:
 *   - Fade.go(scene, key, data)   fade to deep space, then start/restart a scene
 *   - Fade.enter(scene)           fade the new scene in (call first thing in create())
 *   - Fade.reveal(scene, objs)    gentle staggered fade-in for title/menu art
 *   - Fade.showHud / hideHud      CSS opacity fade for the HTML mission HUD
 *
 * Safety rules built in:
 *   - Only one transition per scene at a time (double clicks / ENTER spam are ignored).
 *   - Input is switched off the moment a fade-out begins.
 *   - A fallback timer guarantees the next scene starts even if a camera event is missed.
 *   - Everything is a no-op on a scene that was already shut down.
 */
const Fade = {
    OUT_MS: 260,
    IN_MS: 380,
    COLOR: { r: 2, g: 6, b: 23 },   // slate-950, matches the page + canvas background

    /** Fade the current scene out, then switch. mode = 'start' (default) or 'restart'. */
    go(scene, key, data, mode) {
        if (!scene || !scene.sys || !scene.sys.isActive() || scene.__fadeLeaving) return false;
        scene.__fadeLeaving = true;
        scene.events.once('shutdown', () => { scene.__fadeLeaving = false; });

        if (scene.input) scene.input.enabled = false;
        const cam = scene.cameras && scene.cameras.main;
        const c = Fade.COLOR;
        let done = false;

        const run = () => {
            if (done) return;
            done = true;
            if (!scene.sys || !scene.sys.isActive()) return;
            if (mode === 'restart') scene.scene.restart(data);
            else scene.scene.start(key, data);
        };

        if (!cam || typeof cam.fadeOut !== 'function') { run(); return true; }
        cam.once('camerafadeoutcomplete', run);
        cam.fadeOut(Fade.OUT_MS, c.r, c.g, c.b);
        // Fallback: never leave the player stuck on a dark screen.
        setTimeout(run, Fade.OUT_MS + 400);
        return true;
    },

    restart(scene, data) { return Fade.go(scene, scene.sys.settings.key, data, 'restart'); },

    /** Fade a freshly created scene in from deep space. */
    enter(scene, ms) {
        const cam = scene && scene.cameras && scene.cameras.main;
        if (!cam || typeof cam.fadeIn !== 'function') return;
        scene.__fadeLeaving = false;
        if (scene.input) scene.input.enabled = true;
        const c = Fade.COLOR;
        cam.fadeIn(ms || Fade.IN_MS, c.r, c.g, c.b);
    },

    /** Staggered alpha fade-in for a list of display objects. */
    reveal(scene, objects, opts) {
        const o = Object.assign({ duration: 600, delay: 0, stagger: 180 }, opts || {});
        objects.forEach((obj, i) => {
            if (!obj) return;
            obj.setAlpha(0);
            scene.tweens.add({ targets: obj, alpha: 1, duration: o.duration, delay: o.delay + i * o.stagger, ease: 'Sine.easeOut' });
        });
    },

    /* ---------------- HTML HUD ---------------- */

    _hudTimer: null,

    showHud(el) {
        if (!el) return;
        clearTimeout(Fade._hudTimer);
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.classList.remove('hidden');
        void el.offsetWidth;                     // commit opacity 0 before animating
        el.style.transition = 'opacity 450ms ease-out';
        el.style.opacity = '1';
    },

    hideHud(el, instant) {
        if (!el) return;
        clearTimeout(Fade._hudTimer);
        if (instant || el.classList.contains('hidden')) {
            el.classList.add('hidden');
            el.style.opacity = '';
            return;
        }
        el.style.transition = 'opacity 250ms ease-in';
        el.style.opacity = '0';
        Fade._hudTimer = setTimeout(() => { el.classList.add('hidden'); el.style.opacity = ''; }, 260);
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Fade };

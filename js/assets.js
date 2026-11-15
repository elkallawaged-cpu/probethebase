/**
 * PROBE THE BASE - ASSET MANIFEST
 * -------------------------------------------------------------------------
 * The single source of truth for every image the game loads.
 * Files live in assets/images/ and are produced by tools/prepare_assets.py.
 *
 * Each entry: key -> { file, w, h, kind, frame? }
 *   file  : exact filename with ONE extension (.jpg or .png). The loader
 *           validates this at boot (see validateAssetManifest) so a typo such
 *           as "logo_title.jpg.jpeg" or "card_success.png.png" is caught
 *           before any 404 can happen.
 *   w, h  : real pixel size of the prepared file (used for placeholders and
 *           for layout maths).
 *   kind  : 'fullscreen' -> anchored at (640, 360), setDisplaySize(1280, 720)
 *           'sprite'     -> positioned/scaled individually
 *           'spritesheet'-> sliced into frames (frame: { frameWidth, frameHeight })
 *
 * Sound effects are synthesised with the Web Audio API (js/main.js -> Sfx),
 * so there are no audio files and therefore no audio 404s.
 */
const ASSETS = {
    base: 'assets/images/',

    images: {
        // ---- Full 1280x720 canvas backgrounds / overlays -------------------
        logo_title:         { file: 'logo_title.jpg',         w: 1280, h: 720, kind: 'fullscreen' },
        menu_buttons:       { file: 'menu_buttons.png',       w: 1280, h: 720, kind: 'fullscreen' },
        settings_frame:     { file: 'settings_frame.png',     w: 1280, h: 720, kind: 'fullscreen' },
        mars_cockpit:       { file: 'mars_cockpit.jpg',       w: 1280, h: 720, kind: 'fullscreen' },
        moon_cockpit:       { file: 'moon_cockpit.jpg',       w: 1280, h: 720, kind: 'fullscreen' },
        // Flare-state cockpits (new art): crossfaded in while a solar event is active
        mars_cockpit_alert: { file: 'mars_cockpit_alert.jpg', w: 1280, h: 720, kind: 'fullscreen' },
        moon_cockpit_alert: { file: 'moon_cockpit_alert.jpg', w: 1280, h: 720, kind: 'fullscreen' },

        // ---- Centered result cards & overlays ------------------------------
        card_welcome:       { file: 'card_welcome.png',       w: 890,  h: 388, kind: 'sprite' },
        card_success:       { file: 'card_success.png',       w: 847,  h: 466, kind: 'sprite' },
        card_failed:        { file: 'card_failed.png',        w: 847,  h: 466, kind: 'sprite' },
        badge_complete:     { file: 'badge_complete.png',     w: 1124, h: 374, kind: 'sprite' },
        badge_alert:        { file: 'badge_alert.png',        w: 490,  h: 287, kind: 'sprite' },
        dialog_box:         { file: 'dialog_box.png',         w: 1210, h: 371, kind: 'sprite' },

        // ---- Standalone selection sprites (x = 420 and x = 860) ------------
        mars_planet:        { file: 'mars_planet.png',        w: 382,  h: 382, kind: 'sprite' },
        moon_planet:        { file: 'moon_planet.png',        w: 153,  h: 153, kind: 'sprite' },
        select_mars:        { file: 'select_mars.png',        w: 286,  h: 93,  kind: 'sprite' },
        select_moon:        { file: 'select_moon.png',        w: 337,  h: 93,  kind: 'sprite' },

        // ---- Subsystem & UI elements ---------------------------------------
        subsystem_icons:    { file: 'subsystem_icons.png',    w: 512,  h: 128, kind: 'spritesheet', frame: { frameWidth: 128, frameHeight: 128 } },
        settings_header:    { file: 'settings_header.png',    w: 808,  h: 132, kind: 'sprite' },
        settings_ui:        { file: 'settings_ui.png',        w: 760,  h: 86,  kind: 'sprite' },
        badge_success:      { file: 'badge_success.png',      w: 304,  h: 304, kind: 'sprite' }
    }
};

/** Frame order inside subsystem_icons.png */
const SUBSYSTEM_FRAMES = { lifeSupport: 0, shielding: 1, research: 2, comms: 3 };

/**
 * Click zones for the START / OPTIONS / QUIT buttons drawn inside
 * menu_buttons.png (1280x720 layout). Must match MENU_LAYOUT in
 * tools/prepare_assets.py. Values are centre x/y and width/height in game px.
 */
const MENU_BUTTON_ZONES = {
    start:   { x: 390, y: 612, w: 230, h: 114 },
    options: { x: 640, y: 612, w: 230, h: 114 },
    quit:    { x: 890, y: 612, w: 230, h: 115 }
};

/**
 * Guards against extension mistakes. Returns a list of problems (empty = OK).
 * Rules: exactly one dot-extension, only .jpg or .png, no double extension.
 */
function validateAssetManifest(manifest = ASSETS) {
    const problems = [];
    Object.entries(manifest.images).forEach(([key, def]) => {
        const file = String(def.file || '');
        const parts = file.split('.');
        const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
        if (parts.length !== 2) problems.push(`${key}: "${file}" must have exactly one extension`);
        if (ext !== 'jpg' && ext !== 'png') problems.push(`${key}: "${file}" must be .jpg or .png`);
        if (/\.(jpe?g|png)\.(jpe?g|png)$/i.test(file)) problems.push(`${key}: "${file}" has a double extension`);
        if (def.kind === 'fullscreen' && (def.w !== 1280 || def.h !== 720)) {
            problems.push(`${key}: full-screen assets must be 1280x720`);
        }
    });
    return problems;
}

if (typeof module !== 'undefined') {
    module.exports = { ASSETS, SUBSYSTEM_FRAMES, MENU_BUTTON_ZONES, validateAssetManifest };
}

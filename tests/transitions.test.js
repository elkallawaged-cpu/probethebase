// Scene/HUD fade tests (mock Phaser scene, no browser needed). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Fade } = require('../js/transitions.js');

function mockScene() {
    const handlers = {};
    const calls = [];
    const cam = {
        once(ev, fn) { handlers[ev] = fn; },
        fadeOut(ms) { calls.push(['fadeOut', ms]); },
        fadeIn(ms) { calls.push(['fadeIn', ms]); }
    };
    const events = { once(ev, fn) { handlers['scene:' + ev] = fn; } };
    return {
        calls, handlers, input: { enabled: true }, cameras: { main: cam }, events,
        sys: { isActive: () => true, settings: { key: 'TestScene' } },
        scene: { start: (k, d) => calls.push(['start', k, d]), restart: (d) => calls.push(['restart', d]) }
    };
}

test('go() fades out, disables input, then starts the next scene once', () => {
    const s = mockScene();
    assert.equal(Fade.go(s, 'Next', { a: 1 }), true);
    assert.equal(s.input.enabled, false);
    assert.deepEqual(s.calls[0], ['fadeOut', Fade.OUT_MS]);
    s.handlers.camerafadeoutcomplete();
    s.handlers.camerafadeoutcomplete();
    assert.equal(s.calls.filter((c) => c[0] === 'start').length, 1);
    assert.deepEqual(s.calls.find((c) => c[0] === 'start'), ['start', 'Next', { a: 1 }]);
});

test('go() ignores a second trigger while a transition is running', () => {
    const s = mockScene();
    assert.equal(Fade.go(s, 'A'), true);
    assert.equal(Fade.go(s, 'B'), false);
    s.handlers.camerafadeoutcomplete();
    assert.equal(s.calls.filter((c) => c[0] === 'start').length, 1);
});

test('restart() restarts the same scene after the fade', () => {
    const s = mockScene();
    Fade.restart(s, { x: 2 });
    s.handlers.camerafadeoutcomplete();
    assert.deepEqual(s.calls.find((c) => c[0] === 'restart'), ['restart', { x: 2 }]);
});

test('enter() re-enables input and fades in', () => {
    const s = mockScene();
    s.input.enabled = false; s.__fadeLeaving = true;
    Fade.enter(s);
    assert.equal(s.input.enabled, true);
    assert.equal(s.__fadeLeaving, false);
    assert.deepEqual(s.calls[0], ['fadeIn', Fade.IN_MS]);
});

test('shutdown re-arms the guard so the scene can transition again', () => {
    const s = mockScene();
    Fade.go(s, 'A');
    s.handlers['scene:shutdown']();
    assert.equal(s.__fadeLeaving, false);
});

test('main.js has no raw scene.start/restart calls left (all go through Fade)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(!/this\.scene\.(start|restart)\(/.test(src));
});

test('index.html loads transitions.js before main.js', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/transitions.js') > -1);
    assert.ok(html.indexOf('js/transitions.js') < html.indexOf('js/main.js'));
});

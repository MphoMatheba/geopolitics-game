// Runs the real battle-animation code from globe.js (dice, bursts, marching soldiers)
// in Node, with a fake clock. No browser, WebGL or npm install is needed: Three.js's
// maths and scene classes work on their own, and the renderer parts are not used.
// Run with: node --test tests/web-js/globe-effects.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web', 'wwwroot');
const geo = require(path.join(WEB, 'js', 'game', 'geo.js'));

let THREE, Globe;

test.before(async () => {
    globalThis.window = globalThis;
    globalThis.GameGeo = geo;
    globalThis.document = {
        createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {} }) })
    };
    const threeUrl = pathToFileURL(path.join(WEB, 'lib', 'three', 'three.module.min.js')).href;
    // globe.js imports 'three' and OrbitControls by browser import-map names; point them at real files / a stub.
    const source = fs.readFileSync(path.join(WEB, 'js', 'game', 'globe.js'), 'utf8')
        .replace("import * as THREE from 'three';", `import * as THREE from '${threeUrl}';`)
        .replace("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';", 'const OrbitControls = class {};')
        .replace("import './geo.js';", '');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'globe-')), 'globe.mjs');
    fs.writeFileSync(file, source);
    THREE = await import(threeUrl);
    ({ Globe } = await import(pathToFileURL(file).href));
});

// A globe without a renderer: only the parts the effects use.
function makeGlobe() {
    const g = Object.create(Globe.prototype);
    Object.assign(g, { scene: new THREE.Scene(), markers: new Map(), flashes: [], effects: [], dice: [], assets: null });
    for (const [code, lat, lon] of [['za', -29, 24], ['de', 51, 9]]) {
        const s = geo.latLonToXYZ(lat, lon, 1);
        const normal = new THREE.Vector3(s.x, s.y, s.z).normalize();
        const group = new THREE.Group();
        group.position.set(s.x, s.y, s.z);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        g.scene.add(group);
        g.markers.set(code, { code, surface: s, normal, group, height: 0.1 });
    }
    return g;
}

// Advance every effect to "ms from now", like the render loop does.
function step(g, ms) {
    const t = performance.now() + ms;
    for (let i = g.effects.length - 1; i >= 0; i--) {
        if (!g.effects[i].update(t)) { g.effects[i].dispose(); g.effects.splice(i, 1); }
    }
}
const isDieOrSpeck = (c) => c.geometry && (c.geometry.type === 'BoxGeometry' || c.geometry.type === 'SphereGeometry');
const leftovers = (g) => [...g.markers.values()].reduce((n, m) => n + m.group.children.filter(isDieOrSpeck).length, 0)
    + g.scene.children.filter(isDieOrSpeck).length;
const dice = (g, code) => g.markers.get(code).group.children.filter(c => c.geometry && c.geometry.type === 'BoxGeometry');
const pointsOut = (die, value) => {
    const n = geo.dieFaceNormal(value);
    return new THREE.Vector3(n.x, n.y, n.z).applyQuaternion(die.quaternion).y;
};

test('one die is thrown for every paired roll, on the right country', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [6, 2], [3, 5], 1600);
    step(g, 1200);
    assert.equal(g.dice.length, 4);
    assert.equal(dice(g, 'za').length, 2);
    assert.equal(dice(g, 'de').length, 2);
});

test('each die lands with the face for its rolled value pointing out of the globe', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [6, 2], [3, 5], 1600);
    step(g, 1200);
    const [a1, a2] = dice(g, 'za'), [d1, d2] = dice(g, 'de');
    for (const [die, v] of [[a1, 6], [a2, 2], [d1, 3], [d2, 5]]) {
        assert.ok(Math.abs(pointsOut(die, v) - 1) < 1e-6, `die ${v} does not show its face`);
    }
});

test('winning dice turn green, losing dice turn red, ties stay white', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [6, 2, 4], [3, 5, 4], 1600);
    step(g, 1200);
    const colours = dice(g, 'za').map(d => d.material[0].color.getHex());
    assert.deepEqual(colours, [0xc8f7d0, 0xff9a9a, 0xffffff]);
});

test('a lost die sends up a burst of specks', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [1], [6], 1600);
    step(g, 1200);                      // the die lands, so the burst starts
    const specks = g.markers.get('za').group.children.filter(c => c.geometry && c.geometry.type === 'SphereGeometry');
    assert.equal(specks.length, 7);
});

test('a tie sends no burst', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [3], [3], 1600);
    step(g, 1200);
    for (const m of g.markers.values()) assert.ok(!m.group.children.some(c => c.geometry && c.geometry.type === 'SphereGeometry'));
});

test('a new roll clears the old dice first', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [6, 6], [1, 1], 1600);
    g.rollDice('za', 'de', [4], [4], 800);
    assert.equal(g.dice.length, 2);
    assert.equal(dice(g, 'za').length, 1);
});

test('dice and specks clean up after themselves', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [1, 2], [6, 5], 800);
    step(g, 5000); step(g, 5000);
    assert.equal(g.effects.length, 0);
    assert.equal(leftovers(g), 0);
});

test('soldiers march, are never more than eight, then disappear and flash on arrival', () => {
    const g = makeGlobe();
    g.flash = (code) => { g.flashed = code; };
    g.sendTroops('za', 'de', 12, 0xffffff, 900);
    step(g, 150); step(g, 450);
    const visible = g.scene.children.filter(c => c.geometry && c.geometry.type === 'SphereGeometry' && c.visible).length;
    assert.ok(visible >= 1 && visible <= 8, `visible soldiers: ${visible}`);
    step(g, 5000);
    assert.equal(g.flashed, 'de');
    assert.equal(g.effects.length, 0);
    assert.equal(leftovers(g), 0);
});

test('reinforcements drop onto a country, then flash and clean up', () => {
    const g = makeGlobe();
    g.flash = (code) => { g.flashed = code; };
    g.dropReinforcements('de', 3, 0xffffff, 700);
    step(g, 2000);
    assert.equal(g.flashed, 'de');
    assert.equal(leftovers(g), 0);
});

test('clearEffects removes everything at once', () => {
    const g = makeGlobe();
    g.rollDice('za', 'de', [1, 1], [6, 6], 1600);
    g.sendTroops('za', 'de', 4, 0xffffff, 900);
    g.burst(g.markers.get('za'), 0xff0000, 5, 800);
    g.clearEffects();
    assert.equal(g.effects.length + g.dice.length, 0);
    assert.equal(leftovers(g), 0);
});

test('unknown country codes are ignored without errors', () => {
    const g = makeGlobe();
    g.rollDice('xx', 'de', [1], [2], 500);
    g.sendTroops('xx', 'de', 2, 0, 500);
    g.dropReinforcements('xx', 2, 0, 500);
    assert.equal(g.effects.length, 0);
});

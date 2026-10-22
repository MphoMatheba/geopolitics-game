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
const art = require(path.join(WEB, 'js', 'game', 'art.js'));

let THREE, Globe;
const drawCalls = [];

test.before(async () => {
    globalThis.window = globalThis;
    globalThis.GameGeo = geo;
    globalThis.GameArt = art;
    // a canvas that accepts any drawing call (and remembers drawImage calls, to check how flags are cut out)
    const fakeContext = () => new Proxy({}, {
        get: (target, prop) => prop === 'drawImage' ? (...args) => drawCalls.push(args)
            : (prop in target ? target[prop] : () => ({ addColorStop() {} })),
        set: (target, prop, value) => { target[prop] = value; return true; }
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: fakeContext }) };
    const threeUrl = pathToFileURL(path.join(WEB, 'lib', 'three', 'three.module.min.js')).href;
    // globe.js imports 'three' and OrbitControls by browser import-map names; point them at real files / a stub.
    const source = fs.readFileSync(path.join(WEB, 'js', 'game', 'globe.js'), 'utf8')
        .replace("import * as THREE from 'three';", `import * as THREE from '${threeUrl}';`)
        .replace("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';", 'const OrbitControls = class {};')
        .replace("import './geo.js';", '')
        .replace("import './art.js';", '');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'globe-')), 'globe.mjs');
    fs.writeFileSync(file, source);
    THREE = await import(threeUrl);
    ({ Globe } = await import(pathToFileURL(file).href));
});

// A globe without a renderer: only the parts the effects use.
function makeGlobe() {
    const g = Object.create(Globe.prototype);
    Object.assign(g, {
        scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1, 0.1, 100), markers: new Map(), flashes: [], effects: [], dice: [], assets: null,
        soldierTextures: new Map(), flagTextures: new Map(), flags: null, fighting: null, deathDelay: 0, spawnDelay: 0
    });
    for (const [code, lat, lon] of [['za', -29, 24], ['de', 51, 9]]) {
        const s = geo.latLonToXYZ(lat, lon, 1);
        const normal = new THREE.Vector3(s.x, s.y, s.z).normalize();
        const group = new THREE.Group();
        group.position.set(s.x, s.y, s.z);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        g.scene.add(group);
        const label = { style: {}, classList: { toggle() {} }, querySelector: () => ({ style: {}, textContent: '' }) };
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.12, 8), new THREE.MeshBasicMaterial());
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 8), new THREE.MeshBasicMaterial());
        g.markers.set(code, { code, name: code, surface: s, normal, group, ring, shadow, label, height: 0.3, squad: [], uniform: -1, flagCode: null, painted: false, baseScale: 0.6, selected: false });
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
const isDieOrSpeck = (c) => c.isSprite || (c.geometry && (c.geometry.type === 'BoxGeometry' || c.geometry.type === 'SphereGeometry'));
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

test('soldiers (each with a flag) march, are never more than eight, then disappear and flash on arrival', () => {
    const g = makeGlobe();
    g.flash = (code) => { g.flashed = code; };
    g.sendTroops('za', 'de', 12, 0xffffff, 900);
    step(g, 150); step(g, 450);
    const visible = g.scene.children.filter(c => c.isSprite && c.visible).length;   // a soldier and a flag for each
    assert.ok(visible >= 2 && visible <= 16 && visible % 2 === 0, `visible sprites: ${visible}`);
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


// ----- soldiers standing on a country -----

const owner = (id, turnOrder, isHuman, home) => ({ playerId: id, turnOrder, isHuman, homeCountryCode: home });
const board = (code, ownerPlayerId, soldiers) => ({ countries: { [code]: { ownerPlayerId, soldiers } } });
const sprites = (g, code) => g.markers.get(code).group.children.filter(c => c.isSprite);

test('a country shows one soldier for each soldier, up to five, and each carries a flag', () => {
    const g = makeGlobe();
    const me = owner('p1', 0, true, 'south-africa');
    g.update(board('za', 'p1', 3), [me]);
    assert.equal(g.markers.get('za').squad.length, 3);
    assert.equal(sprites(g, 'za').length, 6);                 // 3 soldiers + 3 flags
    g.update(board('za', 'p1', 40), [me]);
    assert.equal(g.markers.get('za').squad.length, 5);
    assert.equal(g.markers.get('za').squad.length, geo.MAX_SQUAD);
    g.update(board('za', 'p1', 0), [me]);
    assert.equal(g.markers.get('za').squad.length, 0);
});

test('soldiers wear their owner\'s uniform and carry their owner\'s home flag', () => {
    const g = makeGlobe();
    g.update(board('za', 'p2', 2), [owner('p2', 3, false, 'france')]);
    const m = g.markers.get('za');
    assert.equal(m.uniform, geo.uniformIndex(3, false));
    assert.equal(m.flagCode, 'france');
    for (const s of m.squad) {
        assert.equal(s.soldier.material.map, g.soldierTexture(m.uniform, 'idle'));
        assert.equal(s.flag.material.map, g.flagTexture('france'));
    }
});

test('when a country is conquered its soldiers change uniform and flag', () => {
    const g = makeGlobe();
    const players = [owner('p1', 0, true, 'south-africa'), owner('p2', 4, false, 'brazil')];
    g.update(board('za', 'p1', 2), players);
    const before = g.markers.get('za').squad.map(s => s.soldier);
    g.update(board('za', 'p2', 2), players);
    const m = g.markers.get('za');
    assert.equal(m.flagCode, 'brazil');
    assert.equal(m.uniform, geo.uniformIndex(4, false));
    assert.deepEqual(m.squad.map(s => s.soldier), before);    // the same figures, new colours
    assert.equal(m.squad[0].soldier.material.map, g.soldierTexture(m.uniform, 'idle'));
});

test('different players have different uniforms', () => {
    const uniforms = new Set([geo.uniformIndex(0, true), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => geo.uniformIndex(i, false))]);
    assert.equal(uniforms.size, 10);
});

test('lost soldiers fall, then are removed', () => {
    const g = makeGlobe();
    const me = [owner('p1', 0, true, 'south-africa')];
    g.update(board('za', 'p1', 4), me);
    g.update(board('za', 'p1', 2), me);
    assert.equal(g.markers.get('za').squad.length, 2);
    assert.equal(sprites(g, 'za').length, 8);                  // the two who fell are still there for a moment
    step(g, 300);
    assert.ok(g.markers.get('za').group.children.some(c => c.isSprite && c.material.rotation !== 0), 'a fallen soldier should be tipping over');
    step(g, 3000);
    assert.equal(sprites(g, 'za').length, 4);                  // 2 soldiers + 2 flags remain
    assert.equal(g.effects.length, 0);
});

test('a soldier does not fall until the dice have landed (deathDelay)', () => {
    const g = makeGlobe();
    const me = [owner('p1', 0, true, 'south-africa')];
    g.update(board('za', 'p1', 3), me);
    g.deathDelay = 800;
    g.update(board('za', 'p1', 2), me);
    step(g, 300);
    const waiting = g.effects[0];
    assert.ok(waiting, 'the fall should be queued');
    const fallen = g.markers.get('za').group.children.filter(c => c.isSprite && c.material.opacity < 1);
    assert.equal(fallen.length, 0, 'nothing should have faded yet');
    step(g, 3000);
    assert.equal(sprites(g, 'za').length, 4);
});

test('new soldiers stay hidden until their reinforcements arrive (spawnDelay), the first picture does not wait', () => {
    const g = makeGlobe();
    const me = [owner('p1', 0, true, 'south-africa')];
    g.spawnDelay = 800;
    g.update(board('za', 'p1', 2), me);                        // first picture: appears at once
    const t0 = performance.now();
    g.animateSquads(t0 + 10);
    assert.ok(g.markers.get('za').squad.every(s => s.soldier.visible));

    g.update(board('za', 'p1', 4), me);                        // two more arrive later
    const newcomers = g.markers.get('za').squad.slice(2);
    g.animateSquads(performance.now() + 100);
    assert.ok(newcomers.every(s => !s.soldier.visible && !s.flag.visible));
    g.animateSquads(performance.now() + 1200);
    assert.ok(newcomers.every(s => s.soldier.visible && s.flag.visible));
});

test('soldiers only fire in a country that is in a battle', () => {
    const g = makeGlobe();
    const me = [owner('p1', 0, true, 'south-africa')];
    g.update({ countries: { za: { ownerPlayerId: 'p1', soldiers: 4 }, de: { ownerPlayerId: 'p1', soldiers: 4 } } }, me);
    g.fighting = { a: g.markers.get('za'), d: null };
    const seen = { za: new Set(), de: new Set() };
    for (let t = 0; t < 60; t++) {
        g.animateSquads(performance.now() + t * 50);
        for (const code of ['za', 'de']) for (const s of g.markers.get(code).squad) seen[code].add(s.frame);
    }
    assert.ok(seen.za.has('fire') && seen.za.has('idle'));
    assert.deepEqual([...seen.de], ['idle']);
});

test('each flag is cut from the right place in the flag sheet', () => {
    const g = makeGlobe();
    g.flags = { image: { fake: true }, cell: [48, 36], cols: 16, map: { 'south-africa': 17, india: 0 } };
    drawCalls.length = 0;
    g.flagTexture('south-africa');
    assert.deepEqual(drawCalls[0].slice(1, 5), [48, 36, 48, 36]);    // column 1, row 1
    g.flagTexture('india');
    assert.deepEqual(drawCalls[1].slice(1, 5), [0, 0, 48, 36]);
    g.flagTexture('south-africa');
    assert.equal(drawCalls.length, 2, 'a flag already made is reused');
});

test('a country with no flag sheet or an unknown flag gets a plain flag instead of failing', () => {
    const g = makeGlobe();
    assert.ok(g.flagTexture('atlantis'));
    assert.ok(g.flagTexture(null));
    g.flags = { image: {}, cell: [48, 36], cols: 16, map: {} };
    assert.ok(g.flagTexture('atlantis'));
});

test('the marching soldiers use the mover\'s uniform and flag', () => {
    const g = makeGlobe();
    g.flash = () => {};
    g.update(board('za', 'p3', 2), [owner('p3', 5, false, 'japan')]);
    g.sendTroops('za', 'de', 2, 0xffffff, 900);
    step(g, 300);
    const marchers = g.scene.children.filter(c => c.isSprite);
    assert.ok(marchers.some(c => c.material.map === g.soldierTexture(geo.uniformIndex(5, false), 'idle')
        || c.material.map === g.soldierTexture(geo.uniformIndex(5, false), 'runA')
        || c.material.map === g.soldierTexture(geo.uniformIndex(5, false), 'runB')));
    assert.ok(marchers.some(c => c.material.map === g.flagTexture('japan')));
});

test('the row of soldiers stays level on the screen when the camera looks straight at the country', () => {
    const g = makeGlobe();
    g.update(board('za', 'p1', 5), [owner('p1', 0, true, 'south-africa')]);
    const m = g.markers.get('za');
    g.camera.position.copy(m.normal).multiplyScalar(3.2);
    g.camera.lookAt(0, 0, 0);
    g.camera.updateMatrixWorld(true);
    m.group.updateMatrixWorld(true);
    for (let i = 0; i < 120; i++) g.animateSquads(performance.now() + i * 16);     // let them settle
    m.group.updateMatrixWorld(true);

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.camera.quaternion);
    const feet = m.squad.map(s => m.group.localToWorld(s.soldier.position.clone()));
    for (let i = 1; i < feet.length; i++) {
        const step = feet[i].clone().sub(feet[i - 1]);
        assert.ok(Math.abs(step.dot(right) - 0.085) < 0.01, `soldiers ${i - 1} and ${i} are ${step.dot(right).toFixed(3)} apart sideways, not 0.085`);
        assert.ok(Math.abs(step.dot(up)) < 0.03, `the row tilts on the screen (${step.dot(up).toFixed(3)} up)`);
    }
});

test('the ground ring and shadow grow with the squad and the selection', () => {
    const g = makeGlobe();
    const me = [owner('p1', 0, true, 'south-africa')];
    g.update(board('za', 'p1', 1), me);
    const small = g.markers.get('za').ring.scale.x;
    g.update(board('za', 'p1', 5), me);
    const big = g.markers.get('za').ring.scale.x;
    assert.ok(big > small * 1.5);
    g.setSelected(['za']);
    assert.ok(g.markers.get('za').ring.scale.x > big);
    assert.equal(g.markers.get('za').shadow.scale.x, g.markers.get('za').ring.scale.x);
    g.setSelected([]);
    assert.equal(g.markers.get('za').ring.scale.x, big);
});

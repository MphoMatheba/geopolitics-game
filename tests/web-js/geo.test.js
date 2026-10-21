// Run with: node --test tests/web-js/geo.test.js
const test = require('node:test');
const assert = require('node:assert');
const geo = require('../../src/Geopolitics.Web/wwwroot/js/game/geo.js');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('every lat/lon lands exactly on the sphere', () => {
    for (const [lat, lon] of [[0, 0], [-29, 24], [90, 0], [-90, 10], [60, -95], [36, 178]]) {
        near(geo.len(geo.latLonToXYZ(lat, lon, 2)), 2);
    }
});

test('the north pole is straight up and the south pole straight down', () => {
    near(geo.latLonToXYZ(90, 0, 1).y, 1);
    near(geo.latLonToXYZ(-90, 0, 1).y, -1);
});

test('different places give different points', () => {
    const a = geo.latLonToXYZ(-29, 24, 1), b = geo.latLonToXYZ(38, -97, 1);
    assert.ok(geo.len({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }) > 1);
});

test('an arc starts and ends on the surface and rises in the middle', () => {
    const a = geo.latLonToXYZ(-29, 24, 1), b = geo.latLonToXYZ(51, 9, 1);
    const pts = geo.arcPoints(a, b, 20, 0.3, 1);
    assert.equal(pts.length, 21);
    near(geo.len(pts[0]), 1); near(geo.len(pts[20]), 1);
    near(geo.len(pts[10]), 1.3, 1e-6);
    near(pts[0].x, a.x, 1e-9); near(pts[20].y, b.y, 1e-9);
});

test('an arc between the same point does not blow up', () => {
    const a = geo.latLonToXYZ(10, 10, 1);
    const pts = geo.arcPoints(a, a, 4, 0.2, 1);
    assert.ok(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
});

test('a point is hidden when it is on the far side of the globe', () => {
    const cam = { x: 0, y: 0, z: 3 };
    assert.equal(geo.isFacing({ x: 0, y: 0, z: 1 }, cam, 1), true);
    assert.equal(geo.isFacing({ x: 0, y: 0, z: -1 }, cam, 1), false);
    assert.equal(geo.isFacing({ x: 1, y: 0, z: 0 }, cam, 1), false);   // on the horizon edge
});

test('marker height grows with soldiers but stops growing', () => {
    assert.ok(geo.markerHeight(1) < geo.markerHeight(4));
    assert.ok(geo.markerHeight(4) < geo.markerHeight(9));
    assert.equal(geo.markerHeight(36), geo.markerHeight(500));
    assert.ok(geo.markerHeight(0) > 0);
});

test('the human is gold and NPCs get different non-gold colours', () => {
    assert.equal(geo.playerColor(0, true), geo.PALETTE[0]);
    const colours = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => geo.playerColor(i, false));
    assert.equal(new Set(colours).size, 9);
    assert.ok(!colours.includes(geo.PALETTE[0]));
});

test('every value 1-6 appears on exactly one die face and opposite faces add up to 7', () => {
    assert.deepEqual([...geo.DIE_FACE_VALUES].sort(), [1, 2, 3, 4, 5, 6]);
    for (let i = 0; i < 6; i += 2) assert.equal(geo.DIE_FACE_VALUES[i] + geo.DIE_FACE_VALUES[i + 1], 7);
});

test('the face normal of each value points along one axis, and different values differ', () => {
    const seen = new Set();
    for (let v = 1; v <= 6; v++) {
        const n = geo.dieFaceNormal(v);
        near(geo.len(n), 1);
        seen.add(`${n.x},${n.y},${n.z}`);
    }
    assert.equal(seen.size, 6);
});

test('each die face has as many pips as its value, inside the face', () => {
    for (let v = 1; v <= 6; v++) {
        assert.equal(geo.PIPS[v].length, v);
        for (const [x, y] of geo.PIPS[v]) assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
    }
});

test('the higher die wins each pair and a tie changes nothing', () => {
    const r = geo.diceOutcomes([1, 4, 3], [2, 3, 3]);
    assert.deepEqual(r.attacker, ['lose', 'win', 'tie']);
    assert.deepEqual(r.defender, ['win', 'lose', 'tie']);
});

test('only paired dice are compared when the sides roll different numbers', () => {
    const r = geo.diceOutcomes([6, 5], [1]);
    assert.equal(r.attacker.length, 1);
    assert.equal(r.defender.length, 1);
});

test('pointAlong starts at the first point, ends at the last and finds the middle', () => {
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 4, z: 0 }];
    assert.deepEqual(geo.pointAlong(pts, 0), { x: 0, y: 0, z: 0 });
    assert.deepEqual(geo.pointAlong(pts, 1), { x: 2, y: 4, z: 0 });
    assert.deepEqual(geo.pointAlong(pts, 0.25), { x: 1, y: 0, z: 0 });
    assert.deepEqual(geo.pointAlong(pts, 0.75), { x: 2, y: 2, z: 0 });
});

test('pointAlong stays on the path when u is out of range, and works with two points', () => {
    const two = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }];
    assert.deepEqual(geo.pointAlong(two, -1), { x: 0, y: 0, z: 0 });
    assert.deepEqual(geo.pointAlong(two, 5), { x: 0, y: 10, z: 0 });
    assert.deepEqual(geo.pointAlong(two, 0.5), { x: 0, y: 5, z: 0 });
});

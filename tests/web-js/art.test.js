// Checks the pixel soldiers and watercolour dice drawn in code (js/game/art.js).
// A recording canvas stands in for a real one, so no browser or image library is needed.
// Run with: node --test tests/web-js/art.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const art = require(path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web', 'wwwroot', 'js', 'game', 'art.js'));

// a canvas that writes down what is drawn
function recorder() {
    const calls = [];
    const ctx = new Proxy({}, {
        get: (t, prop) => {
            if (prop === 'calls') return calls;
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() {} });
            return (...args) => calls.push({ method: prop, args, fillStyle: t.fillStyle });
        },
        set: (t, prop, value) => { t[prop] = value; return true; }
    });
    return ctx;
}

test('every pose is the same size and uses only known parts', () => {
    assert.deepEqual([...art.FRAME_NAMES].sort(), ['fire', 'idle', 'runA', 'runB']);
    const known = new Set(Object.keys(art.palette(0)).concat('.'));
    for (const [name, rows] of Object.entries(art.frames)) {
        assert.equal(rows.length, art.HEIGHT, name + ' has the wrong height');
        rows.forEach((row, i) => {
            assert.equal(row.length, art.WIDTH, `${name} row ${i} is ${row.length} wide, not ${art.WIDTH}`);
            for (const ch of row) assert.ok(known.has(ch), `${name} row ${i} uses unknown part "${ch}"`);
        });
    }
});

test('every uniform colours every part that the soldiers use', () => {
    const used = new Set(Object.values(art.frames).flat().join('').replace(/\./g, '').split(''));
    assert.equal(art.UNIFORMS.length, 10);
    for (let u = 0; u < art.UNIFORMS.length; u++) {
        const colours = art.palette(u);
        for (const part of used) assert.match(colours[part] || '', /^#[0-9a-f]{6}$/i, `uniform ${u} has no colour for "${part}"`);
    }
});

test('the ten uniforms are really different from each other', () => {
    const helmets = new Set(art.UNIFORMS.map(u => u.H));
    const bodies = new Set(art.UNIFORMS.map(u => u.U));
    assert.equal(helmets.size, 10);
    assert.equal(bodies.size, 10);
});

test('the human player\'s uniform is the green camouflage', () => {
    assert.equal(art.UNIFORMS[0].name, 'Green camouflage');
});

test('drawing a soldier paints exactly the visible pixels, at the chosen scale', () => {
    const pixels = art.frames.idle.join('').replace(/\./g, '').length;
    const ctx = recorder();
    art.paintSoldier(ctx, 'idle', 0, 3);
    const squares = ctx.calls.filter(c => c.method === 'fillRect');
    assert.equal(squares.length, pixels);
    assert.ok(squares.every(c => c.args[2] === 3 && c.args[3] === 3));
});

test('the standing, running and firing poses all differ, and firing has a muzzle flash', () => {
    const joined = (n) => art.frames[n].join('|');
    assert.notEqual(joined('idle'), joined('runA'));
    assert.notEqual(joined('runA'), joined('runB'));
    assert.notEqual(joined('idle'), joined('fire'));
    assert.ok(/[YO]/.test(art.frames.fire.join('')) && !/[YO]/.test(art.frames.idle.join('')));
});

test('the second running pose is the first one with the legs swapped', () => {
    const bodyRows = 18;
    assert.deepEqual(art.frames.runA.slice(0, bodyRows), art.frames.runB.slice(0, bodyRows));
    art.frames.runA.slice(bodyRows).forEach((row, i) => assert.equal(art.frames.runB[bodyRows + i], row.split('').reverse().join('')));
});

test('a die face has exactly as many inked pips as its number', () => {
    for (let v = 1; v <= 6; v++) {
        const ctx = recorder();
        art.paintDieFace(ctx, 128, v, 1);
        assert.equal(ctx.calls.filter(c => c.method === 'ellipse').length, v, `face ${v}`);
    }
});

test('pips sit inside the face', () => {
    for (let v = 1; v <= 6; v++) {
        const ctx = recorder();
        art.paintDieFace(ctx, 128, v, 7);
        for (const c of ctx.calls.filter(c => c.method === 'ellipse')) {
            const [x, y] = c.args;
            assert.ok(x > 10 && x < 118 && y > 10 && y < 118, `pip at ${x.toFixed(0)},${y.toFixed(0)} on face ${v}`);
        }
    }
});

test('the same seed paints the same die, a different seed paints a different one', () => {
    const paint = (seed) => { const ctx = recorder(); art.paintDieFace(ctx, 128, 5, seed); return JSON.stringify(ctx.calls.map(c => [c.method, c.args])); };
    assert.equal(paint(3), paint(3));
    assert.notEqual(paint(3), paint(4));
});

test('the pip layouts match the numbers on a real die', () => {
    for (let v = 1; v <= 6; v++) assert.equal(art.PIPS[v].length, v);
});

// Checks the home page line-up of pixel soldiers with flags (js/home.js).
// Run with: node --test tests/web-js/home.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web', 'wwwroot');
const art = require(path.join(WEB, 'js', 'game', 'art.js'));
const flagInfo = JSON.parse(fs.readFileSync(path.join(WEB, 'data', 'flags.json'), 'utf8'));

// home.js starts with a browser "import" line; take it off so it can be loaded here, with no document (so it does not run itself)
const source = fs.readFileSync(path.join(WEB, 'js', 'home.js'), 'utf8').replace(/^import .*\n/, '');
const loaded = { exports: {} };
new Function('module', 'document', source)(loaded, undefined);
const home = loaded.exports;

function recorder() {
    const calls = [];
    const ctx = new Proxy({}, {
        get: (t, prop) => prop === 'calls' ? calls : (...args) => calls.push({ method: prop, args }),
        set: (t, prop, value) => { t[prop] = value; return true; }
    });
    return ctx;
}
function draw(flags) {
    const ctx = recorder();
    const uniforms = [];
    const fakeArt = { WIDTH: art.WIDTH, HEIGHT: art.HEIGHT, paintSoldier: (c, frame, uniform) => uniforms.push(uniform) };
    home.drawLineup(ctx, { art: fakeArt, flags, makeCanvas: () => ({ getContext: () => recorder() }) });
    return { ctx, uniforms };
}
const sheet = { image: { fake: true }, cell: flagInfo.cell, cols: flagInfo.cols, map: flagInfo.map };

test('the line-up has ten soldiers in ten different uniforms', () => {
    const { uniforms } = draw(sheet);
    assert.deepEqual(uniforms, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('every soldier has a flag above the head, cut from the right place on the flag sheet', () => {
    const { ctx } = draw(sheet);
    const images = ctx.calls.filter(c => c.method === 'drawImage');
    const flags = images.filter(c => c.args[0] === sheet.image);
    assert.equal(images.length, 20);                                  // 10 soldiers + 10 flags
    assert.equal(flags.length, 10);
    home.COUNTRIES.forEach((code, i) => {
        const cell = flagInfo.map[code];
        assert.deepEqual(flags[i].args.slice(1, 3), [(cell % flagInfo.cols) * flagInfo.cell[0], Math.floor(cell / flagInfo.cols) * flagInfo.cell[1]], code);
    });
});

test('every country in the line-up has a flag in the sheet', () => {
    for (const code of home.COUNTRIES) assert.ok(flagInfo.map[code] !== undefined, code + ' has no flag');
});

test('without the flag sheet the soldiers are still drawn, just without flags', () => {
    const { ctx } = draw(null);
    assert.equal(ctx.calls.filter(c => c.method === 'drawImage').length, 10);
});

test('the soldiers and flags fit inside the picture', () => {
    const size = home.lineupSize(home.COUNTRIES.length);
    const { ctx } = draw(sheet);
    for (const c of ctx.calls.filter(c => c.method === 'drawImage')) {
        const [x, y, w, h] = c.args.length === 5 ? c.args.slice(1) : c.args.slice(5);
        assert.ok(x >= 0 && y >= 0 && x + w <= size.width && y + h <= size.height, `a picture at ${x},${y} (${w}x${h}) is outside ${size.width}x${size.height}`);
    }
});

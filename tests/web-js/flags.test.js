// Checks the flag sprite sheet covers every country in the game.
// Run with: node --test tests/web-js/flags.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', 'src');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'Geopolitics.Data', 'Seed', 'countries.json'), 'utf8'));
const flags = JSON.parse(fs.readFileSync(path.join(ROOT, 'Geopolitics.Web', 'wwwroot', 'data', 'flags.json'), 'utf8'));
const png = fs.readFileSync(path.join(ROOT, 'Geopolitics.Web', 'wwwroot', 'img', 'flags.png'));

test('every country in the game has a flag', () => {
    for (const c of seed) assert.ok(flags.map[c.code] !== undefined, `${c.name} (${c.code}) has no flag`);
});

test('each country has its own place on the sheet, inside the grid', () => {
    const places = Object.values(flags.map);
    assert.equal(new Set(places).size, places.length, 'two countries share a flag cell');
    for (const i of places) assert.ok(Number.isInteger(i) && i >= 0 && i < flags.cols * flags.rows);
});

test('the sheet picture is exactly as big as the grid says', () => {
    assert.equal(png.slice(1, 4).toString(), 'PNG');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, flags.cols * flags.cell[0]);
    assert.ok(height >= flags.rows * flags.cell[1], `sheet is ${height} high, needs ${flags.rows * flags.cell[1]}`);
});

test('the sheet is small enough to load quickly', () => {
    assert.ok(png.length < 400 * 1024, 'flag sheet is ' + Math.round(png.length / 1024) + ' KB');
});

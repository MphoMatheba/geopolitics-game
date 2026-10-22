// Checks the standalone page check (wwwroot/diagnose.html) lists real files and matches the game page.
// Run with: node --test tests/web-js/diagnose.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web');
const html = fs.readFileSync(path.join(WEB, 'wwwroot', 'diagnose.html'), 'utf8');

const files = [...html.matchAll(/\{ url: '([^']+)'(, optional: true)? \}/g)].map(m => ({ url: m[1], optional: !!m[2] }));
const modules = (html.match(/var MODULES = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1));

test('every file the page check lists exists on disk (except the ones added by later bundles)', () => {
    assert.ok(files.length >= 10, 'expected the file list, found ' + files.length);
    for (const f of files.filter(f => !f.optional)) {
        assert.ok(fs.existsSync(path.join(WEB, 'wwwroot', f.url)), f.url + ' is listed but missing');
    }
});

test('every module the page check loads is also in its file list', () => {
    const listed = new Set(files.map(f => f.url));
    for (const m of modules) assert.ok(listed.has(m), m + ' is loaded but not listed');
});

test('the page check uses the same import map as the game page', () => {
    const map = (text) => JSON.parse(text.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
    const game = fs.readFileSync(path.join(WEB, 'Views', 'Game', 'Details.cshtml'), 'utf8');
    assert.deepEqual(map(html), map(game));
});

test('the page check has a script that parses and shows a plain message for each failure it can find', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Function('return async function () {' + script.replace(/\bawait import\(/g, 'await (0, eval)(') + '}'));
    for (const text of ['import maps', 'WebGL', 'could not be fetched', 'failed to load', 'could not be created', 'drawing nothing']) {
        assert.ok(script.includes(text), 'no message mentions "' + text + '"');
    }
});

test('the routes the page check calls exist in the game and API controllers', () => {
    const game = fs.readFileSync(path.join(WEB, 'Controllers', 'GameController.cs'), 'utf8');
    const api = fs.readFileSync(path.join(WEB, 'Controllers', 'GamesApiController.cs'), 'utf8');
    assert.ok(game.includes('HttpGet("g/{id}")') && html.includes("'/g/'"), 'the game page route /g/{id}');
    assert.ok(/IActionResult> My\(/.test(game) && html.includes("'/Game/My'"), 'the list of games /Game/My');
    assert.ok(api.includes('[Route("api/games")]') && html.includes("'/api/games/'"), 'the game API /api/games/{id}');
    assert.ok(api.includes('HttpGet("{id}/events")') && html.includes("/events?after=0"), 'the events API');
});

test('the page check reports each way the real game page can be broken', () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const text of ['You are not logged in', 'You have no games yet', 'script tag is missing', 'NO import map',
                        'is still on "Loading..."', 'There is no globe canvas', 'fails to load', 'Players have no home country']) {
        assert.ok(script.includes(text), 'no message mentions "' + text + '"');
    }
});

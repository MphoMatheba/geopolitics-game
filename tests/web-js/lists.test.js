// Checks searching and filtering (Countries tab, My games) and the always-visible roster.
// Run with: node --test tests/web-js/lists.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web');
const read = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');
const { filterCountries, filterGames } = require(path.join(WEB, 'wwwroot', 'js', 'game', 'lists.js'));

const countries = [
    { name: 'South Africa', ownerName: 'MMM (you)', ownerPlayerId: 'p1' },
    { name: 'Germany', ownerName: 'France (NPC)', ownerPlayerId: 'p2' },
    { name: 'France', ownerName: 'France (NPC)', ownerPlayerId: 'p2' },
    { name: 'Brazil', ownerName: 'Brazil (NPC)', ownerPlayerId: 'p3' }
];
const names = (rows) => rows.map(r => r.name);

test('no filter shows every country', () => {
    assert.deepEqual(names(filterCountries(countries, { text: '', owner: '' })), ['South Africa', 'Germany', 'France', 'Brazil']);
    assert.equal(filterCountries(countries, undefined).length, 4);
});

test('searching matches part of a country name, ignoring capitals and spaces around it', () => {
    assert.deepEqual(names(filterCountries(countries, { text: '  AFRI ' })), ['South Africa']);
    assert.deepEqual(names(filterCountries(countries, { text: 'an' })), ['Germany', 'France']);   // 'Germany' and 'France' have it in the name
});

test('searching also matches the owner, so you can find everything a rival holds', () => {
    assert.deepEqual(names(filterCountries(countries, { text: 'france (npc)' })), ['Germany', 'France']);
});

test('the owner filter shows only that player\'s countries', () => {
    assert.deepEqual(names(filterCountries(countries, { owner: 'p2' })), ['Germany', 'France']);
    assert.deepEqual(names(filterCountries(countries, { owner: 'p1' })), ['South Africa']);
});

test('text and owner together must both match', () => {
    assert.deepEqual(names(filterCountries(countries, { text: 'ger', owner: 'p2' })), ['Germany']);
    assert.deepEqual(names(filterCountries(countries, { text: 'ger', owner: 'p3' })), []);
});

test('a search with no match gives an empty list (the page then says "No country matches")', () => {
    assert.deepEqual(filterCountries(countries, { text: 'atlantis' }), []);
});

const games = [
    { status: 'InProgress', started: '2026-10-22 05:07' },
    { status: 'InProgress', started: '2026-10-22 05:02' },
    { status: 'Lost', started: '2026-10-22 05:02' },
    { status: 'Won', started: '2026-10-19 11:45' }
];

test('My games: no filter shows all games', () => {
    assert.equal(filterGames(games, { text: '', status: '' }).length, 4);
    assert.equal(filterGames(games, undefined).length, 4);
});

test('My games: the status filter is exact', () => {
    assert.deepEqual(filterGames(games, { status: 'Lost' }).map(g => g.started), ['2026-10-22 05:02']);
    assert.equal(filterGames(games, { status: 'InProgress' }).length, 2);
    assert.equal(filterGames(games, { status: 'Won' }).length, 1);
});

test('My games: searching matches the date or the status', () => {
    assert.equal(filterGames(games, { text: '2026-10-19' }).length, 1);
    assert.equal(filterGames(games, { text: '05:02' }).length, 2);
    assert.equal(filterGames(games, { text: 'progress' }).length, 2);
});

test('My games: search and status together must both match', () => {
    assert.deepEqual(filterGames(games, { text: '05:02', status: 'Lost' }).length, 1);
    assert.deepEqual(filterGames(games, { text: '2026-10-19', status: 'Lost' }), []);
});

test('the game page has the roster and the Countries filter controls, and the script uses them', () => {
    const details = read('Views', 'Game', 'Details.cshtml'), page = read('wwwroot', 'js', 'game', 'page.js');
    for (const id of ['roster', 'country-search', 'country-owner']) {
        assert.ok(details.includes(`id="${id}"`), 'Details.cshtml lacks #' + id);
        assert.ok(page.includes(`$('${id}')`), 'page.js does not use #' + id);
    }
    assert.ok(page.includes('lists.filterCountries') && page.includes("import './lists.js'"));
    assert.ok(details.indexOf('id="roster"') < details.indexOf('id="narration"'), 'the roster sits under the stage');
});

test('every country gets a chip in the roster, painted from all countries (not the filtered ones)', () => {
    const page = read('wwwroot', 'js', 'game', 'page.js');
    const body = page.slice(page.indexOf('function paintLists'), page.indexOf('function paintPlayers'));
    assert.ok(body.indexOf('for (const r of rows)') < body.indexOf('filterCountries'), 'the roster must be built from every row, before filtering');
});

test('My games has the search box, the status filter and rows that carry their status and date', () => {
    const view = read('Views', 'Game', 'My.cshtml'), script = read('wwwroot', 'js', 'my-games.js');
    for (const id of ['game-search', 'game-status', 'game-count']) {
        assert.ok(view.includes(`id="${id}"`), 'My.cshtml lacks #' + id);
        assert.ok(script.includes(`'${id}'`), 'my-games.js does not use #' + id);
    }
    assert.ok(view.includes('data-status="@state"') && view.includes('data-started="@started"'));
    assert.ok(view.indexOf('lists.js') > 0 && view.indexOf('lists.js') < view.indexOf('my-games.js'), 'lists.js must load before my-games.js');
    for (const value of ['InProgress', 'Won', 'Lost']) assert.ok(view.includes(`<option value="${value}">`), 'no status option ' + value);
    assert.equal((view.match(/@section Scripts \{/g) || []).length, 1);
});

// The game page. It talks to the server API, replays events through the
// playback queue, and drives the 3D globe and the side panels.
// The server snapshot is always the truth: when playback finishes, the shown
// board is reset to it.
import './playback.js';
import './geo.js';
import { Globe } from './globe.js';

const { Playback } = window.GamePlayback;
const geo = window.GameGeo;

const $ = (id) => document.getElementById(id);
const gameId = $('app').dataset.gameId;
const FACES = ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

let snap = null;          // last settled snapshot from the server
let latest = null;        // newest snapshot received (may be ahead while events replay)
let lastSeq = 0;
let busy = false;         // posting a move, or replaying events
let first = true;
let globe = null;
let tumble = null;
let toastTimer = null;
let selected = { from: null, to: null };

const playback = new Playback({
    onStep: (ev, board) => showEvent(ev, board),
    onBoard: (board) => paintBoard(board)
});

// ---------- API ----------

async function call(method, path, data) {
    const options = { method, headers: {} };
    if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data || {});
    }
    const res = await fetch('/api/games/' + gameId + path, options);
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return { ok: res.ok, status: res.status, body };
}

// ---------- helpers ----------

const player = (id) => snap.players.find(p => p.playerId === id);
const playerName = (id) => (player(id) || {}).name || id;
const countryName = (code) => { const c = snap.countries.find(x => x.code === code); return c ? c.name : code; };
const colourOf = (id) => { const p = player(id); return p ? geo.playerColor(p.turnOrder, p.isHuman) : '#888'; };
const humanId = () => snap.players.find(p => p.isHuman).playerId;

function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), playback.fast ? 1200 : 3000);
}

// ---------- painting ----------

function paintBoard(board) {
    if (!snap) return;
    if (globe) globe.update(board, snap.players);

    const tbody = $('countries').querySelector('tbody');
    tbody.innerHTML = '';
    const rows = Object.keys(board.countries)
        .map(code => ({ code, name: countryName(code), ...board.countries[code] }))
        .sort((a, b) => b.soldiers - a.soldiers || a.name.localeCompare(b.name));
    for (const r of rows) {
        const tr = document.createElement('tr');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = colourOf(r.ownerPlayerId);
        const name = document.createElement('td');
        name.append(dot, ' ' + r.name);
        const owner = document.createElement('td');
        owner.textContent = playerName(r.ownerPlayerId);
        const n = document.createElement('td');
        n.className = 'text-end fw-bold';
        n.textContent = r.soldiers;
        tr.append(name, owner, n);
        tbody.appendChild(tr);
    }
}

function paintPlayers() {
    const ul = $('players');
    ul.innerHTML = '';
    for (const p of snap.players) {
        const li = document.createElement('li');
        if (p.playerId === snap.currentPlayerId && snap.status === 'InProgress') li.className = 'current';
        if (p.isEliminated) li.classList.add('out');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = geo.playerColor(p.turnOrder, p.isHuman);
        li.append(dot, ' ' + p.name + (p.isHuman ? ' (you)' : '') + ' \u00B7 ' + p.countriesOwned + ' ' +
            (p.countriesOwned === 1 ? 'country' : 'countries') + (p.isEliminated ? ' \u00B7 out' : ''));
        ul.appendChild(li);
    }
}

function fillSelect(select, countries) {
    const keep = select.value;
    select.innerHTML = '';
    for (const c of countries) {
        const o = document.createElement('option');
        o.value = c.code;
        o.textContent = c.name + ' (' + c.soldiers + ')';
        select.appendChild(o);
    }
    if (Array.from(select.options).some(o => o.value === keep)) select.value = keep;
}

function paintStatus() {
    $('role').textContent = snap.isOwner ? 'Your game' : 'Spectating';
    $('role').className = 'badge ' + (snap.isOwner ? 'bg-success' : 'bg-secondary');
    let status;
    if (snap.status === 'Won') status = 'Victory! The world is conquered.';
    else if (snap.status === 'Lost') status = 'Defeat. The player was eliminated.';
    else {
        status = 'Round ' + snap.round + ' \u00B7 ' + playerName(snap.currentPlayerId) + "'s turn";
        if (snap.pendingReinforcements > 0) status += ' \u00B7 ' + snap.pendingReinforcements + ' soldier(s) to place';
    }
    $('status').textContent = status;
}

function paintControls() {
    const playing = playback.isPlaying;
    $('playing').classList.toggle('d-none', !playing);
    $('controls').classList.toggle('d-none', !snap.canPlay || playing);
    $('ff').classList.toggle('d-none', !playing);
    if (!snap.canPlay || playing) return;

    const human = humanId();
    const mine = snap.countries.filter(c => c.ownerPlayerId === human);
    const others = snap.countries.filter(c => c.ownerPlayerId !== human);
    fillSelect($('rf-country'), mine);
    fillSelect($('tf-from'), mine);
    fillSelect($('tf-to'), mine);
    fillSelect($('at-from'), mine);
    fillSelect($('at-to'), others);

    const attacking = snap.phase === 'Attacking';
    const pending = snap.pendingReinforcements > 0;
    $('rf-go').disabled = attacking || !pending;
    $('tf-go').disabled = attacking || pending;
    $('at-start').disabled = attacking || pending || snap.hasAttackedThisTurn;
    $('at-roll').disabled = !attacking;
    $('at-stop').disabled = !attacking;
    $('end-turn').disabled = attacking || pending;

    // an attack already in progress (for example after a refresh) is shown on the globe
    if (attacking && snap.activeAttack && globe) {
        globe.showBattle(snap.activeAttack.attackerCode, snap.activeAttack.defenderCode);
    }
    highlight();
}

function paintAll() {
    paintStatus();
    paintPlayers();
    paintControls();
}

function highlight() {
    selected = { from: $('at-from').value || null, to: $('at-to').value || null };
    if (globe) globe.setSelected([selected.from, selected.to].filter(Boolean));
}

// ---------- events: log, battle card, effects ----------

function dieSpan(value, outcome) {
    const s = document.createElement('span');
    s.className = 'die ' + outcome;
    s.textContent = FACES[value - 1] || value;
    s.title = String(value);
    return s;
}

function showDice(ev) {
    clearInterval(tumble);
    const a = $('dice-a'), d = $('dice-d');
    const final = () => {
        a.innerHTML = ''; d.innerHTML = '';
        ev.attackerRolls.forEach((v, i) => {
            const w = ev.defenderRolls[i];
            a.appendChild(dieSpan(v, v > w ? 'win' : v < w ? 'lose' : 'tie'));
            d.appendChild(dieSpan(w, w > v ? 'win' : w < v ? 'lose' : 'tie'));
        });
        $('dice-result').textContent = 'Attacker loses ' + ev.attackerLosses + ' \u00B7 Defender loses ' + ev.defenderLosses;
    };
    const ms = playback.fast ? 120 : 600;
    const end = performance.now() + ms;
    $('dice-result').textContent = '';
    tumble = setInterval(() => {
        if (performance.now() >= end) { clearInterval(tumble); final(); return; }
        for (const [box, rolls] of [[a, ev.attackerRolls], [d, ev.defenderRolls]]) {
            box.innerHTML = '';
            rolls.forEach(() => box.appendChild(dieSpan(1 + Math.floor(Math.random() * 6), 'tie')));
        }
    }, 70);
}

function addLog(ev) {
    const li = document.createElement('li');
    li.className = 'ev ev-' + ev.type;
    li.style.borderLeftColor = colourOf(ev.playerId);
    const main = document.createElement('div');
    main.textContent = '[R' + ev.round + '] ' + ev.message;
    li.appendChild(main);
    if (ev.attackerRolls && ev.attackerRolls.length) {
        const dice = document.createElement('div');
        dice.className = 'muted';
        dice.textContent = 'Dice: [' + ev.attackerRolls.join(', ') + '] vs [' + ev.defenderRolls.join(', ') + ']';
        li.appendChild(dice);
    }
    if (ev.justification) {
        const why = document.createElement('div');
        why.className = 'why';
        why.textContent = 'Why: ' + ev.justification;
        li.appendChild(why);
    }
    if (ev.commentary) {
        const say = document.createElement('div');
        say.className = 'say';
        say.textContent = '\u201C' + ev.commentary + '\u201D';
        li.appendChild(say);
    }
    const log = $('log');
    log.prepend(li);
    while (log.children.length > 300) log.lastChild.remove();
}

function showEvent(ev, board) {
    paintBoard(board);
    addLog(ev);
    $('now').textContent = ev.message;

    if (ev.justification || ev.commentary) {
        $('why').textContent = ev.justification ? playerName(ev.playerId) + ': ' + ev.justification : '';
        $('say').textContent = ev.commentary ? '\u201C' + ev.commentary + '\u201D' : '';
    }

    const colour = colourOf(ev.playerId);
    switch (ev.type) {
        case 'AttackStarted':
            $('battle').classList.remove('d-none');
            $('battle-title').textContent = countryName(ev.attackerCode) + ' \u2192 ' + countryName(ev.defenderCode);
            $('dice-a').innerHTML = ''; $('dice-d').innerHTML = ''; $('dice-result').textContent = '';
            if (globe) { globe.showBattle(ev.attackerCode, ev.defenderCode); globe.focusOn([ev.attackerCode, ev.defenderCode]); }
            break;
        case 'DiceRolled':
            $('battle').classList.remove('d-none');
            showDice(ev);
            break;
        case 'CountryConquered':
            if (globe) { globe.flash(ev.toCode, colour); globe.focusOn([ev.toCode]); }
            toast(ev.message);
            break;
        case 'AttackEnded':
            if (globe) globe.clearBattle();
            break;
        case 'Reinforce':
        case 'Transfer':
            if (globe) { globe.flash(ev.toCode, colour); globe.focusOn([ev.toCode]); }
            break;
        case 'PlayerEliminated':
        case 'GameWon':
        case 'GameLost':
            toast(ev.message);
            break;
    }
}

// ---------- keeping the page in step with the server ----------

function noteSequence(events) {
    for (const e of events) if (e.sequence > lastSeq) lastSeq = e.sequence;
}

async function waitUntilIdle() {
    while (playback.isPlaying) await new Promise(r => setTimeout(r, 100));
}

// After replaying, show exactly what the server says.
function settle() {
    if (latest) snap = latest;
    playback.reset(snap);
    if (globe) { globe.clearBattle(); }
    $('battle').classList.add('d-none');
    $('now').textContent = '';
    if (snap.canPlay) {                 // fast-forward lasts until it is the player's turn again
        playback.setFast(false);
        if (globe) globe.setFast(false);
        paintFast();
    }
    paintAll();
}

async function replay(events) {
    noteSequence(events);
    playback.enqueue(events);           // starts playing straight away
    paintAll();                         // so the controls are hidden while events play
    await waitUntilIdle();
    settle();
}

function paintFast() {
    $('ff').textContent = playback.fast ? '\u23E9 Fast-forward: on' : '\u23E9 Fast-forward';
    $('ff').classList.toggle('active', playback.fast);
}

$('ff').onclick = () => {
    playback.setFast(!playback.fast);
    if (globe) globe.setFast(playback.fast);
    paintFast();
};

async function act(path, data) {
    if (busy) return;
    busy = true;
    $('msg').textContent = '';
    try {
        const r = await call('POST', path, data);
        if (!r.ok) {
            $('msg').textContent = r.status === 401 ? 'Please log in again.'
                : (r.body && r.body.error) || ('Request failed (' + r.status + ').');
            return;
        }
        if (r.body.game) latest = r.body.game;
        await replay(r.body.events || []);
    } finally {
        busy = false;
    }
}

async function loadHistory() {
    let batch;
    do {
        const e = await call('GET', '/events?after=' + lastSeq);
        batch = e.ok ? e.body : [];
        for (const ev of batch) { playback.seen.add(ev.sequence); addLog(ev); }
        noteSequence(batch);
    } while (batch.length === 500);
}

async function refresh() {
    if (busy || playback.isPlaying) return;
    const g = await call('GET', '');
    if (!g.ok) {
        $('status').textContent = g.status === 404 ? 'Game not found.' : 'Could not load the game.';
        return;
    }
    latest = g.body;

    if (first) {
        first = false;
        snap = latest;
        if (globe) globe.setCountries(snap.countries.map(c => ({ code: c.code, name: c.name })));
        playback.reset(snap);
        await loadHistory();            // earlier events go straight into the log
        paintAll();
        return;
    }
    if (latest.lastEventSequence === lastSeq) {
        if (!snap || latest.lastEventSequence !== snap.lastEventSequence) { snap = latest; playback.reset(snap); paintAll(); }
        return;
    }

    // Someone else (the owner, when we are spectating) moved: replay it live.
    busy = true;
    try {
        let batch;
        const events = [];
        do {
            const e = await call('GET', '/events?after=' + (events.length ? events[events.length - 1].sequence : lastSeq));
            batch = e.ok ? e.body : [];
            events.push(...batch);
        } while (batch.length === 500);
        await replay(events);
    } finally {
        busy = false;
    }
}

// ---------- controls ----------

$('rf-go').onclick = () => act('/reinforce', { countryCode: $('rf-country').value, count: parseInt($('rf-count').value, 10) });
$('tf-go').onclick = () => act('/transfer', { fromCode: $('tf-from').value, toCode: $('tf-to').value, count: parseInt($('tf-count').value, 10) });
$('at-start').onclick = () => act('/attack', { attackerCode: $('at-from').value, defenderCode: $('at-to').value });
$('at-roll').onclick = () => act('/roll');
$('at-stop').onclick = () => act('/stop');
$('end-turn').onclick = () => act('/end');
$('at-from').onchange = highlight;
$('at-to').onchange = highlight;

// Clicking a country on the globe fills in the matching drop-downs.
function picked(code) {
    if (!snap || !snap.canPlay || playback.isPlaying) return;
    const c = snap.countries.find(x => x.code === code);
    if (!c) return;
    if (c.ownerPlayerId === humanId()) {
        for (const id of ['at-from', 'rf-country', 'tf-from']) $(id).value = code;
    } else {
        $('at-to').value = code;
    }
    highlight();
}

// ---------- start ----------

async function start() {
    try {
        const [coords, landDots] = await Promise.all([
            fetch('/data/country-coords.json').then(r => r.json()),
            fetch('/data/land-dots.json').then(r => r.json())
        ]);
        globe = new Globe($('globe'), $('labels'), { coords, landDots });
        globe.onPick = picked;
    } catch (err) {
        console.error('3D globe unavailable', err);
        $('globe').innerHTML = '<div class="globe-fallback">The 3D view needs WebGL, which is not available here. ' +
            'The country list and controls still work.</div>';
    }
    await refresh();
    setInterval(refresh, 2000);
}

start();

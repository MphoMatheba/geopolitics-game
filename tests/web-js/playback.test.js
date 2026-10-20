// Run with: node --test tests/web-js
const test = require('node:test');
const assert = require('node:assert');
const { Playback, applyEvent, boardFromSnapshot } = require('../../src/Geopolitics.Web/wwwroot/js/game/playback.js');

const snapshot = {
    countries: [
        { code: 'a', ownerPlayerId: 'p1', soldiers: 5 },
        { code: 'b', ownerPlayerId: 'p1', soldiers: 3 },
        { code: 'c', ownerPlayerId: 'p2', soldiers: 4 }
    ]
};
const ev = (sequence, type, extra = {}) => ({ sequence, type, playerId: 'p1', attackerLosses: 0, defenderLosses: 0, count: 0, ...extra });

test('reinforce adds soldiers to the target country', () => {
    const b = applyEvent(boardFromSnapshot(snapshot), ev(1, 'Reinforce', { toCode: 'a', count: 2 }));
    assert.equal(b.countries.a.soldiers, 7);
});

test('transfer moves soldiers between two countries', () => {
    const b = applyEvent(boardFromSnapshot(snapshot), ev(1, 'Transfer', { fromCode: 'a', toCode: 'b', count: 3 }));
    assert.equal(b.countries.a.soldiers, 2);
    assert.equal(b.countries.b.soldiers, 6);
});

test('dice losses are taken from both sides', () => {
    const b = applyEvent(boardFromSnapshot(snapshot),
        ev(1, 'DiceRolled', { attackerCode: 'a', defenderCode: 'c', attackerLosses: 1, defenderLosses: 2 }));
    assert.equal(b.countries.a.soldiers, 4);
    assert.equal(b.countries.c.soldiers, 2);
});

test('conquest changes owner and sets the reward soldiers', () => {
    const b = applyEvent(boardFromSnapshot(snapshot), ev(1, 'CountryConquered', { toCode: 'c', count: 2 }));
    assert.equal(b.countries.c.ownerPlayerId, 'p1');
    assert.equal(b.countries.c.soldiers, 2);
});

test('applyEvent does not change the board it was given', () => {
    const before = boardFromSnapshot(snapshot);
    applyEvent(before, ev(1, 'Reinforce', { toCode: 'a', count: 9 }));
    assert.equal(before.countries.a.soldiers, 5);
});

test('events are shown in order, one at a time, and the board moves forward', async () => {
    const steps = [];
    const p = new Playback({ sleep: async () => {}, onStep: (e, board) => steps.push([e.sequence, board.countries.a.soldiers]) });
    p.reset(snapshot);
    await p.enqueue([ev(1, 'Reinforce', { toCode: 'a', count: 1 }), ev(2, 'Reinforce', { toCode: 'a', count: 1 })]);
    assert.deepEqual(steps, [[1, 6], [2, 7]]);
    assert.equal(p.isPlaying, false);
});

test('an event with a sequence number already seen is not replayed', async () => {
    let shown = 0;
    const p = new Playback({ sleep: async () => {}, onStep: () => shown++ });
    p.reset(snapshot);
    await p.enqueue([ev(1, 'TurnSkipped')]);
    await p.enqueue([ev(1, 'TurnSkipped'), ev(2, 'TurnSkipped')]);
    assert.equal(shown, 2);
});

test('fast-forward shortens every pause but still shows every event', async () => {
    const waits = [], shown = [];
    const p = new Playback({ sleep: async (ms) => { waits.push(ms); }, onStep: (e) => shown.push(e.sequence) });
    p.reset(snapshot);
    await p.enqueue([ev(1, 'DiceRolled', { attackerCode: 'a', defenderCode: 'c' })]);
    p.setFast(true);
    await p.enqueue([ev(2, 'DiceRolled', { attackerCode: 'a', defenderCode: 'c' })]);
    assert.deepEqual(shown, [1, 2]);
    assert.ok(waits[1] < waits[0] / 4, `fast ${waits[1]}ms should be much shorter than normal ${waits[0]}ms`);
    assert.ok(waits[1] > 0);
});

test('turning fast-forward on mid-playback speeds up the events still waiting', async () => {
    const waits = [];
    let p;
    p = new Playback({
        // the player presses fast-forward while the first pause is running
        sleep: async (ms) => { waits.push(ms); p.setFast(true); },
        onStep: () => {}
    });
    p.reset(snapshot);
    await p.enqueue([ev(1, 'DiceRolled'), ev(2, 'DiceRolled'), ev(3, 'DiceRolled')]);
    assert.ok(waits[0] > waits[1]);
    assert.equal(waits[1], waits[2]);
});

// Replays game events one at a time so the player can watch NPC turns.
//
// The server plays a whole NPC turn in one request and returns a batch of
// events. This module keeps a "shown" copy of the board and moves it forward
// one event at a time. It never decides outcomes: it only displays what the
// server already decided. Fast-forward shortens the pauses; every event is
// still shown, including each NPC justification.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GamePlayback = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // Pause after each kind of event, in milliseconds.
    const NORMAL_DELAY = {
        DiceRolled: 1600, CountryConquered: 2000, AttackStarted: 1200,
        Reinforce: 900, Transfer: 900, AttackEnded: 1100, TurnSkipped: 700,
        PlayerEliminated: 1800, GameWon: 2500, GameLost: 2500, GameStarted: 600
    };
    const FAST_FACTOR = 0.15;      // fast-forward runs at about 6-7x speed
    const DEFAULT_DELAY = 900;

    // Board state is { countries: { code: { ownerPlayerId, soldiers } } }.
    function boardFromSnapshot(snapshot) {
        const countries = {};
        for (const c of snapshot.countries) {
            countries[c.code] = { ownerPlayerId: c.ownerPlayerId, soldiers: c.soldiers };
        }
        return { countries };
    }

    function cloneBoard(board) {
        const countries = {};
        for (const code of Object.keys(board.countries)) countries[code] = { ...board.countries[code] };
        return { countries };
    }

    // Returns a new board with one event applied. Unknown or missing codes are ignored.
    function applyEvent(board, ev) {
        const next = cloneBoard(board);
        const at = (code) => (code ? next.countries[code] : undefined);

        switch (ev.type) {
            case 'Reinforce': {
                const to = at(ev.toCode);
                if (to) to.soldiers += ev.count;
                break;
            }
            case 'Transfer': {
                const from = at(ev.fromCode), to = at(ev.toCode);
                if (from && to) { from.soldiers -= ev.count; to.soldiers += ev.count; }
                break;
            }
            case 'DiceRolled': {
                const a = at(ev.attackerCode), d = at(ev.defenderCode);
                if (a) a.soldiers = Math.max(0, a.soldiers - ev.attackerLosses);
                if (d) d.soldiers = Math.max(0, d.soldiers - ev.defenderLosses);
                break;
            }
            case 'CountryConquered': {
                const d = at(ev.toCode);
                if (d) { d.ownerPlayerId = ev.playerId; d.soldiers = ev.count; }
                break;
            }
        }
        return next;
    }

    class Playback {
        // options.onStep(event, board)   called as each event is shown
        // options.onBoard(board)         called when the board is set without an event
        // options.sleep(ms)              returns a promise; replaceable in tests
        constructor(options) {
            this.onStep = options.onStep || (() => {});
            this.onBoard = options.onBoard || (() => {});
            this.sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
            this.board = null;
            this.queue = [];
            this.fast = false;
            this.running = false;
            this.seen = new Set();
        }

        get isPlaying() { return this.running || this.queue.length > 0; }

        setFast(on) { this.fast = !!on; }

        // Show this board immediately (first load, or once playback has caught up).
        reset(snapshot) {
            this.board = boardFromSnapshot(snapshot);
            this.onBoard(this.board);
        }

        // Adds events to the end of the queue (each sequence number only once)
        // and starts playing if it is not already.
        enqueue(events) {
            for (const ev of events) {
                if (this.seen.has(ev.sequence)) continue;
                this.seen.add(ev.sequence);
                this.queue.push(ev);
            }
            return this.play();
        }

        delayFor(ev) {
            const base = NORMAL_DELAY[ev.type] ?? DEFAULT_DELAY;
            return this.fast ? Math.round(base * FAST_FACTOR) : base;
        }

        async play() {
            if (this.running) return;
            this.running = true;
            try {
                while (this.queue.length > 0) {
                    const ev = this.queue.shift();
                    if (this.board) this.board = applyEvent(this.board, ev);
                    this.onStep(ev, this.board);
                    await this.sleep(this.delayFor(ev));
                }
            } finally {
                this.running = false;
            }
        }
    }

    return { Playback, applyEvent, boardFromSnapshot, NORMAL_DELAY, FAST_FACTOR };
});

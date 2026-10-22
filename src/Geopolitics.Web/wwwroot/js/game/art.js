// Artwork drawn in code, so there are no image files to host for it:
//   - pixel-art soldiers (one uniform palette per player, several poses)
//   - watercolour-style dice faces
// Everything draws onto a 2D canvas context that is passed in, so it can also be run and checked in Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GameArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // ---------------------------------------------------------------- soldiers
    // Each row is written as runs: a letter and an optional count, so "K2 U10" is KKUUUUUUUUUU.
    // . = see-through, K = outline, H/h/d = helmet (main / light / dark), A = goggle band,
    // F/f = skin, E = eyes, U/u/V = uniform (main / dark / light), S/s = webbing,
    // G/g = rifle (dark / light), B/b = boots, Y/O = muzzle flash.
    const WIDTH = 20;
    const rle = (spec) => spec.trim().split(/\s+/).map(t => t[0].repeat(t.length > 1 ? parseInt(t.slice(1), 10) : 1)).join('');

    const HEAD = [
        '.6 K8 .6',
        '.5 K H3 h2 H3 K .5',
        '.4 K H2 h3 H4 d K .4',
        '.3 K H11 d K .3',
        '.3 K H2 A8 H d K .3',
        '.3 K d2 K2 F4 K2 d2 K .3',
        '.4 K2 F8 K2 .4',
        '.5 K F E2 F2 E2 F K .5',
        '.5 K F E2 F2 E2 F K .5',
        '.5 K F4 f F3 K .5',
        '.6 K2 F4 K2 .6'
    ];
    const TORSO = [
        '.3 K2 U10 K2 .3',
        '.2 K U2 S U8 S U2 K .2',
        '.1 K U3 S U G2 g U5 S U2 K .1',
        '.1 K U5 F2 G2 g2 G U4 K .1',
        '.1 K U8 F2 G2 g2 G U K .1',
        '.1 K U12 G2 g2 G2',
        '.3 K U2 s S2 U4 S2 s U K G g'
    ];
    // legs: standing, and a stride (mirrored for the next step, so walking alternates)
    const STANDING = [
        '.4 K U9 u K .4',
        '.4 K U3 K .2 K U3 K .4',
        '.4 K U2 u K .2 K u U2 K .4',
        '.3 K B4 K .2 K B4 K .3',
        '.3 K B3 b K .2 K b B3 K .3',
        '.3 K6 .2 K6 .3'
    ];
    const STRIDE = [
        '.4 K U9 u K .4',
        '.2 K U3 K .5 K U3 K .3',
        '.2 K U2 u K .5 K u U2 K .3',
        '.1 K B4 K .5 K B3 K .3',
        '.1 K B3 b K .5 K B3 K .3',
        '.1 K6 .5 K5 .3'
    ];

    const frames = {};
    frames.idle = HEAD.concat(TORSO, STANDING).map(rle);
    frames.runA = HEAD.concat(TORSO, STRIDE).map(rle);
    {
        const body = HEAD.concat(TORSO).map(rle);
        const mirrored = STRIDE.map(rle).map(r => r.split('').reverse().join(''));
        frames.runB = body.concat(mirrored);
    }
    {   // firing: the same body, with a flash at the end of the barrel (right edge, rows 16-18)
        const rows = frames.idle.map(r => r.split(''));
        const put = (x, y, c) => { rows[y][x] = c; };
        put(18, 17, 'Y'); put(19, 17, 'Y'); put(19, 16, 'O'); put(19, 18, 'O'); put(18, 18, 'O');
        frames.fire = rows.map(r => r.join(''));
    }
    const HEIGHT = frames.idle.length;
    const FRAME_NAMES = Object.keys(frames);

    // the parts of a palette that never change from player to player
    const COMMON = {
        K: '#0b0b0e', A: '#3a3a44', F: '#f2a65a', f: '#d9843c', E: '#0b0b0e', S: '#7a4a22', s: '#5a3516',
        G: '#3b4047', g: '#8a919b', B: '#6b3f1d', b: '#9a5f2e', Y: '#ffe94d', O: '#ff9a2e'
    };
    // one uniform per player; the human player is always the first (green camouflage)
    const UNIFORMS = [
        { name: 'Green camouflage', H: '#3f7d20', h: '#9ccc2b', d: '#2c5a14', U: '#3f7d20', u: '#2b5a16', V: '#7aa832' },
        { name: 'Khaki',            H: '#8a8452', h: '#b5ae72', d: '#625d38', U: '#7d7a4a', u: '#5b5834', V: '#a09a62' },
        { name: 'Steel grey',       H: '#6e7178', h: '#9a9ea6', d: '#4a4c52', U: '#5b5e66', u: '#42454b', V: '#7c8089' },
        { name: 'Night black',      H: '#2f3238', h: '#5a5f68', d: '#1c1e22', U: '#2a2d33', u: '#1a1c20', V: '#454951' },
        { name: 'Desert tan',       H: '#c2a15f', h: '#e0c98a', d: '#8f7240', U: '#b8975a', u: '#8c6f3e', V: '#d6bb7e' },
        { name: 'Navy blue',        H: '#2d4a7a', h: '#5a82c0', d: '#1e3354', U: '#2d4a7a', u: '#1f3556', V: '#4a6fa6' },
        { name: 'Maroon',           H: '#7a2d3a', h: '#b04f5e', d: '#521e28', U: '#74303c', u: '#4f212a', V: '#9a4a58' },
        { name: 'Teal',             H: '#2f7a78', h: '#5cb3b0', d: '#1f5352', U: '#2f7a78', u: '#215553', V: '#4a9a97' },
        { name: 'Snow white',       H: '#cfd6dc', h: '#f4f7fa', d: '#9aa3ab', U: '#b9c2c9', u: '#8d979f', V: '#dfe5ea' },
        { name: 'Violet',           H: '#6a3d8a', h: '#9a66c0', d: '#46285e', U: '#65398a', u: '#452a60', V: '#8a5cb0' }
    ];
    const palette = (index) => Object.assign({}, COMMON, UNIFORMS[((index % UNIFORMS.length) + UNIFORMS.length) % UNIFORMS.length]);

    // Draws one pose onto a canvas context at the given pixel size per art pixel.
    function paintSoldier(ctx, frameName, uniformIndex, scale) {
        const rows = frames[frameName] || frames.idle;
        const colours = palette(uniformIndex);
        const s = scale || 1;
        for (let y = 0; y < rows.length; y++) {
            for (let x = 0; x < rows[y].length; x++) {
                const c = rows[y][x];
                if (c === '.') continue;
                ctx.fillStyle = colours[c];
                ctx.fillRect(x * s, y * s, s, s);
            }
        }
    }

    // ---------------------------------------------------------------- dice
    function seeded(seed) {                                  // small repeatable random numbers
        let a = (seed * 2654435761) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const PIPS = {
        1: [[0.5, 0.5]],
        2: [[0.27, 0.27], [0.73, 0.73]],
        3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
        4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
        5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
        6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]]
    };

    // One die face painted like a watercolour: paper, soft grey washes, a shaded edge and
    // hand-inked pips that are never quite round. Exactly one ellipse is drawn per pip.
    function paintDieFace(ctx, size, value, seed) {
        const rnd = seeded((seed || 1) * 97 + value * 13);
        ctx.fillStyle = '#efeee9';
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < 7; i++) {                          // soft washes of grey
            const x = rnd() * size, y = rnd() * size, r = size * (0.25 + rnd() * 0.4);
            const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
            wash.addColorStop(0, 'rgba(120,126,138,0.20)');
            wash.addColorStop(1, 'rgba(120,126,138,0)');
            ctx.fillStyle = wash;
            ctx.fillRect(0, 0, size, size);
        }
        const shade = ctx.createLinearGradient(0, 0, size, size);   // one side in shadow, as in a painted die
        shade.addColorStop(0, 'rgba(70,76,90,0.30)');
        shade.addColorStop(0.55, 'rgba(70,76,90,0.04)');
        shade.addColorStop(1, 'rgba(70,76,90,0.14)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < Math.round(size * 1.6); i++) {      // paper grain
            ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.35)';
            ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
        }

        ctx.strokeStyle = 'rgba(55,60,72,0.45)';                 // uneven painted edge
        ctx.lineWidth = Math.max(2, size * 0.03);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const m = size * 0.03, w = (n) => (rnd() - 0.5) * size * n;
        ctx.moveTo(m + w(0.02), m + w(0.02));
        ctx.lineTo(size - m + w(0.02), m + w(0.02));
        ctx.lineTo(size - m + w(0.02), size - m + w(0.02));
        ctx.lineTo(m + w(0.02), size - m + w(0.02));
        ctx.closePath();
        ctx.stroke();

        for (const [px, py] of PIPS[value]) {                    // ink pips
            const cx = px * size + w(0.03), cy = py * size + w(0.03);
            const rx = size * (0.085 + rnd() * 0.02), ry = size * (0.075 + rnd() * 0.02);
            ctx.fillStyle = 'rgba(10,10,16,0.11)';                // ink bleeding into the paper
            ctx.beginPath();
            ctx.arc(cx, cy, rx * 1.14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0c0c12';
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    return { WIDTH, HEIGHT, FRAME_NAMES, frames, UNIFORMS, palette, paintSoldier, paintDieFace, PIPS, seeded };
});

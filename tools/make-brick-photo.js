// Draws wwwroot/img/brick-wall.jpg: a seamless photo-style tile of a red brick wall
// (small dense bricks, varied burnt-orange colour, dark mortar, scratches and chips).
// The warm lamp and the shadows are added on top in CSS (site.css), so they can move.
//
//   npm install --no-save @napi-rs/canvas@0.1
//   node tools/make-brick-photo.js
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const BRICK_W = 44, BRICK_H = 13, MORTAR_X = 3, MORTAR_Y = 2;
const PITCH_X = BRICK_W + MORTAR_X, PITCH_Y = BRICK_H + MORTAR_Y;
const COLS = 20, ROWS = 28;                           // every row has the same number of whole bricks, so the tile repeats
const W = PITCH_X * COLS, H = PITCH_Y * ROWS;         // 940 x 420

// small repeatable random numbers
function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = seeded(2027);

// smooth blotches that wrap around the edges (so the tile still repeats)
function wrapNoise(cell) {
    const gx = Math.round(W / cell), gy = Math.round(H / cell);
    const grid = Array.from({ length: gy }, () => Array.from({ length: gx }, () => rnd()));
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
        const fx = (x / W) * gx, fy = (y / H) * gy;
        const x0 = Math.floor(fx) % gx, y0 = Math.floor(fy) % gy, x1 = (x0 + 1) % gx, y1 = (y0 + 1) % gy;
        const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
        const top = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx, bottom = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx;
        return top * (1 - ty) + bottom * ty;
    };
}
const blotchLarge = wrapNoise(240), blotchSmall = wrapNoise(40);

const hsl = (h, s, l) => {                            // to [r, g, b]
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
};

// one colour per brick
const bricks = [];
for (let r = 0; r < ROWS; r++) {
    bricks[r] = [];
    for (let c = 0; c < COLS; c++) {
        const dark = rnd() < 0.22, pale = rnd() < 0.05;
        bricks[r][c] = {
            base: hsl(14 + rnd() * 11, 54 + rnd() * 14, (dark ? 19 : pale ? 37 : 27) + rnd() * 6),
            tilt: (rnd() - 0.5) * 0.30                // some bricks are lighter on one side
        };
    }
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const img = ctx.createImageData(W, H);
const px = img.data;

for (let y = 0; y < H; y++) {
    const row = Math.floor(y / PITCH_Y), ry = y % PITCH_Y;
    const shift = (row % 2) * (PITCH_X / 2);
    for (let x = 0; x < W; x++) {
        const wx = (x - shift + W) % W;               // brick position, wrapped
        const col = Math.floor(wx / PITCH_X), rx = wx % PITCH_X;
        let r, g, b;
        const inBrick = rx < BRICK_W && ry < BRICK_H;
        const blot = (blotchLarge(x, y) - 0.5) * 0.34 + (blotchSmall(x, y) - 0.5) * 0.30;
        const grain = (rnd() - 0.5) * 26;
        if (inBrick) {
            const br = bricks[row][col];
            // bevel: lit from above, shaded below, slightly darker at the sides
            const edgeTop = ry < 2 ? 14 - ry * 6 : 0, edgeBottom = ry >= BRICK_H - 2 ? -(ry - (BRICK_H - 3)) * 7 : 0;
            const edgeSide = (rx < 1 || rx >= BRICK_W - 1) ? -10 : 0;
            const side = (rx / BRICK_W - 0.5) * br.tilt * 120;
            const shade = grain + edgeTop + edgeBottom + edgeSide + side + blot * 120;
            [r, g, b] = [br.base[0] + shade, br.base[1] + shade * 0.7, br.base[2] + shade * 0.55];
        } else {                                       // mortar: dark with sandy specks
            const speck = rnd() < 0.08 ? 40 + rnd() * 30 : 0;
            r = 30 + grain * 0.4 + speck * 0.8 + blot * 30; g = 20 + grain * 0.3 + speck * 0.65 + blot * 22; b = 15 + grain * 0.25 + speck * 0.5 + blot * 14;
        }
        const i = (y * W + x) * 4;
        px[i] = Math.max(0, Math.min(255, r)); px[i + 1] = Math.max(0, Math.min(255, g)); px[i + 2] = Math.max(0, Math.min(255, b)); px[i + 3] = 255;
    }
}
ctx.putImageData(img, 0, 0);

// scratches and chips on the bricks
ctx.lineCap = 'round';
for (let n = 0; n < 1300; n++) {
    const row = Math.floor(rnd() * ROWS), col = Math.floor(rnd() * COLS);
    const shift = (row % 2) * (PITCH_X / 2);
    const x = col * PITCH_X + shift + 3 + rnd() * (BRICK_W - 9), y = row * PITCH_Y + 2 + rnd() * (BRICK_H - 4);
    const len = 2 + rnd() * 7, ang = (rnd() - 0.5) * 0.9;
    ctx.strokeStyle = rnd() < 0.65 ? 'rgba(255,205,165,0.16)' : 'rgba(15,6,3,0.30)';
    ctx.lineWidth = 0.7 + rnd() * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
}
for (let n = 0; n < 260; n++) {
    const row = Math.floor(rnd() * ROWS), col = Math.floor(rnd() * COLS);
    const shift = (row % 2) * (PITCH_X / 2);
    ctx.fillStyle = 'rgba(25,10,5,0.35)';
    ctx.beginPath(); ctx.ellipse(col * PITCH_X + shift + rnd() * BRICK_W, row * PITCH_Y + rnd() * BRICK_H, 1 + rnd() * 2.2, 0.8 + rnd() * 1.4, rnd() * 3, 0, 7); ctx.fill();
}

const out = path.join(__dirname, '..', 'src', 'Geopolitics.Web', 'wwwroot', 'img', 'brick-wall.jpg');
fs.writeFileSync(out, canvas.toBuffer('image/jpeg', 84));
console.log(`${W}x${H} brick tile written (${Math.round(fs.statSync(out).size / 1024)} KB)`);

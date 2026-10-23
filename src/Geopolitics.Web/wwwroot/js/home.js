import './game/art.js';
// The home page line-up: ten pixel soldiers in the ten uniforms, each with a country's flag above the head.
// Drawn in code from art.js and the flag sheet, so there are no extra pictures to host.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GameHome = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const COUNTRIES = ['south-africa', 'united-states', 'china', 'brazil', 'germany', 'japan', 'india', 'france', 'united-kingdom', 'russia'];
    const SCALE = 4, SPACING = 76, FLAG_W = 56, FLAG_H = 42;

    // Size of the picture for n soldiers.
    function lineupSize(n) {
        const art = 20 * SCALE;                              // a soldier is 20 pixels wide
        return { width: (n - 1) * SPACING + art, height: 24 * SCALE + FLAG_H + 10 };
    }

    // options: { art, makeCanvas, flags: { image, cell: [w, h], cols, map } | null, countries }
    function drawLineup(ctx, options) {
        const art = options.art, flags = options.flags, codes = options.countries || COUNTRIES;
        const size = lineupSize(codes.length);
        ctx.imageSmoothingEnabled = false;
        codes.forEach((code, i) => {
            const x = i * SPACING, feet = size.height - 4;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';                // shadow
            ctx.beginPath();
            ctx.ellipse(x + 20 * SCALE / 2, feet, 34, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            const tmp = options.makeCanvas(art.WIDTH, art.HEIGHT);   // one soldier, drawn at its own pixel size
            art.paintSoldier(tmp.getContext('2d'), 'idle', i, 1);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, x, feet - 24 * SCALE, 20 * SCALE, 24 * SCALE);

            const cell = flags ? flags.map[code] : undefined;
            if (cell !== undefined) {                          // the flag above the head
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(flags.image, (cell % flags.cols) * flags.cell[0], Math.floor(cell / flags.cols) * flags.cell[1],
                    flags.cell[0], flags.cell[1], x + (20 * SCALE - FLAG_W) / 2, feet - 24 * SCALE - FLAG_H - 2, FLAG_W, FLAG_H);
            }
        });
    }

    async function start() {
        const canvas = document.getElementById('lineup');
        if (!canvas || !window.GameArt) return;
        let flags = null;
        try {
            const info = await (await fetch('/data/flags.json')).json();
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = '/img/flags.png';
            });
            flags = { image, cell: info.cell, cols: info.cols, map: info.map };
        } catch (e) { /* soldiers without flags are still fine */ }
        const size = lineupSize(COUNTRIES.length);
        canvas.width = size.width;
        canvas.height = size.height;
        drawLineup(canvas.getContext('2d'), {
            art: window.GameArt, flags,
            makeCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })
        });
    }

    if (typeof document !== 'undefined') start().catch(() => {});
    return { COUNTRIES, lineupSize, drawLineup };
});

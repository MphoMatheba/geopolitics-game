// Builds the flag sprite sheet used above the soldiers on the 3D globe:
//   wwwroot/img/flags.png    every country's flag in a grid, each with a thin dark outline
//   wwwroot/data/flags.json  { cell, cols, rows, map: { "united-states": 12, ... } }  (index in the grid)
// Flags come from the MIT-licensed flag-icons package.
//
//   npm install --no-save flag-icons@7 @resvg/resvg-js@2 @napi-rs/canvas@0.1
//   node tools/make-flags.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const FLAGS = path.dirname(require.resolve('flag-icons/package.json'));
const SEED = path.join(__dirname, '..', 'src', 'Geopolitics.Data', 'Seed', 'countries.json');
const OUT = path.join(__dirname, '..', 'src', 'Geopolitics.Web', 'wwwroot');

const CELL_W = 48, CELL_H = 36, COLS = 16;

const norm = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// names in the seed data that the flag package spells differently
const ALIAS = {
    'dr congo': 'cd', 'congo': 'cg', 'czech republic czechia': 'cz', 'czechia': 'cz', 'cote d ivoire': 'ci',
    'state of palestine': 'ps', 'north macedonia': 'mk', 'eswatini': 'sz', 'cabo verde': 'cv', 'timor leste': 'tl',
    'saint kitts nevis': 'kn', 'st vincent grenadines': 'vc', 'sao tome principe': 'st', 'holy see': 'va',
    'turkey': 'tr', 'russia': 'ru', 'south korea': 'kr', 'north korea': 'kp', 'laos': 'la', 'brunei': 'bn',
    'micronesia': 'fm', 'bahamas': 'bs', 'gambia': 'gm', 'syria': 'sy', 'vietnam': 'vn', 'tanzania': 'tz',
    'moldova': 'md', 'macao': 'mo', 'curacao': 'cw', 'u s virgin islands': 'vi', 'faeroe islands': 'fo',
    'turks and caicos': 'tc', 'sint maarten': 'sx', 'british virgin islands': 'vg', 'caribbean netherlands': 'bq',
    'saint martin': 'mf', 'saint barthelemy': 'bl', 'wallis futuna': 'wf', 'saint pierre miquelon': 'pm',
    'hong kong': 'hk', 'taiwan': 'tw', 'myanmar': 'mm', 'iran': 'ir', 'bolivia': 'bo', 'venezuela': 've',
    'united states': 'us', 'united kingdom': 'gb'
};

(async () => {
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
    const known = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FLAGS, 'country.json'), 'utf8')).map(c => [norm(c.name), c.code]));

    const map = {};
    const missing = [];
    const canvas = createCanvas(CELL_W * COLS, CELL_H * Math.ceil(seed.length / COLS));
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';

    let index = 0;
    for (const country of seed) {
        const iso = known[norm(country.name)] || ALIAS[norm(country.name)];
        const file = iso && path.join(FLAGS, 'flags', '4x3', iso + '.svg');
        if (!file || !fs.existsSync(file)) { missing.push(country.name); continue; }

        const png = new Resvg(fs.readFileSync(file), { fitTo: { mode: 'width', value: (CELL_W - 2) * 2 } }).render().asPng();
        const img = await loadImage(png);
        const x = (index % COLS) * CELL_W, y = Math.floor(index / COLS) * CELL_H;
        g.fillStyle = '#0d0d10';
        g.fillRect(x + 0, y + 0, CELL_W, CELL_H);                                  // dark outline
        g.drawImage(img, x + 1, y + 1, CELL_W - 2, CELL_H - 2);
        map[country.code] = index++;
    }
    if (missing.length) { console.error('No flag for: ' + missing.join(', ')); process.exit(1); }

    fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'img', 'flags.png'), canvas.toBuffer('image/png'));
    fs.writeFileSync(path.join(OUT, 'data', 'flags.json'), JSON.stringify({ cell: [CELL_W, CELL_H], cols: COLS, rows: Math.ceil(index / COLS), map }));
    console.log(`${index} flags written (${COLS} x ${Math.ceil(index / COLS)} cells of ${CELL_W}x${CELL_H})`);
})();

// Builds wwwroot/data/land-dots.json: a grid of lat/lon points that fall on land,
// used to draw the continents as dots on the 3D globe (no image file needed).
//
//   npm install --no-save world-atlas@2 topojson-client@3 d3-geo@3
//   node tools/make-land-dots.js
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const { geoContains } = require('d3-geo');
const world = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const land = topojson.feature(world, world.objects.land);

const STEP = 1.5;                      // degrees between dots
const dots = [];
for (let lat = -84; lat <= 84; lat += STEP) {
    // fewer dots near the poles so spacing looks even
    const lonStep = STEP / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += lonStep) {
        if (geoContains(land, [lon, lat])) dots.push([Math.round(lat * 10) / 10, Math.round(lon * 10) / 10]);
    }
}
const out = path.join(__dirname, '..', 'src', 'Geopolitics.Web', 'wwwroot', 'data', 'land-dots.json');
fs.writeFileSync(out, JSON.stringify(dots));
console.log(dots.length + ' land dots written to ' + out);

// Checks every import in the game's browser scripts is a path that exists.
// A bare name like 'three' needs an import map, and ASP.NET's script tag helper rewrites
// <script type="importmap"> in a Razor page, so the game page silently never started.
// Run with: node --test tests/web-js/import-paths.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WWWROOT = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web', 'wwwroot');
const gameDir = path.join(WWWROOT, 'js', 'game');
const modules = fs.readdirSync(gameDir).filter(f => f.endsWith('.js')).map(f => path.join(gameDir, f))
    .concat(path.join(WWWROOT, 'lib', 'three', 'addons', 'controls', 'OrbitControls.js'));

function importsOf(file) {
    const src = fs.readFileSync(file, 'utf8');
    const found = [];
    for (const m of src.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) found.push(m[1]);                       // import './x.js'
    for (const m of src.matchAll(/^import\s+[^;'"]*?\sfrom\s+['"]([^'"]+)['"]/gm)) found.push(m[1]);       // import a from './x.js'
    for (const m of src.matchAll(/^\}\s*from\s+['"]([^'"]+)['"]/gm)) found.push(m[1]);                      // end of a multi-line import
    for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1]);                 // import('./x.js')
    return found;
}

test('no import uses a bare name that would need an import map', () => {
    let checked = 0;
    for (const file of modules) {
        for (const spec of importsOf(file)) {
            assert.ok(spec.startsWith('.') || spec.startsWith('/'), `${path.basename(file)} imports "${spec}", which needs an import map`);
            checked++;
        }
    }
    assert.ok(checked >= 8, 'expected to find the imports, found ' + checked);
});

test('every import points at a file that exists', () => {
    for (const file of modules) {
        for (const spec of importsOf(file)) {
            const target = spec.startsWith('/') ? path.join(WWWROOT, spec) : path.resolve(path.dirname(file), spec);
            assert.ok(fs.existsSync(target), `${path.basename(file)} imports "${spec}" -> ${path.relative(WWWROOT, target)}, which does not exist`);
        }
    }
});

test('the globe and OrbitControls load the very same copy of Three.js', () => {
    const resolveSpec = (file, spec) => spec.startsWith('/') ? path.join(WWWROOT, spec) : path.resolve(path.dirname(file), spec);
    const globe = path.join(gameDir, 'globe.js');
    const orbit = path.join(WWWROOT, 'lib', 'three', 'addons', 'controls', 'OrbitControls.js');
    const three = path.join(WWWROOT, 'lib', 'three', 'three.module.min.js');
    assert.ok(importsOf(globe).map(s => resolveSpec(globe, s)).includes(three), 'globe.js does not import Three.js');
    assert.ok(importsOf(orbit).map(s => resolveSpec(orbit, s)).includes(three), 'OrbitControls.js does not import the same Three.js');
});

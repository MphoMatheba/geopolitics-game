// Checks that the brick-wall login artwork is complete and consistent.
// (It cannot judge how it looks; that needs eyes. It catches typos and missing pieces.)
// Run with: node --test tests/web-js/wall-art.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web');
const read = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');
const stripRazorComments = (s) => s.replace(/@\*[\s\S]*?\*@/g, '');

const css = read('wwwroot', 'css', 'wall.css');
const partials = { wall: read('Views', 'Shared', '_Wall.cshtml'), cracks: read('Views', 'Shared', '_WallCracks.cshtml') };

test('every file the wall needs exists', () => {
    for (const f of ['wwwroot/css/wall.css', 'wwwroot/img/brick-red.svg', 'wwwroot/img/brick-purple.svg',
                     'wwwroot/fonts/PermanentMarker-Regular.ttf', 'wwwroot/fonts/LICENSE.txt',
                     'Views/Shared/_Wall.cshtml', 'Views/Shared/_WallCracks.cshtml']) {
        assert.ok(fs.existsSync(path.join(WEB, f)), f + ' is missing');
    }
});

test('the stylesheet points at files that exist', () => {
    for (const m of css.matchAll(/url\("(\/[^"]+)"\)/g)) {
        assert.ok(fs.existsSync(path.join(WEB, 'wwwroot', m[1])), m[1] + ' is referenced by wall.css but missing');
    }
});

test('the stylesheet has balanced braces', () => {
    assert.equal(css.split('{').length, css.split('}').length);
});

test('the partials contain no Razor "@" outside comments (it would be read as code)', () => {
    for (const [name, text] of Object.entries(partials)) {
        assert.ok(!stripRazorComments(text).includes('@'), name + ' contains an @ outside a comment');
    }
});

test('every class used by the artwork has a style rule (or is purely structural)', () => {
    const structural = new Set(['floor', 'rubble']);
    for (const [name, text] of Object.entries(partials)) {
        for (const m of stripRazorComments(text).matchAll(/class="([^"]+)"/g)) {
            for (const cls of m[1].split(/\s+/)) {
                assert.ok(structural.has(cls) || css.includes('.' + cls), `${name}: class "${cls}" has no rule in wall.css`);
            }
        }
    }
});

test('every animated rule is switched off for people who prefer reduced motion', () => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');        // comments would be read as part of a selector
    const start = plain.indexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(start > 0, 'no reduced-motion block');
    const reduced = plain.slice(start);
    const animated = plain.slice(0, start).matchAll(/([^{}]+)\{([^{}]*\banimation:[^{}]*)\}/g);
    let checked = 0;
    for (const m of animated) {
        for (const selector of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
            assert.ok(reduced.includes(selector), `"${selector}" is animated but not listed under reduced motion`);
            checked++;
        }
    }
    assert.ok(checked >= 10, 'expected to find the animated rules, found ' + checked);
});

test('both pages use the wall, its cracks and the stylesheet, with balanced markup', () => {
    for (const view of ['Login', 'Register']) {
        const s = read('Views', 'Account', view + '.cshtml');
        assert.ok(s.includes('<partial name="_Wall" />'), view + ' misses the wall');
        assert.ok(s.includes('<partial name="_WallCracks" />'), view + ' misses the cracks');
        assert.ok(s.includes('css/wall.css'), view + ' misses the stylesheet');
        assert.equal(s.split('<div').length, s.split('</div>').length, view + ' has unbalanced <div> tags');
    }
});

test('the side artwork stays inside the safe zone so narrow windows do not crop it', () => {
    // text anchors and shapes are placed in a 1200-wide picture; the middle 165-1035 survives a narrow window
    const xs = [...stripRazorComments(partials.wall).matchAll(/<text class="(?:fill|paint)" x="(\d+)"/g)].map(m => +m[1]);
    assert.ok(xs.length >= 4);
    for (const x of xs) assert.ok(x >= 165 && x <= 1035, 'text anchored at x=' + x);
});

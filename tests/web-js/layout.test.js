// Checks the brick-wall site, the big game stage and the chat box on the side.
// (It cannot judge how it looks; it catches missing pieces, mismatched ids and typos.)
// Run with: node --test tests/web-js/layout.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', '..', 'src', 'Geopolitics.Web');
const read = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');
const details = read('Views', 'Game', 'Details.cshtml');
const gameCss = read('wwwroot', 'css', 'game.css');
const siteCss = read('wwwroot', 'css', 'site.css');
const layout = read('Views', 'Shared', '_Layout.cshtml');
const pageJs = read('wwwroot', 'js', 'game', 'page.js');

// width and height from a JPEG's header
function jpegSize(buf) {
    let i = 2;
    while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
    }
    throw new Error('not a JPEG');
}

test('the brick tile is a real picture of the right size and small enough to load quickly', () => {
    const file = fs.readFileSync(path.join(WEB, 'wwwroot', 'img', 'brick-wall.jpg'));
    assert.deepEqual(jpegSize(file), { width: 940, height: 420 });
    assert.ok(file.length < 300 * 1024, 'the brick tile is ' + Math.round(file.length / 1024) + ' KB');
});

test('every page gets the brick wall, a moving lamp, and the animation stops for reduced motion', () => {
    assert.ok(/body\s*\{[^}]*brick-wall\.jpg/.test(siteCss), 'the body does not use the brick tile');
    assert.ok(siteCss.includes('body::before') && siteCss.includes('@keyframes wall-lamp'));
    assert.ok(/prefers-reduced-motion: reduce\)\s*\{\s*body::before\s*\{\s*animation:\s*none/.test(siteCss));
    assert.match(siteCss, /\.page-panel\b/);
});

test('the layout puts every page on the dark panel, once, and lets wide pages use the full width', () => {
    assert.equal(layout.split('@RenderBody()').length - 1, 1, '@RenderBody() must appear exactly once');
    assert.ok(layout.includes('class="page-panel" data-bs-theme="dark"'));
    assert.ok(layout.includes('ViewData["Wide"]') && layout.includes('container-fluid'));
});

test('the game page asks for the full width and has the big stage and the chat box', () => {
    assert.ok(details.includes('ViewData["Wide"] = true'));
    assert.ok(details.includes('id="stage"') && details.includes('class="chat"'));
    assert.ok(details.indexOf('id="stage"') < details.indexOf('class="chat"'), 'the stage comes first, the chat box beside it');
});

test('every element the game script uses is in the game page', () => {
    const used = new Set([...pageJs.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
    for (const id of ['at-from', 'rf-country', 'tf-from']) used.add(id);                  // used through a list
    const ids = new Set([...details.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
    for (const id of used) assert.ok(ids.has(id), `page.js uses #${id}, which is not in Details.cshtml`);
});

test('the three tabs each have a radio button, a label, a pane and the style rules that switch them', () => {
    for (const [tab, pane, content] of [['log', 'pane-log', 'id="log"'], ['players', 'pane-players', 'id="players"'], ['countries', 'pane-countries', 'id="countries"']]) {
        assert.ok(details.includes(`id="tab-${tab}"`), `radio tab-${tab}`);
        assert.ok(details.includes(`for="tab-${tab}"`), `label for tab-${tab}`);
        assert.ok(details.includes(`class="pane ${pane}"`) , `pane ${pane}`);
        const paneHtml = details.slice(details.indexOf(`class="pane ${pane}"`));
        assert.ok(paneHtml.indexOf(content) > 0 && paneHtml.indexOf(content) < 900, `${pane} holds ${content}`);
        assert.ok(gameCss.includes(`#tab-${tab}:checked ~ .chat-panes .${pane}`), `no rule shows ${pane}`);
        assert.ok(gameCss.includes(`#tab-${tab}:checked ~ .chat-tabs label[for="tab-${tab}"]`), `no rule highlights tab ${tab}`);
    }
    assert.equal((details.match(/class="tab-input" type="radio" name="chat-tab"/g) || []).length, 3, 'the radios share one group');
    // the radios must come before the tab labels and panes for the sibling selectors to work
    assert.ok(details.indexOf('id="tab-countries"') < details.indexOf('class="chat-tabs"'));
    assert.ok(details.indexOf('class="chat-tabs"') < details.indexOf('class="chat-panes"'));
});

test('the stage and the chat box stay level with each other and shrink on small screens', () => {
    assert.ok(/#stage\s*\{[^}]*height:\s*var\(--stage-h\)/.test(gameCss));
    assert.ok(/\.chat\s*\{[^}]*height:\s*var\(--stage-h\)/.test(gameCss));
    assert.ok(/@media \(max-width: 991px\)[\s\S]*\.game-layout\s*\{\s*flex-direction:\s*column/.test(gameCss));
    assert.equal(gameCss.split('{').length, gameCss.split('}').length, 'unbalanced braces in game.css');
});

test('the event log reads like a chat: newest at the bottom, scrolling only when the player is at the bottom', () => {
    assert.ok(!/log\.prepend\(/.test(pageJs), 'the log must not prepend');
    assert.ok(pageJs.includes('log.append(li)'));
    assert.ok(pageJs.includes('atBottom'), 'no check for whether the player scrolled up');
    assert.ok(pageJs.includes("querySelectorAll('.tab-input')"), 'switching tabs should scroll the log to the end');
});

test('the changed Razor pages keep their script sections and badge code well-formed', () => {
    for (const [name, text] of [['Details', details], ['Home', read('Views', 'Home', 'Index.cshtml')]]) {
        assert.equal((text.match(/@section Scripts \{/g) || []).length, 1, name + ' has one Scripts section');
        assert.ok(/\}\s*$/.test(text), name + ' must end by closing the section');
    }
    const my = read('Views', 'Game', 'My.cshtml');
    assert.ok(my.indexOf('var badge') > 0 && my.indexOf('var badge') < my.search(/<tr data-status/), 'the badge colour is worked out before the row');
    for (const text of [details, layout]) {
        const scripts = [...text.matchAll(/<(script|style)[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2]).join('\n');
        assert.ok(!scripts.includes('@'), 'a script or style block contains @, which Razor would read as code');
    }
});

// Checks the project can be run from any IDE with no set-up, and that the hand-in helper does what it promises.
// Run with: node --test tests/web-js/run-anywhere.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const { parseSecrets, buildSettings } = require(path.join(ROOT, 'tools', 'make-submission.js'));

test('there is one classic .sln that lists every project, and no second solution file to confuse dotnet', () => {
    const solutions = fs.readdirSync(ROOT).filter(f => /\.slnx?$/.test(f));
    assert.deepEqual(solutions, ['Geopolitics.sln']);
    const sln = read('Geopolitics.sln');
    // every folder under src and tests that holds a project (tests/web-js only holds Node tests)
    const projects = ['src', 'tests'].flatMap(top => fs.readdirSync(path.join(ROOT, top))
        .filter(d => fs.existsSync(path.join(ROOT, top, d, d + '.csproj'))).map(d => `${top}\\${d}\\${d}.csproj`));
    assert.equal(projects.length, 6, 'expected six projects, found ' + projects.length);
    for (const p of projects) assert.ok(sln.includes(p), p + ' is missing from the solution');
});

test('the app opens the browser itself, so the IDE must not (that would open two tabs)', () => {
    const program = read('src', 'Geopolitics.Web', 'Program.cs');
    assert.ok(program.includes('BrowserLauncher.ChooseUrl') && program.includes('Startup:OpenBrowser'));
    const launch = read('src', 'Geopolitics.Web', 'Properties', 'launchSettings.json');
    assert.ok(!/"launchBrowser":\s*true/.test(launch), 'launchSettings.json still opens the browser');
});

test('a copy with the submission settings file runs with no set-up, and the file never reaches GitHub', () => {
    const program = read('src', 'Geopolitics.Web', 'Program.cs');
    assert.ok(program.includes('AddJsonFile("appsettings.Submission.json", optional: true'));
    assert.ok(/^appsettings\.Submission\.json\s*$/m.test(read('.gitignore')), 'the settings file is not git-ignored');
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'Geopolitics.Web', 'appsettings.Submission.example.json')));
    assert.ok(program.includes('No database settings found'), 'a missing database setting should give a clear message');
});

test('the Anthropic key stays out of the hand-in file unless it is asked for', () => {
    const secrets = parseSecrets('Anthropic:ApiKey = sk-1\nMongo:ConnectionString = mongodb://x\nMongo:DatabaseName = geo\nOther:Thing = no\nAdmin:Password = hunter2\n');
    assert.deepEqual(buildSettings(secrets), { Mongo: { ConnectionString: 'mongodb://x', DatabaseName: 'geo' } });
    assert.deepEqual(buildSettings(secrets, { withAiKey: true }).Anthropic, { ApiKey: 'sk-1' });
});

test('only the database and AI settings can ever be copied into the hand-in file', () => {
    const settings = buildSettings(parseSecrets('Mongo:ConnectionString = a\nAdmin:Password = b\nMongo:Deep:Key = c\nAnthropic:Model = m\n'));
    assert.deepEqual(Object.keys(settings).sort(), ['Anthropic', 'Mongo']);
    assert.ok(!JSON.stringify(settings).includes('Admin') && !JSON.stringify(settings).includes('Deep'));
});

test('secrets with = signs inside the value are kept whole', () => {
    assert.equal(parseSecrets('Mongo:ConnectionString = mongodb+srv://u:p@c/?a=b&w=majority')['Mongo:ConnectionString'], 'mongodb+srv://u:p@c/?a=b&w=majority');
});

test('the README tells a lecturer how to run it, set it up, test it and find the problem page', () => {
    const readme = read('README.md');
    for (const text of ['Geopolitics.sln', 'dotnet run --project src/Geopolitics.Web', 'opens by itself', 'Mongo__ConnectionString',
                        'appsettings.Submission.json', 'dotnet test', 'node --test', '/diagnose.html', 'Dockerfile', 'make-submission',
                        'ammarcanani@gmail.com', 'mc.tanner@uct.ac.za', 'ridewaan.hanslo@uct.ac.za']) {
        assert.ok(readme.includes(text), 'README does not mention "' + text + '"');
    }
});

test('the README is complete: it explains the game, the design and the marking, and its pictures exist', () => {
    const readme = read('README.md');
    for (const heading of ['The 60-second summary', 'Run it in 3 steps', 'How to play', 'How it works inside', 'Database design', 'Security',
                           'The computer players and the AI', 'Does it meet the exam brief', 'Marking guide', 'Bonus feature', 'Tests', 'Deployment', 'Troubleshooting']) {
        assert.ok(readme.includes(heading), 'README has no section "' + heading + '"');
    }
    for (const collection of ['`users`', '`games`', '`events`']) assert.ok(readme.includes(collection), 'README does not describe ' + collection);
    for (const m of readme.matchAll(/src="(docs\/images\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), m[1] + ' is used by the README but missing');
    for (const m of readme.matchAll(/\]\((#[\w-]+)\)/g)) {                       // links to sections must point at a real heading
        const anchor = m[1].slice(1);
        const found = [...readme.matchAll(/^#{1,3} (.+)$/gm)].some(h => h[1].toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') === anchor);
        assert.ok(found, 'the README links to ' + m[1] + ' but there is no such heading');
    }
});

test('the ignore file keeps operating-system files out of git', () => {
    const ignore = read('.gitignore');
    assert.ok(/^\.DS_Store\s*$/m.test(ignore) && /^Thumbs\.db\s*$/m.test(ignore));
});

test('a container build is possible: the Dockerfile builds the web project and sets the proxy and port settings', () => {
    const docker = read('Dockerfile');
    for (const text of ['dotnet publish src/Geopolitics.Web/Geopolitics.Web.csproj', 'ASPNETCORE_FORWARDEDHEADERS_ENABLED=true', 'ASPNETCORE_URLS=http://+:8080', 'Geopolitics.Web.dll']) {
        assert.ok(docker.includes(text), 'Dockerfile lacks ' + text);
    }
    assert.ok(read('.dockerignore').includes('appsettings.Submission.json'), 'the settings file must not go into the container image');
});

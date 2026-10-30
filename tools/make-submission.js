#!/usr/bin/env node
// Builds the zip to hand in. The zip holds every file that is committed to git (so no bin, obj or .git folders)
// plus appsettings.Submission.json, which carries the database settings from YOUR user-secrets, so the lecturers
// can run the project with no set-up. That file is never committed to GitHub.
//
//   node tools/make-submission.js                 database settings only (the AI commentary then uses its built-in text)
//   node tools/make-submission.js --with-ai-key   also include the Anthropic key (use a key with a spend limit!)
//
// Result: submission/Geopolitics-INF4001.zip
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// "Mongo:ConnectionString = value" lines, as printed by `dotnet user-secrets list`
function parseSecrets(text) {
    const secrets = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^(\S+)\s=\s(.*)$/);
        if (m) secrets[m[1]] = m[2];
    }
    return secrets;
}

// Only the Mongo and Anthropic settings go into the file, and the Anthropic key only when asked for.
function buildSettings(secrets, options = {}) {
    const settings = {};
    for (const [key, value] of Object.entries(secrets)) {
        const parts = key.split(':');
        if (parts.length !== 2 || !['Mongo', 'Anthropic'].includes(parts[0])) continue;
        if (parts[0] === 'Anthropic' && parts[1] === 'ApiKey' && !options.withAiKey) continue;
        (settings[parts[0]] ??= {})[parts[1]] = value;
    }
    return settings;
}

function run(root, withAiKey) {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

    if (git('status', '--porcelain').trim()) {
        console.log('Note: you have changes that are not committed. Only committed (or staged) files go in the zip.');
    }

    let secretsText = '';
    try {
        secretsText = execFileSync('dotnet', ['user-secrets', 'list', '--project', 'src/Geopolitics.Web'], { cwd: root, encoding: 'utf8' });
    } catch (e) {
        console.error('Could not read your user-secrets. Is the .NET SDK installed? ' + e.message);
        process.exit(1);
    }
    const settings = buildSettings(parseSecrets(secretsText), { withAiKey });
    if (!settings.Mongo || !settings.Mongo.ConnectionString) {
        console.error('No Mongo connection string in your user-secrets, so the copy could not run anywhere else.');
        console.error('Set it first:  dotnet user-secrets set "Mongo:ConnectionString" "..." --project src/Geopolitics.Web');
        process.exit(1);
    }

    const out = path.join(root, 'submission');
    const stage = path.join(out, 'stage', 'Geopolitics');
    fs.rmSync(path.join(out, 'stage'), { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });

    const files = git('ls-files', '-z').split('\0').filter(Boolean);
    for (const file of files) {
        const from = path.join(root, file), to = path.join(stage, file);
        if (!fs.existsSync(from) || fs.lstatSync(from).isSymbolicLink()) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
    }
    fs.writeFileSync(path.join(stage, 'src', 'Geopolitics.Web', 'appsettings.Submission.json'), JSON.stringify(settings, null, 2) + '\n');

    const zip = path.join(out, 'Geopolitics-INF4001.zip');
    fs.rmSync(zip, { force: true });
    if (process.platform === 'win32') execFileSync('tar', ['-a', '-c', '-f', zip, '-C', path.join(out, 'stage'), 'Geopolitics']);
    else execFileSync('zip', ['-qr', zip, 'Geopolitics'], { cwd: path.join(out, 'stage') });
    fs.rmSync(path.join(out, 'stage'), { recursive: true, force: true });

    console.log(`Wrote ${path.relative(root, zip)} (${Math.round(fs.statSync(zip).size / 1024)} KB, ${files.length + 1} files).`);
    console.log('It contains your database settings' + (withAiKey ? ' AND your Anthropic key' : ' (not the Anthropic key)') + ': hand it in only through the Amathuba assignment folder.');
}

module.exports = { parseSecrets, buildSettings };
if (require.main === module) run(path.join(__dirname, '..'), process.argv.includes('--with-ai-key'));

import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

const release = json('VERSION.json');
const version = release.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION.json must contain semantic version x.y.z');

const requiredFiles = [
  'index.html','debug.html','styles.css','manifest.webmanifest',
  'src/config.js','src/catalog.js','src/eventlog.js','src/debug.js','src/parser-client.js','src/app.js',
  'scripts/smoke.mjs','.nojekyll'
];
for (const file of requiredFiles) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const html = read('index.html');
for (const asset of ['styles.css','src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/app.js']) {
  if (!html.includes(asset)) throw new Error(`index.html does not load ${asset}`);
}
if (!html.includes('debug.html')) throw new Error('Diagnostics link missing from index.html');
for (const id of ['dealsView','dealCartridge','runDealSearch','automaticDeals','directSources']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing deal UI element ${id}`);
}
for (const id of ['queueView','queueStart','queuePause','queueResume','queueReset','queueProgressText','queueProgressBar','queuePreview']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing phase 5.1 queue UI element ${id}`);
}

const debugHtml = read('debug.html');
for (const asset of ['styles.css','src/config.js','src/eventlog.js','src/debug.js']) {
  if (!debugHtml.includes(asset)) throw new Error(`debug.html does not load ${asset}`);
}
for (const id of ['runChecks','healthChecks','downloadLog','clearLog','eventLog']) {
  if (!debugHtml.includes(`id="${id}"`)) throw new Error(`Missing diagnostics element ${id}`);
}

const catalogSource = read('src/catalog.js');
const catalogEntryPattern = /\[\s*["'](?:console|arcade|computer)["']\s*,\s*\d+\s*,\s*["']/g;
const count = (catalogSource.match(catalogEntryPattern) || []).length;
if (count !== 87) throw new Error(`Expected 87 catalog entries, found ${count}`);

const configSource = read('src/config.js');
const parserSource = read('src/parser-client.js');
const eventSource = read('src/eventlog.js');
const debugSource = read('src/debug.js');
const appSource = read('src/app.js');
const smokeSource = read('scripts/smoke.mjs');
if (!configSource.includes('generic-parser-module-v1')) throw new Error('GenericParser contract missing');
if (!configSource.includes('genericParserSearchPaths')) throw new Error('GenericParser endpoint paths missing');
if (!parserSource.includes("source:'kleinanzeigen'") && !parserSource.includes("source: 'kleinanzeigen'")) throw new Error('Kleinanzeigen adapter request missing');
if (!parserSource.includes('window.EvercadeSearch')) throw new Error('Search client export missing');
if (!parserSource.includes('parser.request') || !parserSource.includes('parser.failure')) throw new Error('Parser event logging missing');
if (!eventSource.includes('window.EVERCADE_LOG')) throw new Error('Event log export missing');
if (!eventSource.includes('unhandledrejection')) throw new Error('Unhandled rejection logging missing');
if (!debugSource.includes('diagnostics.complete')) throw new Error('Diagnostics completion logging missing');
if (!smokeSource.includes('EXPECTED_VERSION') || !smokeSource.includes('debug.html')) throw new Error('Public smoke test incomplete');
for (const marker of ['queueOrder','createQueue','queueLoop','pauseQueue','resumeQueue','restoreQueue','queue.item.start','queue.complete']) {
  if (!appSource.includes(marker)) throw new Error(`Phase 5.1 queue marker missing: ${marker}`);
}
if (!appSource.includes('state.wishlist') || !appSource.includes('state.owned')) throw new Error('Queue priority or missing-cartridge filter is not connected to collection state');

const runtimeSource = appSource + configSource + parserSource + eventSource + debugSource + html + debugHtml;
if (/0\.9\.|0\.8\.|0\.7\./.test(runtimeSource)) throw new Error('Legacy version literal found in runtime source');
if (release.versionSource !== 'VERSION.json') throw new Error('VERSION.json is not declared as canonical version source');
if (String(release.phase) !== '5.1') throw new Error('Release phase must be 5.1');

console.log(`Evercade Next ${version}: phase ${release.phase} validation passed with ${count} catalog entries, diagnostics and persistent full-search queue.`);

import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

const release = json('VERSION.json');
const version = release.version;
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('VERSION.json must contain release version x.y.z or x.y.z.n');

const requiredFiles = [
  'index.html','debug.html','styles.css','manifest.webmanifest',
  'src/config.js','src/catalog.js','src/eventlog.js','src/debug.js','src/endpoint-test.js','src/parser-client.js','src/app.js',
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
for (const asset of ['styles.css','src/config.js','src/eventlog.js','src/debug.js','src/endpoint-test.js']) {
  if (!debugHtml.includes(asset)) throw new Error(`debug.html does not load ${asset}`);
}
for (const id of ['runChecks','healthChecks','downloadLog','clearLog','eventLog','runAllEndpointTests','endpointTestButtons','endpointTestResults']) {
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
const endpointSource = read('src/endpoint-test.js');
const appSource = read('src/app.js');
const smokeSource = read('scripts/smoke.mjs');
if (!configSource.includes('generic-parser-module-v1')) throw new Error('GenericParser contract missing');
if (!configSource.includes("genericParserExpectedVersion: '0.45.1'")) throw new Error('GenericParser 0.45.1 expectation missing');
if (!configSource.includes('genericParserSearchPaths')) throw new Error('GenericParser endpoint paths missing');
if (!configSource.includes('genericParserDiagnosticPaths')) throw new Error('GenericParser diagnostic paths missing');
if (!configSource.includes('genericParserEndpointTests')) throw new Error('GenericParser endpoint test matrix missing');
for (const marker of ['GET /health','GET /version','GET /diagnostics','OPTIONS /api/module/search','POST /search','POST /api/search','POST /api/module/search']) {
  if (!configSource.includes(marker)) throw new Error(`Endpoint test definition missing: ${marker}`);
}
if (!parserSource.includes("source:'auto'") && !parserSource.includes("source: 'auto'")) throw new Error('GenericParser live source request missing');
if (!parserSource.includes('window.EvercadeSearch')) throw new Error('Search client export missing');
for (const marker of ['x-request-id','requestId','timestamp','origin','userAgent','durationMs','status','hitCount','parser.request','parser.response','parser.failure']) {
  if (!parserSource.includes(marker)) throw new Error(`1.4.5.1 parser observability marker missing: ${marker}`);
}
if (!eventSource.includes('window.EVERCADE_LOG')) throw new Error('Event log export missing');
if (!eventSource.includes('unhandledrejection')) throw new Error('Unhandled rejection logging missing');
if (!debugSource.includes('diagnostics.complete')) throw new Error('Diagnostics completion logging missing');
for (const marker of ['Worker Health','Worker Version','Worker Diagnostics']) {
  if (!debugSource.includes(marker)) throw new Error(`GenericParser 0.45.1 health diagnostic missing: ${marker}`);
}
if (!debugSource.includes('config.genericParserExpectedVersion')) throw new Error('Worker version must be checked against expected GenericParser version');
for (const marker of ['endpoint.test.start','endpoint.test.complete','endpoint.test.failure','endpoint.test.matrix.complete','access-control-allow-origin']) {
  if (!endpointSource.includes(marker)) throw new Error(`Endpoint diagnostic marker missing: ${marker}`);
}
if (!smokeSource.includes('EXPECTED_VERSION') || !smokeSource.includes('debug.html')) throw new Error('Public smoke test incomplete');
for (const marker of ['queueOrder','createQueue','queueLoop','pauseQueue','resumeQueue','restoreQueue','queue.item.start','queue.complete']) {
  if (!appSource.includes(marker)) throw new Error(`Phase 5.1 queue marker missing: ${marker}`);
}
if (!appSource.includes('state.wishlist') || !appSource.includes('state.owned')) throw new Error('Queue priority or missing-cartridge filter is not connected to collection state');

const runtimeSource = appSource + configSource + parserSource + eventSource + debugSource + endpointSource + html + debugHtml;
if (/0\.9\.|0\.8\.|0\.7\./.test(runtimeSource)) throw new Error('Legacy version literal found in runtime source');
if (release.versionSource !== 'VERSION.json') throw new Error('VERSION.json is not declared as canonical version source');
if (String(release.phase) !== '5.2') throw new Error('Release phase must remain 5.2');
if (release.integration !== 'GenericParser 0.45.1') throw new Error('Release must declare GenericParser 0.45.1 integration');
if (release.genericParser?.contract !== 'generic-parser-module-v1') throw new Error('Release metadata must preserve generic-parser-module-v1');
if (release.genericParser?.expectedVersion !== '0.45.1') throw new Error('Release metadata must target GenericParser 0.45.1');

console.log(`Evercade Next ${version}: validation passed with ${count} catalog entries and GenericParser 0.45.1 integration contract.`);

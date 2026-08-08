import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

const release = json('VERSION.json');
const version = release.version;
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('VERSION.json must contain release version x.y.z or x.y.z.n');

const requiredFiles = [
  'index.html','debug.html','styles.css','manifest.webmanifest',
  'src/release-loader.js','src/config.js','src/catalog.js','src/eventlog.js','src/debug.js','src/endpoint-test.js','src/parser-client.js','src/app.js',
  'scripts/smoke.mjs','.nojekyll'
];
for (const file of requiredFiles) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const html = read('index.html');
if (!html.includes('src/release-loader.js')) throw new Error('index.html must load canonical release loader');
if (!html.includes('data-evercade-page="app"')) throw new Error('index.html must declare app page type');
if (!html.includes('debug.html')) throw new Error('Diagnostics link missing from index.html');
for (const id of ['dealsView','dealCartridge','runDealSearch','automaticDeals','directSources']) if (!html.includes(`id="${id}"`)) throw new Error(`Missing deal UI element ${id}`);
for (const id of ['dealActiveCount','dealNewCount','dealCartridgeCount','dealBestPrice','dealFilterStatus','dealFilterSource','dealMaxPrice','dealSort','dealCenterMeta','markDealsSeen']) if (!html.includes(`id="${id}"`)) throw new Error(`Missing Phase 5.3 Trefferzentrale element ${id}`);
for (const id of ['queueView','queueStart','queuePause','queueResume','queueReset','queueProgressText','queueProgressBar','queuePreview']) if (!html.includes(`id="${id}"`)) throw new Error(`Missing phase 5.1 queue UI element ${id}`);
for (const marker of ['data-view="collection"','data-view="catalog"','data-view="deals"','data-view="queue"']) if (!html.includes(marker)) throw new Error(`Primary navigation missing ${marker}`);
if (html.includes('data-view="missing"') || html.includes('data-view="wishlist"')) throw new Error('Fehlend/Wünsche must remain retired from primary navigation');
for (const marker of ['.topbar,.tabs{position:static!important','html,body{max-width:100%;overflow-x:hidden}','grid-template-columns:repeat(4,minmax(0,1fr))','overflow-wrap:anywhere']) if (!html.includes(marker)) throw new Error(`Horizontal-overflow protection marker missing: ${marker}`);

const debugHtml = read('debug.html');
if (!debugHtml.includes('src/release-loader.js')) throw new Error('debug.html must load canonical release loader');
if (!debugHtml.includes('data-evercade-page="debug"')) throw new Error('debug.html must declare debug page type');
for (const id of ['runChecks','healthChecks','downloadLog','clearLog','eventLog','runAllEndpointTests','endpointTestButtons','endpointTestResults','runTransportProbes','transportContext','transportProbeResults']) if (!debugHtml.includes(`id="${id}"`)) throw new Error(`Missing diagnostics element ${id}`);

const loaderSource = read('src/release-loader.js');
for (const asset of ['src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/app.js','src/debug.js','src/endpoint-test.js']) if (!loaderSource.includes(asset)) throw new Error(`Release loader missing ${asset}`);
for (const marker of ["fetch(`VERSION.json?t=${Date.now()}`", "cache: 'no-store'", "?v=${token}", 'window.EVERCADE_RELEASE']) if (!loaderSource.includes(marker)) throw new Error(`Release loader cache-busting marker missing: ${marker}`);

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

if (version !== '1.4.7.1') throw new Error(`Expected Evercade Next 1.4.7.1, found ${version}`);
if (release.channel !== 'stable') throw new Error('1.4.7.1 must be stable');
if (String(release.phase) !== '5.3') throw new Error('1.4.7.1 must remain phase 5.3');
if (!String(release.integration).includes('GenericParser 0.45.2 Build 6')) throw new Error('Release must preserve GenericParser 0.45.2 Build 6 integration');
if (!String(release.integration).includes('nine-retailer')) throw new Error('Release must declare restored nine-retailer integration');
if (release.genericParser?.contract !== 'generic-parser-module-v1') throw new Error('Release metadata must preserve generic-parser-module-v1');
if (release.genericParser?.expectedVersion !== '0.45.2') throw new Error('Release metadata must target GenericParser 0.45.2');
if (release.genericParser?.expectedBuild !== 'gp-0452-20260807-6') throw new Error('Release metadata must target GenericParser Build 6');

if (!configSource.includes('generic-parser-module-v1')) throw new Error('GenericParser contract missing');
if (!configSource.includes("genericParserExpectedVersion: '0.45.2'")) throw new Error('GenericParser 0.45.2 expectation missing');
if (!configSource.includes("genericParserExpectedBuild: 'gp-0452-20260807-6'")) throw new Error('GenericParser Build 6 reference missing');
for (const marker of ['GET /health','GET /version','GET /diagnostics','OPTIONS /api/module/search','POST /search','POST /api/search','POST /api/module/search']) if (!configSource.includes(marker)) throw new Error(`Endpoint test definition missing: ${marker}`);

// Preserve every direct source that existed in the known-good 1.4.7.0 release.
for (const source of ['eBay Deutschland','Kleinanzeigen','Amazon Deutschland','Google Shopping','Idealo','Kaufland','Retroplace','DragonBox','ASC-Shop','Funstock']) {
  if (!configSource.includes(`name: '${source}'`)) throw new Error(`1.4.7.0 source regression: ${source} missing`);
}

// The nine historical retailer crawlers must be additive and consistently named.
for (const source of ['DragonBox','ASC-Shop','Just For Games Deutschland','Coolshop Deutschland','Enzinger','GameCenterVS','Vitrex-Shop','Funstock','Trumox']) {
  if (!configSource.includes(`'${source}'`)) throw new Error(`Restored automatic retailer source missing: ${source}`);
}
if (configSource.includes('TruMox')) throw new Error('Source spelling regression: use Trumox consistently');
if (!configSource.includes('automatedRetailerSources')) throw new Error('Explicit nine-retailer registry missing');
if (!configSource.includes("dealApiUrl: 'https://project-evercade-deal-api.jnldc.chatgpt.site'")) throw new Error('Legacy deal API URL missing');

if (!parserSource.includes("source:'auto'") && !parserSource.includes("source: 'auto'")) throw new Error('GenericParser live source request missing');
if (!parserSource.includes('window.EvercadeSearch')) throw new Error('Search client export missing');
for (const marker of ['x-request-id','requestId','timestamp','origin','userAgent','durationMs','status','hitCount','parser.request','parser.response','parser.failure']) if (!parserSource.includes(marker)) throw new Error(`Parser observability marker missing: ${marker}`);
for (const marker of ['RETRY_5XX_DELAY_MS = 5000','RETRY_5XX_MAX = 1','parser.retry.scheduled','parser.retry.start','parser.retry.recovered']) if (!parserSource.includes(marker)) throw new Error(`5xx retry marker missing: ${marker}`);
for (const marker of ['normalizeSearchTitle','parser.query.normalized','slash_removed']) if (!parserSource.includes(marker)) throw new Error(`Query-normalization marker missing: ${marker}`);

// 1.4.7.1 additions: legacy retailer service, additive merge and zero-price protection.
if (!parserSource.includes('searchLegacyRetailers')) throw new Error('Legacy retailer search client missing');
if (!parserSource.includes('automaticSources:9')) throw new Error('Nine-retailer request telemetry missing');
if (!parserSource.includes('/api/search?${params}')) throw new Error('Legacy retailer /api/search integration missing');
for (const marker of ['firstMoney','allowZero:false','offer.rejected.invalid_price','priceText','displayPrice']) if (!parserSource.includes(marker)) throw new Error(`Price normalization marker missing: ${marker}`);
for (const marker of ['Promise.allSettled','dedupeOffers','Kleinanzeigen','9 Händler']) if (!parserSource.includes(marker)) throw new Error(`Multi-source merge marker missing: ${marker}`);

for (const marker of ['offerIndex','dealCenterSeenAt','canonicalOfferKey','updateOfferIndex','migrateLegacyOffers','renderDealCenter','deals.index.updated','priceHistory','inactiveAt','firstSeen','lastSeen','dealFilterStatus','dealFilterSource','dealMaxPrice','dealSort']) if (!appSource.includes(marker)) throw new Error(`Phase 5.3 Trefferzentrale marker missing: ${marker}`);
for (const marker of ['QUEUE_DELAY_MS = 50','BATCH_DELAY_MS = 0','RECOVERY_FAILURE_THRESHOLD = 3','RECOVERY_DELAY_MS = 60000','paid_worker_pacing']) if (!appSource.includes(marker)) throw new Error(`Paid-worker pacing/recovery marker missing: ${marker}`);
if (appSource.includes('worker_free_tier_protection')) throw new Error('Must not retain scheduled free-tier batch protection');

if (!eventSource.includes('window.EVERCADE_LOG')) throw new Error('Event log export missing');
if (!eventSource.includes('unhandledrejection')) throw new Error('Unhandled rejection logging missing');
if (!debugSource.includes('diagnostics.complete')) throw new Error('Diagnostics completion logging missing');
for (const marker of ['endpoint.test.start','endpoint.test.complete','endpoint.test.failure']) if (!endpointSource.includes(marker)) throw new Error(`Endpoint diagnostic marker missing: ${marker}`);
if (!smokeSource.includes('EXPECTED_VERSION') || !smokeSource.includes('debug.html')) throw new Error('Public smoke test incomplete');

const runtimeSource = appSource + configSource + parserSource + eventSource + debugSource + endpointSource + loaderSource + html + debugHtml;
if (/0\.9\.|0\.8\.|0\.7\./.test(runtimeSource)) throw new Error('Legacy version literal found in runtime source');
if (release.versionSource !== 'VERSION.json') throw new Error('VERSION.json is not declared as canonical version source');

console.log(`Evercade Next ${version}: validation passed with ${count} catalog entries, full 1.4.7.0 regression coverage, additive nine-retailer search, zero-price protection and Phase 5.3 Trefferzentrale.`);

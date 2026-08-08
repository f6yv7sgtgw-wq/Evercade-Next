import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

const release = json('VERSION.json');
const version = release.version;
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('VERSION.json must contain release version x.y.z or x.y.z.n');

const requiredFiles = ['index.html','debug.html','styles.css','manifest.webmanifest','src/release-loader.js','src/config.js','src/catalog.js','src/eventlog.js','src/debug.js','src/endpoint-test.js','src/parser-client.js','src/app.js','scripts/smoke.mjs','.nojekyll'];
for (const file of requiredFiles) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const html = read('index.html');
if (!html.includes('src/release-loader.js')) throw new Error('index.html must load canonical release loader');
if (!html.includes('data-evercade-page="app"')) throw new Error('index.html must declare app page type');
for (const id of ['dealsView','dealCartridge','runDealSearch','automaticDeals','directSources','dealActiveCount','dealNewCount','dealCartridgeCount','dealBestPrice','dealFilterStatus','dealFilterSource','dealMaxPrice','dealSort','dealCenterMeta','markDealsSeen']) if (!html.includes(`id="${id}"`)) throw new Error(`Missing Trefferzentrale element ${id}`);
for (const id of ['queueView','queueStart','queuePause','queueResume','queueReset','queueProgressText','queueProgressBar','queuePreview']) if (!html.includes(`id="${id}"`)) throw new Error(`Missing queue UI element ${id}`);
for (const marker of ['data-view="collection"','data-view="catalog"','data-view="deals"','data-view="queue"']) if (!html.includes(marker)) throw new Error(`Primary navigation missing ${marker}`);
if (html.includes('data-view="missing"') || html.includes('data-view="wishlist"')) throw new Error('Fehlend/Wünsche must remain retired from primary navigation');
for (const marker of ['.topbar,.tabs{position:static!important','html,body{max-width:100%;overflow-x:hidden}','grid-template-columns:repeat(4,minmax(0,1fr))','overflow-wrap:anywhere']) if (!html.includes(marker)) throw new Error(`Horizontal-overflow protection marker missing: ${marker}`);

const debugHtml = read('debug.html');
const loaderSource = read('src/release-loader.js');
const catalogSource = read('src/catalog.js');
const configSource = read('src/config.js');
const parserSource = read('src/parser-client.js');
const eventSource = read('src/eventlog.js');
const debugSource = read('src/debug.js');
const endpointSource = read('src/endpoint-test.js');
const appSource = read('src/app.js');
const smokeSource = read('scripts/smoke.mjs');

const catalogEntryPattern = /\[\s*["'](?:console|arcade|computer)["']\s*,\s*\d+\s*,\s*["']/g;
const count = (catalogSource.match(catalogEntryPattern) || []).length;
if (count !== 87) throw new Error(`Expected 87 catalog entries, found ${count}`);

if (version !== '1.4.7.1') throw new Error(`Expected Evercade Next 1.4.7.1, found ${version}`);
if (release.channel !== 'stable') throw new Error('1.4.7.1 must be stable');
if (String(release.phase) !== '5.3') throw new Error('1.4.7.1 must remain phase 5.3');
if (!release.integration.includes('GenericParser 0.45.2 Build 6')) throw new Error('GenericParser Build 6 integration missing');
if (!release.integration.includes('nine-retailer')) throw new Error('Legacy nine-retailer integration missing');
if (release.genericParser?.contract !== 'generic-parser-module-v1') throw new Error('Module contract missing');
if (release.genericParser?.expectedBuild !== 'gp-0452-20260807-6') throw new Error('GenericParser Build 6 expectation missing');

for (const source of ['DragonBox','ASC-Shop','Just For Games Deutschland','Coolshop Deutschland','Enzinger','GameCenterVS','Vitrex-Shop','Funstock','Trumox']) if (!configSource.includes(`name:'${source}'`)) throw new Error(`Legacy automatic source missing: ${source}`);
if (!configSource.includes("dealApiUrl: 'https://project-evercade-deal-api.jnldc.chatgpt.site'")) throw new Error('Legacy deal API URL missing');
if (!parserSource.includes('searchLegacyRetailers')) throw new Error('Legacy retailer search client missing');
if (!parserSource.includes("automaticSources:9")) throw new Error('Nine-retailer request telemetry missing');
if (!parserSource.includes("/api/search?${params}")) throw new Error('Legacy retailer /api/search integration missing');
for (const marker of ['firstMoney','allowZero:false','offer.rejected.invalid_price','priceText','displayPrice']) if (!parserSource.includes(marker)) throw new Error(`Price normalization marker missing: ${marker}`);
for (const marker of ['Promise.allSettled','dedupeOffers','Kleinanzeigen','9 Händler']) if (!parserSource.includes(marker)) throw new Error(`Multi-source merge marker missing: ${marker}`);
for (const marker of ['normalizeSearchTitle','parser.query.normalized','slash_removed']) if (!parserSource.includes(marker)) throw new Error(`Query normalization marker missing: ${marker}`);
for (const marker of ['RETRY_5XX_DELAY_MS = 5000','RETRY_5XX_MAX = 1','parser.retry.scheduled','parser.retry.start','parser.retry.recovered']) if (!parserSource.includes(marker)) throw new Error(`5xx retry marker missing: ${marker}`);

for (const marker of ['offerIndex','dealCenterSeenAt','canonicalOfferKey','updateOfferIndex','migrateLegacyOffers','renderDealCenter','deals.index.updated','priceHistory','inactiveAt','firstSeen','lastSeen']) if (!appSource.includes(marker)) throw new Error(`Trefferzentrale marker missing: ${marker}`);
for (const marker of ['QUEUE_DELAY_MS = 50','BATCH_DELAY_MS = 0','RECOVERY_FAILURE_THRESHOLD = 3','RECOVERY_DELAY_MS = 60000','paid_worker_pacing']) if (!appSource.includes(marker)) throw new Error(`Paid-worker pacing marker missing: ${marker}`);
if (appSource.includes('worker_free_tier_protection')) throw new Error('Must not retain free-tier scheduled protection');

if (!eventSource.includes('window.EVERCADE_LOG')) throw new Error('Event log export missing');
if (!debugSource.includes('diagnostics.complete')) throw new Error('Diagnostics completion logging missing');
for (const marker of ['endpoint.test.start','endpoint.test.complete','endpoint.test.failure']) if (!endpointSource.includes(marker)) throw new Error(`Endpoint diagnostic marker missing: ${marker}`);
if (!smokeSource.includes('EXPECTED_VERSION') || !smokeSource.includes('debug.html')) throw new Error('Public smoke test incomplete');
for (const asset of ['src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/app.js','src/debug.js','src/endpoint-test.js']) if (!loaderSource.includes(asset)) throw new Error(`Release loader missing ${asset}`);
if (!debugHtml.includes('src/release-loader.js')) throw new Error('debug page must load canonical release loader');

const runtimeSource = appSource + configSource + parserSource + eventSource + debugSource + endpointSource + loaderSource + html + debugHtml;
if (/0\.9\.|0\.8\.|0\.7\./.test(runtimeSource)) throw new Error('Legacy runtime version literal found');
if (release.versionSource !== 'VERSION.json') throw new Error('VERSION.json is not canonical');

console.log(`Evercade Next ${version}: validation passed with ${count} catalog entries, GenericParser Kleinanzeigen plus nine legacy automatic retailers, zero-price protection and Phase 5.3 Trefferzentrale.`);

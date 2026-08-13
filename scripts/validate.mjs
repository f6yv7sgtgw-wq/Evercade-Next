import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));
const exists = path => fs.existsSync(path);
const requireMarker = (source, marker, label=marker) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}`);
};

const release = json('VERSION.json');
if (release.version !== '1.5.1' || release.displayVersion !== '1.5.1') throw new Error(`Expected Evercade Next 1.5.1, found ${release.version}`);
if (release.channel !== 'stable') throw new Error('Evercade Next 1.5.1 must be stable');
if (release.versionSource !== 'VERSION.json') throw new Error('VERSION.json must remain the canonical version source');
if (release.genericParser?.contract !== 'generic-parser-module-v1') throw new Error('GenericParser contract regression');
if (release.genericParser?.expectedVersion !== '0.45.2') throw new Error('GenericParser version regression');
if (release.genericParser?.expectedBuild !== 'gp-0452-20260807-6') throw new Error('GenericParser Build 6 regression');

const requiredFiles = [
  'index.html','debug.html','styles.css','manifest.webmanifest','.nojekyll',
  'src/release-loader.js','src/config.js','src/catalog.js','src/eventlog.js','src/debug.js','src/endpoint-test.js',
  'src/parser-client.js','src/offer-guard.js','src/app.js','src/ui-1.5.js',
  'src/sprite-1.5-00.js','src/sprite-1.5-01.js','src/sprite-1.5-02.js','src/sprite-1.5-03.js','src/sprite-1.5-04.js',
  'scripts/smoke.mjs'
];
for (const file of requiredFiles) if (!exists(file)) throw new Error(`Missing ${file}`);
for (const obsolete of ['.release','scripts/materialize-1.5.sh','scripts/normalize-1.5.sh']) if (exists(obsolete)) throw new Error(`Obsolete staged release source remains: ${obsolete}`);

const html = read('index.html');
requireMarker(html,'data-evercade-page="app"','app page marker');
requireMarker(html,'src/release-loader.js','canonical release loader');
requireMarker(html,'data-view="queue">Suche</button>','visible Suche navigation');
if (html.includes('data-view="queue">Vollsuche</button>')) throw new Error('Vollsuche must be renamed to Suche');
if (html.includes('data-view="missing"') || html.includes('data-view="wishlist"')) throw new Error('Fehlend/Wünsche must not return to primary navigation');
for (const marker of ['html,body{max-width:100%;overflow-x:hidden}','grid-template-columns:repeat(4,minmax(0,1fr))']) requireMarker(html,marker,'mobile overflow protection');
for (const id of ['collectionList','catalogList','automaticDeals','dealFilterOwnership','dealSort','queueView']) requireMarker(html,`id="${id}"`,`UI element ${id}`);

const loader = read('src/release-loader.js');
for (const asset of [
  'src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/offer-guard.js','src/app.js',
  'src/sprite-1.5-00.js','src/sprite-1.5-01.js','src/sprite-1.5-02.js','src/sprite-1.5-03.js','src/sprite-1.5-04.js','src/ui-1.5.js'
]) requireMarker(loader,asset,`release-loader asset ${asset}`);
for (const marker of ["fetch(`VERSION.json?t=${Date.now()}`","cache: 'no-store'","?v=${token}",'window.EVERCADE_RELEASE']) requireMarker(loader,marker,'release cache busting');

const chunks = [0,1,2,3,4].map(i => read(`src/sprite-1.5-0${i}.js`));
if (!chunks[0].startsWith("window.EVERCADE_SPRITE_150='")) throw new Error('Sprite chunk 00 must initialize canonical sprite');
for (let i=1;i<chunks.length;i++) if (!chunks[i].startsWith("window.EVERCADE_SPRITE_150+='")) throw new Error(`Sprite chunk 0${i} must append to canonical sprite`);
const encoded = chunks.map((chunk,i) => chunk.replace(i===0 ? /^window\.EVERCADE_SPRITE_150='/ : /^window\.EVERCADE_SPRITE_150\+='/, '').replace(/';\s*$/, '')).join('');
const sprite = Buffer.from(encoded,'base64');
if (sprite.length < 10000) throw new Error(`Cartridge sprite unexpectedly small: ${sprite.length} bytes`);
if (sprite.subarray(0,4).toString('ascii') !== 'RIFF' || sprite.subarray(8,12).toString('ascii') !== 'WEBP') throw new Error('Cartridge sprite is not a valid WebP container');

const ui = read('src/ui-1.5.js');
for (const marker of ['EVERCADE_UI_150','spriteEntries:87','#collectionList .card-actions','#catalogList .card','#automaticDeals .card','background-size:1000% 900%','overflow-x:hidden']) requireMarker(ui,marker,`1.5 UI marker ${marker}`);

const catalog = read('src/catalog.js');
const catalogCount = (catalog.match(/\['(?:console|arcade|computer)',\d+,'/g) || []).length;
if (catalogCount !== 87) throw new Error(`Expected 87 catalog entries, found ${catalogCount}`);

const config = read('src/config.js');
const parser = read('src/parser-client.js');
const guard = read('src/offer-guard.js');
const app = read('src/app.js');
for (const marker of ['generic-parser-module-v1',"genericParserExpectedVersion: '0.45.2'","genericParserExpectedBuild: 'gp-0452-20260807-6'",'automatedRetailerSources']) requireMarker(config,marker,'search configuration');
for (const source of ['DragonBox','ASC-Shop','Just For Games Deutschland','Coolshop Deutschland','Enzinger','GameCenterVS','Vitrex-Shop','Funstock','Trumox']) requireMarker(config,source,`automatic retailer ${source}`);
for (const marker of ['RETRY_5XX_DELAY_MS = 5000','normalizeSearchTitle','parser.query.normalized','slash_removed','searchLegacyRetailers','automaticSources:9','firstMoney','offer.rejected.invalid_price','Promise.allSettled']) requireMarker(parser,marker,'parser regression marker');
for (const marker of ['foreign_platform_marker','insufficient_evercade_evidence','match >= 0.75','platformGuard','playstation','ps5','xbox']) requireMarker(guard.toLowerCase(),marker.toLowerCase(),'platform guard marker');
for (const marker of ['QUEUE_DELAY_MS = 50','BATCH_DELAY_MS = 0','offerIndex','dealFilterOwnership','offerScore','null_zero_price_bug_cleanup',"const sort=$('#dealSort')?.value||'best'",'offerScore(b,active)-offerScore(a,active)', "ownership==='owned'", "ownership==='missing'"]) requireMarker(app,marker,'Evercade runtime marker');

const debugHtml = read('debug.html');
requireMarker(debugHtml,'data-evercade-page="debug"','debug page marker');
requireMarker(debugHtml,'src/release-loader.js','debug release loader');
const smoke = read('scripts/smoke.mjs');
for (const marker of ['EXPECTED_VERSION','debug.html']) requireMarker(smoke,marker,'public smoke test');

console.log(`Evercade Next 1.5.1: canonical direct-source validation passed (${catalogCount} cartridges, ${sprite.length} byte WebP sprite, no release materialization layer).`);

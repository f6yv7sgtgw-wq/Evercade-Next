import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

const release = json('VERSION.json');
const version = release.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION.json must contain semantic version x.y.z');

const requiredFiles = [
  'index.html', 'styles.css', 'manifest.webmanifest',
  'src/config.js', 'src/catalog.js', 'src/parser-client.js', 'src/app.js', '.nojekyll'
];
for (const file of requiredFiles) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const html = read('index.html');
for (const asset of ['styles.css','src/config.js','src/catalog.js','src/parser-client.js','src/app.js']) {
  if (!html.includes(asset)) throw new Error(`index.html does not load ${asset}`);
}
for (const id of ['dealsView','dealCartridge','runDealSearch','automaticDeals','directSources']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing deal UI element ${id}`);
}

const catalogSource = read('src/catalog.js');
const catalogEntryPattern = /\[\s*["'](?:console|arcade|computer)["']\s*,\s*\d+\s*,\s*["']/g;
const count = (catalogSource.match(catalogEntryPattern) || []).length;
if (count !== 87) throw new Error(`Expected 87 catalog entries, found ${count}`);

const configSource = read('src/config.js');
const parserSource = read('src/parser-client.js');
if (!configSource.includes('generic-parser-module-v1')) throw new Error('GenericParser contract missing');
if (!configSource.includes('genericParserSearchPaths')) throw new Error('GenericParser endpoint paths missing');
if (!parserSource.includes("source: 'kleinanzeigen'")) throw new Error('Kleinanzeigen adapter request missing');
if (!parserSource.includes('window.EvercadeSearch')) throw new Error('Search client export missing');

const runtimeSource = read('src/app.js') + configSource + parserSource + html;
if (/0\.9\.|0\.8\.|0\.7\./.test(runtimeSource)) throw new Error('Legacy version literal found in runtime source');

console.log(`Evercade Next ${version}: phase ${release.phase ?? '?'} validation passed with ${count} catalog entries.`);

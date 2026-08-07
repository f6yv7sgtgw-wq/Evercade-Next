const base = process.env.PAGES_URL || 'https://f6yv7sgtgw-wq.github.io/Evercade-Next/';
const expected = process.env.EXPECTED_VERSION;
if (!expected) throw new Error('EXPECTED_VERSION is required');

const get = async path => {
  const url = new URL(path, base);
  url.searchParams.set('t', Date.now());
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
};

let lastError;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const [html, versionText, debug, loader] = await Promise.all([
      get(''), get('VERSION.json'), get('debug.html'), get('src/release-loader.js')
    ]);
    const version = JSON.parse(versionText);
    if (version.version !== expected) throw new Error(`Expected ${expected}, got ${version.version}`);
    if (!html.includes('src/release-loader.js')) throw new Error('Live index missing canonical release loader');
    if (!debug.includes('src/release-loader.js')) throw new Error('Live debug page missing canonical release loader');
    for (const asset of ['src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/app.js','src/debug.js','src/endpoint-test.js']) {
      if (!loader.includes(asset)) throw new Error(`Live release loader missing ${asset}`);
    }
    if (!loader.includes('?v=${token}')) throw new Error('Live release loader missing version cache busting');
    console.log(`Live smoke test passed for ${expected} with version-aware assets on attempt ${attempt}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Attempt ${attempt} failed: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
throw lastError;

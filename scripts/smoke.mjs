const base = process.env.PAGES_URL || 'https://f6yv7sgtgw-wq.github.io/Evercade-Next/';
const expected = process.env.EXPECTED_VERSION;
if (!expected) throw new Error('EXPECTED_VERSION is required');

const get = async path => {
  const response = await fetch(new URL(`${path}?t=${Date.now()}`, base), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
};

let lastError;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const [html, versionText, debug] = await Promise.all([get(''), get('VERSION.json'), get('debug.html')]);
    const version = JSON.parse(versionText);
    if (version.version !== expected) throw new Error(`Expected ${expected}, got ${version.version}`);
    for (const asset of ['src/eventlog.js', 'src/parser-client.js', 'src/app.js']) {
      if (!html.includes(asset)) throw new Error(`Live index missing ${asset}`);
    }
    if (!debug.includes('src/debug.js')) throw new Error('Live debug page missing src/debug.js');
    console.log(`Live smoke test passed for ${expected} on attempt ${attempt}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Attempt ${attempt} failed: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
throw lastError;

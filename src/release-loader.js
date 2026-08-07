(() => {
  'use strict';

  const page = document.documentElement.dataset.evercadePage || 'app';
  const scriptsByPage = {
    app: ['src/config.js','src/eventlog.js','src/catalog.js','src/parser-client.js','src/app.js'],
    debug: ['src/config.js','src/eventlog.js','src/debug.js','src/endpoint-test.js']
  };

  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Asset nicht ladbar: ${src}`));
    document.body.appendChild(script);
  });

  const boot = async () => {
    const response = await fetch(`VERSION.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`VERSION.json: HTTP ${response.status}`);
    const release = await response.json();
    const version = String(release.version || '').trim();
    if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error(`Ungültige Release-Version: ${version || 'leer'}`);

    window.EVERCADE_RELEASE = Object.freeze(release);
    const token = encodeURIComponent(version);
    const scripts = scriptsByPage[page];
    if (!scripts) throw new Error(`Unbekannter Evercade-Seitentyp: ${page}`);

    for (const path of scripts) await loadScript(`${path}?v=${token}`);
  };

  boot().catch(error => {
    console.error('Evercade release loader failed', error);
    const target = document.querySelector('main') || document.body;
    const message = document.createElement('section');
    message.className = 'panel';
    message.innerHTML = `<h2>Release konnte nicht geladen werden</h2><p class="empty">${String(error.message || error)}</p>`;
    target.prepend(message);
  });
})();

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const logApi = window.EVERCADE_LOG;
  const config = window.EVERCADE_CONFIG;

  const check = async (name, task) => {
    const started = performance.now();
    try {
      const detail = await task();
      return { name, status: 'ok', detail: String(detail || 'OK'), ms: Math.round(performance.now() - started) };
    } catch (error) {
      return { name, status: 'error', detail: String(error.message || error), ms: Math.round(performance.now() - started) };
    }
  };

  const fetchJson = async url => {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  async function runChecks() {
    $('#healthChecks').innerHTML = '<p class="empty">Prüfung läuft …</p>';
    const results = await Promise.all([
      check('VERSION.json', async () => {
        const data = await fetchJson('VERSION.json');
        if (!/^\d+\.\d+\.\d+$/.test(data.version)) throw new Error('Ungültige Version');
        return data.version;
      }),
      check('Konfiguration', async () => {
        if (!config?.genericParserWorkerUrl || !config?.pagesUrl) throw new Error('Konfiguration unvollständig');
        return 'vollständig';
      }),
      check('Katalog', async () => {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `src/catalog.js?t=${Date.now()}`;
          script.onload = resolve;
          script.onerror = () => reject(new Error('Katalog nicht ladbar'));
          document.head.append(script);
        });
        if (!Array.isArray(window.EVERCADE_CATALOG) || window.EVERCADE_CATALOG.length !== 87) throw new Error(`Erwartet 87, gefunden ${window.EVERCADE_CATALOG?.length || 0}`);
        return '87 Einträge';
      }),
      check('Parser-Konfiguration', async () => {
        if (config.genericParserContract !== 'generic-parser-module-v1') throw new Error('Falscher API-Vertrag');
        return config.genericParserContract;
      }),
      check('Lokaler Speicher', async () => {
        const key = '__evercade_test__';
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        return 'verfügbar';
      })
    ]);
    $('#healthChecks').innerHTML = results.map(result => `<article class="health-card ${result.status}"><strong>${result.name}</strong><span>${result.status === 'ok' ? 'OK' : 'Fehler'}</span><p>${result.detail}</p><small>${result.ms} ms</small></article>`).join('');
    logApi.log(results.every(result => result.status === 'ok') ? 'info' : 'error', 'diagnostics.complete', { results });
    renderLog();
  }

  function renderLog() {
    const entries = logApi.read().slice().reverse();
    $('#eventLog').innerHTML = entries.length ? entries.map(entry => `<article class="log-entry ${entry.level}"><div><strong>${entry.event}</strong><span>${entry.level}</span></div><time>${new Date(entry.at).toLocaleString('de-DE')}</time><pre>${JSON.stringify(entry.details, null, 2)}</pre></article>`).join('') : '<p class="empty">Noch keine Ereignisse protokolliert.</p>';
  }

  $('#runChecks').addEventListener('click', runChecks);
  $('#clearLog').addEventListener('click', () => { logApi.clear(); renderLog(); });
  $('#downloadLog').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([logApi.exportLog()], { type: 'application/json' }));
    link.download = `evercade-next-eventlog-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  window.addEventListener('evercade-log', renderLog);
  renderLog();
  runChecks();
})();

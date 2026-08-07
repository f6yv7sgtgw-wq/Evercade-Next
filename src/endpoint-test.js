(() => {
  'use strict';
  const config = window.EVERCADE_CONFIG;
  const log = (level, event, details = {}) => window.EVERCADE_LOG?.log(level, event, details);
  const $ = selector => document.querySelector(selector);
  const results = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const payload = () => ({
    contract: config.genericParserContract,
    adapter: 'evercade',
    mode: 'live',
    source: 'auto',
    query: 'Evercade Sunsoft Collection 2',
    page: 0,
    cartridge: { key: 'console-32', title: 'Sunsoft Collection 2', series: 'console', number: 32 },
    required_terms: ['Evercade'],
    accept_bundles: true,
    accept_incomplete: false,
    include_review: true,
    include_rejected: false,
    sort_by: 'relevance'
  });

  function render() {
    const defs = config.genericParserEndpointTests || [];
    $('#endpointTestResults').innerHTML = defs.map(def => {
      const r = results.get(def.id);
      if (!r) return `<article class="endpoint-card"><strong>${esc(def.label)}</strong><span>Nicht getestet</span></article>`;
      const cls = r.ok ? 'ok' : 'error';
      return `<article class="endpoint-card ${cls}"><div class="endpoint-head"><div><strong>${esc(r.label)}</strong><small>${esc(r.url)}</small></div><span>${esc(r.statusLabel)}</span></div><p>${esc(r.diagnosis)}</p><details><summary>Technische Details</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details></article>`;
    }).join('');
  }

  async function run(def) {
    const url = `${config.genericParserWorkerUrl}${def.path}`;
    const started = performance.now();
    const options = { method: def.method, cache: 'no-store', headers: { accept: 'application/json' } };
    if (def.method === 'POST') {
      options.headers['content-type'] = 'application/json';
      options.headers['x-generic-parser-contract'] = config.genericParserContract;
      options.body = JSON.stringify(payload());
    }
    log('info', 'endpoint.test.start', { id: def.id, method: def.method, url });
    try {
      const response = await fetch(url, options);
      const bodyText = await response.text();
      const headers = {};
      for (const [name, value] of response.headers.entries()) headers[name] = value;
      let body = bodyText.slice(0, 6000);
      try { body = JSON.parse(bodyText); } catch {}
      const result = {
        id: def.id,
        label: def.label,
        url,
        ok: response.ok,
        status: response.status,
        statusLabel: `HTTP ${response.status}`,
        responseType: response.type,
        durationMs: Math.round(performance.now() - started),
        headers,
        body,
        diagnosis: response.ok ? 'Browserzugriff funktioniert für diesen Endpunkt.' : `Worker erreichbar, antwortet aber mit HTTP ${response.status}.`
      };
      results.set(def.id, result);
      log(response.ok ? 'info' : 'error', 'endpoint.test.complete', result);
      render();
      return result;
    } catch (error) {
      const result = {
        id: def.id,
        label: def.label,
        url,
        ok: false,
        statusLabel: 'Load failed',
        durationMs: Math.round(performance.now() - started),
        error: String(error.message || error),
        diagnosis: 'Browser konnte keine auswertbare Antwort erhalten. CORS/Preflight, Worker-Route oder Worker-Verfügbarkeit prüfen.'
      };
      results.set(def.id, result);
      log('error', 'endpoint.test.failure', result);
      render();
      return result;
    }
  }

  async function runAll() {
    const button = $('#runAllEndpointTests');
    button.disabled = true;
    results.clear();
    render();
    try {
      for (const def of config.genericParserEndpointTests || []) await run(def);
      const all = [...results.values()];
      log(all.some(r => r.ok) ? 'info' : 'error', 'endpoint.test.matrix.complete', {
        tested: all.length,
        successful: all.filter(r => r.ok).map(r => r.label),
        failed: all.filter(r => !r.ok).map(r => r.label)
      });
    } finally {
      button.disabled = false;
    }
  }

  $('#endpointTestButtons').innerHTML = (config.genericParserEndpointTests || []).map(def => `<button data-endpoint="${esc(def.id)}">${esc(def.label)}</button>`).join('');
  $('#endpointTestButtons').addEventListener('click', event => {
    const button = event.target.closest('[data-endpoint]');
    if (!button) return;
    const def = (config.genericParserEndpointTests || []).find(entry => entry.id === button.dataset.endpoint);
    if (def) run(def);
  });
  $('#runAllEndpointTests').addEventListener('click', runAll);
  render();
})();

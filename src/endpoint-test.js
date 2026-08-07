(() => {
  'use strict';
  const config = window.EVERCADE_CONFIG;
  const log = (level, event, details = {}) => window.EVERCADE_LOG?.log(level, event, details);
  const $ = selector => document.querySelector(selector);
  const results = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeRequestId = () => globalThis.crypto?.randomUUID?.() || `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

  function corsSummary(headers) {
    const wanted = config.genericParserCorsHeaders || [];
    return Object.fromEntries(wanted.map(name => [name, headers[name] || null]));
  }

  function corsOk(def, headers) {
    if (def.kind !== 'cors' && def.method === 'GET') return true;
    const origin = headers['access-control-allow-origin'];
    return origin === '*' || origin === location.origin;
  }

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
    const requestId = makeRequestId();
    const started = performance.now();
    const options = {
      method: def.method,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'x-generic-parser-contract': config.genericParserContract,
        'x-request-id': requestId
      }
    };
    if (def.method === 'POST') {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(payload());
    }
    if (def.method === 'OPTIONS') {
      options.headers['access-control-request-method'] = 'POST';
      options.headers['access-control-request-headers'] = 'content-type,x-generic-parser-contract,x-request-id';
    }
    log('info', 'endpoint.test.start', { id: def.id, requestId, method: def.method, url, origin: location.origin, userAgent: navigator.userAgent });
    try {
      const response = await fetch(url, options);
      const bodyText = await response.text();
      const headers = {};
      for (const [name, value] of response.headers.entries()) headers[name.toLowerCase()] = value;
      let body = bodyText.slice(0, 6000);
      try { body = bodyText ? JSON.parse(bodyText) : {}; } catch {}
      const cors = corsSummary(headers);
      const corsPassed = corsOk(def, headers);
      const ok = response.ok && corsPassed;
      const diagnosis = !response.ok
        ? `Worker erreichbar, antwortet aber mit HTTP ${response.status}.`
        : !corsPassed
          ? 'HTTP-Antwort erhalten, aber Access-Control-Allow-Origin fehlt oder erlaubt den Evercade-Origin nicht.'
          : def.kind === 'cors'
            ? 'OPTIONS-/Preflight-Antwort ist browserkompatibel.'
            : 'Browserzugriff funktioniert für diesen Endpunkt.';
      const result = {
        id: def.id,
        label: def.label,
        requestId,
        workerRequestId: response.headers.get('x-request-id') || response.headers.get('cf-ray') || null,
        url,
        method: def.method,
        ok,
        status: response.status,
        statusLabel: `HTTP ${response.status}`,
        responseType: response.type,
        durationMs: Math.round(performance.now() - started),
        cors,
        headers,
        body,
        diagnosis
      };
      results.set(def.id, result);
      log(ok ? 'info' : 'error', 'endpoint.test.complete', result);
      render();
      return result;
    } catch (error) {
      const result = {
        id: def.id,
        label: def.label,
        requestId,
        url,
        method: def.method,
        ok: false,
        statusLabel: 'Load failed',
        durationMs: Math.round(performance.now() - started),
        error: String(error.message || error),
        stack: error?.stack || null,
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
      log(all.every(r => r.ok) ? 'info' : 'error', 'endpoint.test.matrix.complete', {
        tested: all.length,
        successful: all.filter(r => r.ok).map(r => r.label),
        failed: all.filter(r => !r.ok).map(r => r.label),
        expectedWorkerVersion: config.genericParserExpectedVersion,
        contract: config.genericParserContract
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

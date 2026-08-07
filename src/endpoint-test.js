(() => {
  'use strict';
  const config = window.EVERCADE_CONFIG;
  const log = (level, event, details = {}) => window.EVERCADE_LOG?.log(level, event, details);
  const $ = selector => document.querySelector(selector);
  const results = new Map();
  const transportResults = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeRequestId = () => globalThis.crypto?.randomUUID?.() || `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const environment = () => ({
    release: window.EVERCADE_RELEASE?.version || null,
    workerBaseUrl: config.genericParserWorkerUrl,
    expectedWorkerVersion: config.genericParserExpectedVersion,
    expectedWorkerBuild: config.genericParserExpectedBuild || null,
    contract: config.genericParserContract,
    href: location.href,
    origin: location.origin,
    protocol: location.protocol,
    host: location.host,
    documentBaseURI: document.baseURI,
    referrer: document.referrer || null,
    navigatorOnline: navigator.onLine,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform || null,
    cookieEnabled: navigator.cookieEnabled,
    secureContext: window.isSecureContext,
    visibilityState: document.visibilityState,
    timestamp: new Date().toISOString()
  });

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

  const errorDetails = error => ({
    errorName: error?.name || null,
    errorConstructor: error?.constructor?.name || null,
    errorMessage: String(error?.message || error),
    errorCause: error?.cause == null ? null : String(error.cause),
    stack: error?.stack || null
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

  function renderContext() {
    const ctx = environment();
    $('#transportContext').innerHTML = `<article class="endpoint-card"><div class="endpoint-head"><div><strong>Aktiver Browser-Kontext</strong><small>${esc(ctx.workerBaseUrl)}</small></div><span>${esc(ctx.release || 'unbekannt')}</span></div><details open><summary>Kontext</summary><pre>${esc(JSON.stringify(ctx, null, 2))}</pre></details></article>`;
  }

  function renderTransport() {
    const ordered = ['simple-health','simple-version','instrumented-health','no-cors-health'];
    $('#transportProbeResults').innerHTML = ordered.map(id => {
      const r = transportResults.get(id);
      if (!r) return `<article class="endpoint-card"><strong>${esc(id)}</strong><span>Nicht getestet</span></article>`;
      return `<article class="endpoint-card ${r.ok ? 'ok' : 'error'}"><div class="endpoint-head"><div><strong>${esc(r.label)}</strong><small>${esc(r.url)}</small></div><span>${esc(r.statusLabel)}</span></div><p>${esc(r.diagnosis)}</p><details><summary>Technische Details</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details></article>`;
    }).join('');
  }

  function render() {
    const defs = config.genericParserEndpointTests || [];
    $('#endpointTestResults').innerHTML = defs.map(def => {
      const r = results.get(def.id);
      if (!r) return `<article class="endpoint-card"><strong>${esc(def.label)}</strong><span>Nicht getestet</span></article>`;
      return `<article class="endpoint-card ${r.ok ? 'ok' : 'error'}"><div class="endpoint-head"><div><strong>${esc(r.label)}</strong><small>${esc(r.url)}</small></div><span>${esc(r.statusLabel)}</span></div><p>${esc(r.diagnosis)}</p><details><summary>Technische Details</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details></article>`;
    }).join('');
  }

  async function runTransportProbe({ id, label, path, mode = 'cors', headers = {}, cache = 'no-store' }) {
    const url = `${config.genericParserWorkerUrl}${path}`;
    const requestId = makeRequestId();
    const started = performance.now();
    const options = { method: 'GET', mode, cache, credentials: 'omit', redirect: 'follow', referrerPolicy: 'strict-origin-when-cross-origin', headers };
    const requestMeta = {
      id, label, requestId, url,
      workerBaseUrl: config.genericParserWorkerUrl,
      path,
      method: 'GET',
      fetchMode: mode,
      cache,
      credentials: options.credentials,
      redirect: options.redirect,
      referrerPolicy: options.referrerPolicy,
      requestHeaderNames: Object.keys(headers),
      origin: location.origin,
      href: location.href,
      documentBaseURI: document.baseURI,
      navigatorOnline: navigator.onLine,
      secureContext: window.isSecureContext
    };
    log('info', 'transport.probe.start', requestMeta);
    try {
      const response = await fetch(url, options);
      const durationMs = Math.round(performance.now() - started);
      const responseHeaders = {};
      for (const [name, value] of response.headers.entries()) responseHeaders[name.toLowerCase()] = value;
      let body = null;
      if (response.type !== 'opaque') {
        const text = await response.text();
        try { body = text ? JSON.parse(text) : {}; } catch { body = text.slice(0, 4000); }
      }
      const ok = mode === 'no-cors' ? response.type === 'opaque' || response.ok : response.ok;
      const diagnosis = mode === 'no-cors'
        ? (response.type === 'opaque' ? 'Netzwerktransport funktioniert im no-cors-Modus; CORS-Antwort ist absichtlich nicht lesbar.' : `no-cors Request lieferte Response-Typ ${response.type}.`)
        : id.startsWith('simple-')
          ? 'Einfacher Cross-Origin-GET ohne Evercade-Zusatzheader war lesbar.'
          : 'Instrumentierter Evercade-GET mit Zusatzheadern war lesbar.';
      const result = { ...requestMeta, ok, status: response.status, statusLabel: response.type === 'opaque' ? 'Opaque response' : `HTTP ${response.status}`, responseType: response.type, durationMs, responseHeaders, cors: corsSummary(responseHeaders), body, diagnosis };
      transportResults.set(id, result);
      log(ok ? 'info' : 'error', 'transport.probe.complete', result);
      renderTransport();
      return result;
    } catch (error) {
      const result = { ...requestMeta, ok: false, status: null, statusLabel: 'Load failed', durationMs: Math.round(performance.now() - started), ...errorDetails(error), diagnosis: id.startsWith('simple-') ? 'Selbst der einfache GET ohne Zusatzheader scheitert im fetch()-Kontext.' : 'Dieser Fetch-Modus scheitert; Vergleich mit dem einfachen GET zeigt, ob Zusatzheader/CORS den Unterschied verursachen.' };
      transportResults.set(id, result);
      log('error', 'transport.probe.failure', result);
      renderTransport();
      return result;
    }
  }

  async function runTransportProbes() {
    const button = $('#runTransportProbes');
    button.disabled = true;
    transportResults.clear();
    renderContext();
    renderTransport();
    const instrumentedHeaders = {
      accept: 'application/json',
      'x-generic-parser-contract': config.genericParserContract,
      'x-request-id': makeRequestId()
    };
    try {
      await runTransportProbe({ id: 'simple-health', label: 'Einfacher GET /health · keine Zusatzheader', path: '/health', headers: {} });
      await runTransportProbe({ id: 'simple-version', label: 'Einfacher GET /version · keine Zusatzheader', path: '/version', headers: {} });
      await runTransportProbe({ id: 'instrumented-health', label: 'Evercade GET /health · mit Contract/Request-ID', path: '/health', headers: instrumentedHeaders });
      await runTransportProbe({ id: 'no-cors-health', label: 'Transportprobe GET /health · no-cors', path: '/health', mode: 'no-cors', headers: {} });
      const all = [...transportResults.values()];
      const simple = transportResults.get('simple-health');
      const instrumented = transportResults.get('instrumented-health');
      let differentialDiagnosis = 'Kein eindeutiger Unterschied erkannt.';
      if (simple?.ok && !instrumented?.ok) differentialDiagnosis = 'Eindeutiger Unterschied: Worker ist per einfachem fetch erreichbar, aber Evercade-Zusatzheader lösen den Fehler aus. Fokus: Preflight/Access-Control-Allow-Headers.';
      else if (!simple?.ok && transportResults.get('no-cors-health')?.ok) differentialDiagnosis = 'Transport funktioniert, aber lesbarer CORS-fetch scheitert. Fokus: CORS-Antwort/Origin.';
      else if (!simple?.ok) differentialDiagnosis = 'Auch einfacher fetch scheitert, obwohl direkte Safari-Navigation funktioniert. Fokus: Safari Cross-Origin Fetch/Content-Blocker/Netzwerk-Policy.';
      else if (simple?.ok && instrumented?.ok) differentialDiagnosis = 'Browser-Transport inklusive Evercade-Zusatzheader funktioniert; Fehler liegt danach in der bisherigen Testmatrix oder Request-Gestaltung.';
      log(all.every(r => r.ok) ? 'info' : 'warn', 'transport.probe.matrix.complete', { environment: environment(), differentialDiagnosis, probes: all.map(r => ({ id: r.id, ok: r.ok, statusLabel: r.statusLabel, responseType: r.responseType || null, errorName: r.errorName || null })) });
    } finally {
      button.disabled = false;
    }
  }

  async function run(def) {
    const url = `${config.genericParserWorkerUrl}${def.path}`;
    const requestId = makeRequestId();
    const started = performance.now();
    const headers = {
      accept: 'application/json',
      'x-generic-parser-contract': config.genericParserContract,
      'x-request-id': requestId
    };
    const options = { method: def.method, mode: 'cors', cache: 'no-store', credentials: 'omit', redirect: 'follow', referrerPolicy: 'strict-origin-when-cross-origin', headers };
    if (def.method === 'POST') {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(payload());
    }
    const requestMeta = {
      id: def.id, requestId, method: def.method, url,
      workerBaseUrl: config.genericParserWorkerUrl,
      fetchMode: options.mode,
      cache: options.cache,
      credentials: options.credentials,
      redirect: options.redirect,
      referrerPolicy: options.referrerPolicy,
      requestHeaderNames: Object.keys(headers),
      origin: location.origin,
      href: location.href,
      documentBaseURI: document.baseURI,
      navigatorOnline: navigator.onLine,
      secureContext: window.isSecureContext,
      userAgent: navigator.userAgent
    };
    log('info', 'endpoint.test.start', requestMeta);
    try {
      const response = await fetch(url, options);
      const bodyText = await response.text();
      const responseHeaders = {};
      for (const [name, value] of response.headers.entries()) responseHeaders[name.toLowerCase()] = value;
      let body = bodyText.slice(0, 6000);
      try { body = bodyText ? JSON.parse(bodyText) : {}; } catch {}
      const cors = corsSummary(responseHeaders);
      const corsPassed = corsOk(def, responseHeaders);
      const ok = response.ok && corsPassed;
      const diagnosis = !response.ok ? `Worker erreichbar, antwortet aber mit HTTP ${response.status}.` : !corsPassed ? 'HTTP-Antwort erhalten, aber Access-Control-Allow-Origin fehlt oder erlaubt den Evercade-Origin nicht.' : def.kind === 'cors' ? 'OPTIONS-Antwort ist browserkompatibel.' : 'Browserzugriff funktioniert für diesen Endpunkt.';
      const result = { ...requestMeta, label: def.label, workerRequestId: response.headers.get('x-request-id') || response.headers.get('cf-ray') || null, ok, status: response.status, statusLabel: `HTTP ${response.status}`, responseType: response.type, durationMs: Math.round(performance.now() - started), cors, responseHeaders, body, diagnosis };
      results.set(def.id, result);
      log(ok ? 'info' : 'error', 'endpoint.test.complete', result);
      render();
      return result;
    } catch (error) {
      const result = { ...requestMeta, label: def.label, ok: false, status: null, statusLabel: 'Load failed', durationMs: Math.round(performance.now() - started), ...errorDetails(error), diagnosis: 'Browser konnte keine auswertbare Antwort erhalten. Die 1.4.5.4-Transportproben zeigen, ob bereits einfacher fetch oder erst Evercade-Zusatzheader/CORS scheitern.' };
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
      log(all.every(r => r.ok) ? 'info' : 'error', 'endpoint.test.matrix.complete', { tested: all.length, successful: all.filter(r => r.ok).map(r => r.label), failed: all.filter(r => !r.ok).map(r => r.label), expectedWorkerVersion: config.genericParserExpectedVersion, expectedWorkerBuild: config.genericParserExpectedBuild || null, workerBaseUrl: config.genericParserWorkerUrl, contract: config.genericParserContract, environment: environment() });
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
  $('#runTransportProbes').addEventListener('click', runTransportProbes);
  $('#runAllEndpointTests').addEventListener('click', runAll);
  renderContext();
  renderTransport();
  render();
  log('info', 'transport.context', environment());
})();

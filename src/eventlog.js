(() => {
  'use strict';
  const KEY = 'project-evercade-next-eventlog';
  const RUN_KEY = 'project-evercade-next-run-diagnostics';
  const LIMIT = 1200;
  const RUN_LIMIT = 20;
  const now = () => new Date().toISOString();
  const makeId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parse = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const read = () => parse(KEY, []);
  const readRuns = () => parse(RUN_KEY, []);
  const safeWrite = (key, value, fallbackTrim) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) {
      try {
        const trimmed = fallbackTrim(value);
        localStorage.setItem(key, JSON.stringify(trimmed));
        return false;
      } catch { return false; }
    }
  };
  const write = entries => safeWrite(KEY, entries.slice(-LIMIT), list => list.slice(-Math.max(250, Math.floor(LIMIT / 2))));
  const writeRuns = runs => safeWrite(RUN_KEY, runs.slice(-RUN_LIMIT), list => list.slice(-5));

  let currentRun = null;
  let currentItem = null;
  const requestTimes = [];
  const signalLevels = new Set();

  function baseRun(total = null) {
    return {
      runId: makeId('run'), startedAt: now(), endedAt: null, total,
      requests: 0, responses: 0, failures: 0, loadFailed: 0,
      http429: 0, http5xx: 0, http4xx: 0,
      successes: 0, queueDone: 0, queueOffers: 0, queueErrors: 0,
      firstFailureAt: null, lastFailureAt: null,
      consecutiveFailures: 0, maxConsecutiveFailures: 0,
      firstFailureItem: null, lastFailureItem: null,
      routes: {}, failedRoutes: {}, peakRequestsPer60s: 0,
      resourceLimitSignals: [], storageTruncated: false
    };
  }

  function persistRun() {
    if (!currentRun) return;
    const runs = readRuns();
    const index = runs.findIndex(run => run.runId === currentRun.runId);
    const compact = { ...currentRun };
    if (index >= 0) runs[index] = compact; else runs.push(compact);
    writeRuns(runs);
  }

  function noteRequest(details) {
    if (!currentRun) currentRun = baseRun();
    currentRun.requests += 1;
    const route = details.route || 'unknown';
    currentRun.routes[route] = (currentRun.routes[route] || 0) + 1;
    const stamp = Date.now();
    requestTimes.push(stamp);
    while (requestTimes.length && requestTimes[0] < stamp - 60000) requestTimes.shift();
    currentRun.peakRequestsPer60s = Math.max(currentRun.peakRequestsPer60s, requestTimes.length);
  }

  function noteResponse(details) {
    if (!currentRun) return;
    currentRun.responses += 1;
    const status = Number(details.status || 0);
    if (status >= 200 && status < 400) {
      currentRun.successes += 1;
      currentRun.consecutiveFailures = 0;
    }
    if (status === 429) currentRun.http429 += 1;
    else if (status >= 500) currentRun.http5xx += 1;
    else if (status >= 400) currentRun.http4xx += 1;
  }

  function addSignal(kind, confidence, reason, details = {}) {
    if (!currentRun) return null;
    const levelKey = `${kind}:${reason}`;
    if (signalLevels.has(levelKey)) return null;
    signalLevels.add(levelKey);
    const signal = {
      at: now(), kind, confidence, reason,
      item: currentItem ? { ...currentItem } : null,
      run: {
        requests: currentRun.requests,
        failures: currentRun.failures,
        loadFailed: currentRun.loadFailed,
        http429: currentRun.http429,
        http5xx: currentRun.http5xx,
        consecutiveFailures: currentRun.consecutiveFailures,
        peakRequestsPer60s: currentRun.peakRequestsPer60s
      },
      ...details
    };
    currentRun.resourceLimitSignals.push(signal);
    return signal;
  }

  function noteFailure(details) {
    if (!currentRun) currentRun = baseRun();
    currentRun.failures += 1;
    currentRun.consecutiveFailures += 1;
    currentRun.maxConsecutiveFailures = Math.max(currentRun.maxConsecutiveFailures, currentRun.consecutiveFailures);
    const message = String(details.message || '');
    if (/load failed/i.test(message)) currentRun.loadFailed += 1;
    currentRun.firstFailureAt ||= now();
    currentRun.lastFailureAt = now();
    currentRun.firstFailureItem ||= currentItem ? { ...currentItem } : null;
    currentRun.lastFailureItem = currentItem ? { ...currentItem } : null;
    const route = details.route || 'unknown';
    currentRun.failedRoutes[route] = (currentRun.failedRoutes[route] || 0) + 1;

    if (Number(details.status) === 429) return addSignal('worker_quota_or_rate_limit', 'high', 'HTTP 429 observed', { status: 429 });
    if (/1102|resource limit|exceeded resource/i.test(message)) return addSignal('worker_resource_limit', 'high', 'Cloudflare resource-limit signature observed', { message });
    if (currentRun.consecutiveFailures >= 3 && currentRun.successes > 0 && currentRun.loadFailed >= 3) {
      return addSignal('worker_resource_limit_possible', 'medium', '3+ consecutive Load failed after earlier successful requests', {
        note: 'This pattern is consistent with transient Worker exhaustion/quota pressure but is not proof by itself.'
      });
    }
    if (currentRun.peakRequestsPer60s >= 60 && currentRun.consecutiveFailures >= 3) {
      return addSignal('request_pressure_high', 'medium', 'high rolling request rate coincides with repeated failures');
    }
    return null;
  }

  function updateDiagnostics(event, details) {
    let synthesized = null;
    if (event === 'queue.started') {
      currentRun = baseRun(details.total ?? null);
      currentItem = null;
      requestTimes.length = 0;
      signalLevels.clear();
    } else if (event === 'queue.item.start') {
      currentItem = { index: details.index ?? null, total: details.total ?? null, key: details.key ?? null, title: details.title ?? null, at: now() };
    } else if (event === 'parser.request') {
      noteRequest(details);
    } else if (event === 'parser.response') {
      noteResponse(details);
    } else if (event === 'parser.failure') {
      synthesized = noteFailure(details);
    } else if (event === 'queue.item.complete') {
      if (currentRun) { currentRun.queueDone += 1; currentRun.queueOffers += Number(details.offers || 0); }
    } else if (event === 'queue.item.error') {
      if (currentRun) { currentRun.queueDone += 1; currentRun.queueErrors += 1; }
    } else if (event === 'queue.complete') {
      if (currentRun) {
        currentRun.endedAt = now();
        currentRun.queueDone = Number(details.done ?? currentRun.queueDone);
        currentRun.queueOffers = Number(details.offers ?? currentRun.queueOffers);
        currentRun.queueErrors = Number(details.errors ?? currentRun.queueErrors);
      }
    }
    persistRun();
    return synthesized;
  }

  const log = (level, event, details = {}) => {
    const entries = read();
    const entry = { at: now(), level, event, details };
    entries.push(entry);
    const stored = write(entries);
    if (!stored && currentRun) currentRun.storageTruncated = true;
    const signal = updateDiagnostics(event, details);
    if (signal) {
      const signalEntry = { at: now(), level: signal.confidence === 'high' ? 'error' : 'warn', event: 'worker.limit.signal', details: signal };
      const again = read(); again.push(signalEntry); write(again);
      window.dispatchEvent(new CustomEvent('evercade-log', { detail: signalEntry }));
    }
    window.dispatchEvent(new CustomEvent('evercade-log', { detail: entry }));
  };
  const clear = () => { localStorage.removeItem(KEY); localStorage.removeItem(RUN_KEY); currentRun = null; currentItem = null; requestTimes.length = 0; signalLevels.clear(); };
  const exportLog = () => JSON.stringify({
    exportedAt: now(),
    eventRetention: { maxRecentEvents: LIMIT, runSummaries: RUN_LIMIT },
    currentRunId: currentRun?.runId || null,
    events: read(),
    runs: readRuns()
  }, null, 2);
  const currentRunSnapshot = () => currentRun ? JSON.parse(JSON.stringify(currentRun)) : null;

  window.EVERCADE_LOG = Object.freeze({ log, read, readRuns, clear, exportLog, currentRunSnapshot, key: KEY, runKey: RUN_KEY });

  window.addEventListener('error', event => log('error', 'window.error', { message: event.message, source: event.filename, line: event.lineno, column: event.colno }));
  window.addEventListener('unhandledrejection', event => log('error', 'unhandledrejection', { reason: String(event.reason?.stack || event.reason || 'unknown') }));
  document.addEventListener('visibilitychange', () => log('info', 'visibility', { state: document.visibilityState }));
  log('info', 'page.load', { path: location.pathname, href: location.href, eventRetention: LIMIT, runDiagnostics: true });
})();

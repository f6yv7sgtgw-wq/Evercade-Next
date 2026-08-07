(() => {
  'use strict';
  const KEY = 'project-evercade-next-eventlog';
  const LIMIT = 500;
  const now = () => new Date().toISOString();
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  };
  const write = entries => localStorage.setItem(KEY, JSON.stringify(entries.slice(-LIMIT)));
  const log = (level, event, details = {}) => {
    const entries = read();
    entries.push({ at: now(), level, event, details });
    write(entries);
    window.dispatchEvent(new CustomEvent('evercade-log', { detail: entries.at(-1) }));
  };
  const clear = () => localStorage.removeItem(KEY);
  const exportLog = () => JSON.stringify(read(), null, 2);

  window.EVERCADE_LOG = Object.freeze({ log, read, clear, exportLog, key: KEY });

  window.addEventListener('error', event => log('error', 'window.error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno
  }));
  window.addEventListener('unhandledrejection', event => log('error', 'unhandledrejection', {
    reason: String(event.reason?.stack || event.reason || 'unknown')
  }));
  document.addEventListener('visibilitychange', () => log('info', 'visibility', { state: document.visibilityState }));
  log('info', 'page.load', { path: location.pathname, href: location.href });
})();

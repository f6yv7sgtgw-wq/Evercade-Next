(() => {
  'use strict';

  const config = window.EVERCADE_CONFIG;
  const base = window.EvercadeSearch;
  const log = (level,event,details={}) => window.EVERCADE_LOG?.log(level,event,details);
  if (!base) return;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();

  const ignored = new Set(['evercade','blaze','collection','cartridge','cartouche','the','and','edition','game','games']);
  const tokens = value => normalize(value).split(/\s+/).filter(token => token.length > 1 && !ignored.has(token));
  const forbiddenPlatform = /(?:^|[\s/_-])(playstation(?:\s*5|\s*4)?|ps5|ps4|xbox(?:\s*(?:one|series))?|nintendo\s*switch|switch)(?:$|[\s/_-])/i;
  const evercadeMarker = /\b(?:evercade|blaze\s+evercade)\b/i;

  function titleMatch(expectedTitle, actualTitle) {
    const expected = tokens(expectedTitle);
    const actual = new Set(tokens(actualTitle));
    if (!expected.length) return 0;
    return expected.filter(token => actual.has(token)).length / expected.length;
  }

  function classify(cartridgeTitle, offer) {
    const title = String(offer?.title || '');
    const url = String(offer?.url || '');
    const source = String(offer?.source || 'Unbekannt');
    const haystack = `${title} ${url}`;
    const match = titleMatch(cartridgeTitle, title);

    if (forbiddenPlatform.test(haystack)) {
      return { ok:false, reason:'foreign_platform_marker', match, source, title, url };
    }

    if (evercadeMarker.test(haystack)) {
      return { ok:true, reason:'explicit_evercade_marker', match, source, title, url };
    }

    // Generic retailer titles such as "Activision Collection 2" are valid only
    // when they match the requested Evercade cartridge very closely. This rejects
    // ambiguous cross-platform products such as a PS5 "Demons of Asteborg" page
    // for the dual Evercade cartridge "Demons of Asteborg / Astebros".
    if (match >= 0.75) {
      return { ok:true, reason:'strong_title_match', match, source, title, url };
    }

    return { ok:false, reason:'insufficient_evercade_evidence', match, source, title, url };
  }

  function filterOffers(cartridge, offers, context='search') {
    const accepted = [];
    for (const offer of offers || []) {
      const verdict = classify(cartridge?.title || '', offer);
      if (verdict.ok) accepted.push(offer);
      else log('warn','offer.rejected.platform_guard',{
        context,
        cartridgeKey:cartridge?.key || null,
        cartridgeTitle:cartridge?.title || null,
        ...verdict
      });
    }
    return accepted;
  }

  function sanitizePersistedIndex() {
    if (!config?.storageKey) return;
    try {
      const raw = localStorage.getItem(config.storageKey);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state?.offerIndex || typeof state.offerIndex !== 'object') return;
      let removed = 0;
      for (const [key,entry] of Object.entries(state.offerIndex)) {
        const verdict = classify(entry?.cartridgeTitle || '', entry);
        if (!verdict.ok) {
          delete state.offerIndex[key];
          removed += 1;
          log('warn','deals.index.removed.platform_guard',{key,cartridgeKey:entry?.cartridgeKey||null,cartridgeTitle:entry?.cartridgeTitle||null,...verdict});
        }
      }
      if (removed) {
        localStorage.setItem(config.storageKey, JSON.stringify(state));
        log('info','deals.index.platform_sanitized',{removed,remaining:Object.keys(state.offerIndex).length});
      }
    } catch (error) {
      log('warn','deals.index.platform_sanitize_failed',{message:error?.message||String(error)});
    }
  }

  const guardedSearch = async (cartridge, options={}) => {
    const result = await base.search(cartridge, options);
    const before = Array.isArray(result?.automatic) ? result.automatic.length : 0;
    const automatic = filterOffers(cartridge, result?.automatic || [], 'live_search');
    if (automatic.length !== before) {
      log('info','search.platform_guard.complete',{cartridge:cartridge?.key||null,before,after:automatic.length,rejected:before-automatic.length});
    }
    return {...result, automatic};
  };

  sanitizePersistedIndex();
  window.EvercadeSearch = Object.freeze({
    ...base,
    search: guardedSearch,
    platformGuard: Object.freeze({classify,filterOffers})
  });
})();

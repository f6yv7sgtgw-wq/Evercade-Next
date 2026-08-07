(() => {
  'use strict';

  const config = window.EVERCADE_CONFIG;
  const log = (level,event,details={}) => window.EVERCADE_LOG?.log(level,event,details);
  const makeRequestId = () => globalThis.crypto?.randomUUID?.() || `ev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestTimes = [];
  const RETRY_5XX_DELAY_MS = 5000;
  const RETRY_5XX_MAX = 1;
  const telemetry = {
    startedAt: new Date().toISOString(), requests:0, successes:0, failures:0, loadFailed:0,
    http429:0, http5xx:0, consecutiveFailures:0, maxConsecutiveFailures:0,
    lastSuccessAt:null, lastFailureAt:null, peakRequestsPer60s:0, lastHealthProbeAt:null,
    healthProbes:0, healthProbeFailures:0, retries5xx:0, retries5xxRecovered:0
  };
  let healthProbePromise = null;

  const safeNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  const safeUrl = value => {
    try {
      const url = new URL(String(value || ''));
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  function normalizeOffer(raw, fallbackSource = 'Kleinanzeigen') {
    const price = safeNumber(raw?.price ?? raw?.preis ?? raw?.amount);
    const shipping = safeNumber(raw?.shipping ?? raw?.versand ?? raw?.shippingCost);
    const explicitTotal = safeNumber(raw?.total ?? raw?.gesamtpreis);
    const url = safeUrl(raw?.url ?? raw?.link ?? raw?.href);
    if (!url || price == null) return null;
    const shippingKnown = shipping != null;
    const total = explicitTotal ?? (shippingKnown ? Math.round((price + shipping) * 100) / 100 : null);
    return {
      id: String(raw?.id ?? raw?.adId ?? raw?.listingId ?? url), source: String(raw?.source ?? raw?.quelle ?? fallbackSource),
      title: String(raw?.title ?? raw?.titel ?? 'Evercade-Angebot').trim(), price, shipping, total, shippingKnown,
      location: String(raw?.location ?? raw?.ort ?? '').trim(), condition: String(raw?.condition ?? raw?.zustand ?? 'Unbekannt'),
      sellerType: String(raw?.sellerType ?? raw?.anbieterTyp ?? 'Unbekannt'), url,
      verifiedAt: raw?.verifiedAt ?? raw?.checkedAt ?? new Date().toISOString()
    };
  }

  function collectListings(payload) {
    const candidates = [
      payload?.listings,payload?.results,payload?.items,
      payload?.data?.listings,payload?.data?.results,payload?.data?.items,
      payload?.response?.listings,payload?.response?.results,payload?.response?.items,
      payload?.packets?.flatMap?.(packet => packet?.listings || packet?.results || [])
    ];
    return candidates.find(Array.isArray) || [];
  }

  function noteRequestPressure() {
    telemetry.requests += 1;
    const stamp = Date.now();
    requestTimes.push(stamp);
    while (requestTimes.length && requestTimes[0] < stamp - 60000) requestTimes.shift();
    telemetry.peakRequestsPer60s = Math.max(telemetry.peakRequestsPer60s, requestTimes.length);
    return requestTimes.length;
  }

  function snapshot(extra={}) {
    const elapsedMs = Date.now() - new Date(telemetry.startedAt).getTime();
    return {
      ...telemetry,
      elapsedMs,
      requestsLast60s: requestTimes.length,
      currentRun: window.EVERCADE_LOG?.currentRunSnapshot?.() || null,
      ...extra
    };
  }

  function waitWithSignal(ms, signal) {
    return new Promise((resolve,reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted','AbortError'));
      const timer = setTimeout(() => {
        signal?.removeEventListener?.('abort',onAbort);
        resolve();
      },ms);
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort',onAbort);
        reject(new DOMException('Aborted','AbortError'));
      };
      signal?.addEventListener?.('abort',onAbort,{once:true});
    });
  }

  async function probeWorkerHealth(reason='failure-streak') {
    const since = telemetry.lastHealthProbeAt ? Date.now() - new Date(telemetry.lastHealthProbeAt).getTime() : Infinity;
    if (healthProbePromise || since < 15000) return healthProbePromise;
    telemetry.lastHealthProbeAt = new Date().toISOString();
    telemetry.healthProbes += 1;
    healthProbePromise = (async () => {
      const started = performance.now();
      const url = `${config.genericParserWorkerUrl}/health?t=${Date.now()}`;
      log('info','worker.health.probe.start',{reason,url,telemetry:snapshot()});
      try {
        const response = await fetch(url,{cache:'no-store',mode:'cors',credentials:'omit'});
        const text = await response.text();
        let body = null;
        try { body = text ? JSON.parse(text) : {}; } catch { body = text.slice(0,1000); }
        const result = {
          reason, ok:response.ok, status:response.status, responseType:response.type,
          durationMs:Math.round(performance.now()-started),
          build:body?.build_id || body?.build || null,
          version:body?.version || null,
          cfRay:response.headers.get('cf-ray') || null,
          telemetry:snapshot()
        };
        log(response.ok?'info':'warn','worker.health.probe.complete',result);
        return result;
      } catch(error) {
        telemetry.healthProbeFailures += 1;
        const result = {
          reason, ok:false, status:null, durationMs:Math.round(performance.now()-started),
          errorName:error?.name || null, message:error?.message || String(error), telemetry:snapshot()
        };
        log('error','worker.health.probe.failure',result);
        return result;
      } finally { healthProbePromise = null; }
    })();
    return healthProbePromise;
  }

  async function requestJson(url, { method='GET', body=null, signal, attempt=0 } = {}) {
    const requestId = makeRequestId();
    const started = performance.now();
    const route = new URL(url).pathname;
    const requestRate = noteRequestPressure();
    const headers = {
      accept: 'application/json',
      'x-generic-parser-contract': config.genericParserContract,
      'x-request-id': requestId
    };
    const options = { method, headers, signal, cache: 'no-store', mode:'cors', credentials:'omit' };
    if (body != null) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const requestMeta = {
      requestId,
      timestamp: new Date().toISOString(),
      route,
      method,
      origin: location.origin,
      userAgent: navigator.userAgent,
      query: body?.query,
      source: body?.source,
      attempt,
      requestsLast60s:requestRate,
      totalRequests:telemetry.requests
    };
    log('info','parser.request',requestMeta);
    try {
      const response = await fetch(url, options);
      const durationMs = Math.round(performance.now()-started);
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`Ungültige JSON-Antwort (HTTP ${response.status})`); }
      const hitCount = collectListings(data).length;
      const cfRay = response.headers.get('cf-ray') || null;
      const workerRequestId = response.headers.get('x-request-id') || cfRay || null;
      const workerVersion = response.headers.get('x-genericparser-version') || null;
      const workerBuild = response.headers.get('x-genericparser-build') || null;
      if (response.ok) {
        telemetry.successes += 1;
        telemetry.consecutiveFailures = 0;
        telemetry.lastSuccessAt = new Date().toISOString();
      } else {
        telemetry.failures += 1;
        telemetry.consecutiveFailures += 1;
        telemetry.maxConsecutiveFailures = Math.max(telemetry.maxConsecutiveFailures, telemetry.consecutiveFailures);
        telemetry.lastFailureAt = new Date().toISOString();
        if (response.status === 429) telemetry.http429 += 1;
        if (response.status >= 500) telemetry.http5xx += 1;
      }
      log(response.ok?'info':'error','parser.response',{
        ...requestMeta,
        durationMs,
        status:response.status,
        hitCount,
        workerRequestId,
        cfRay,
        contentType:response.headers.get('content-type') || null,
        workerVersion,
        workerBuild,
        responseBody:response.status >= 500 ? data : undefined,
        telemetry:snapshot()
      });
      if (!response.ok) {
        const message = data?.error?.message || data?.message || data?.detail || `HTTP ${response.status}`;
        const error = new Error(typeof message === 'string' ? message : `HTTP ${response.status}`);
        error.status = response.status;
        error.response = data;
        error.cfRay = cfRay;
        error.workerRequestId = workerRequestId;
        error.workerVersion = workerVersion;
        error.workerBuild = workerBuild;
        throw error;
      }
      return data;
    } catch(error) {
      const isAbort = error?.name === 'AbortError';
      const status = Number(error?.status || 0) || null;
      if (!isAbort && !status) {
        telemetry.failures += 1;
        telemetry.consecutiveFailures += 1;
        telemetry.maxConsecutiveFailures = Math.max(telemetry.maxConsecutiveFailures, telemetry.consecutiveFailures);
        telemetry.lastFailureAt = new Date().toISOString();
        if (/load failed/i.test(String(error?.message || ''))) telemetry.loadFailed += 1;
      }
      const details = {
        ...requestMeta,
        durationMs:Math.round(performance.now()-started),
        status,
        message:error?.message || String(error),
        errorName:error?.name || null,
        errorConstructor:error?.constructor?.name || null,
        stack:error?.stack || null,
        cfRay:error?.cfRay || null,
        workerRequestId:error?.workerRequestId || null,
        workerVersion:error?.workerVersion || null,
        workerBuild:error?.workerBuild || null,
        responseBody:status >= 500 ? (error?.response ?? null) : undefined,
        telemetry:snapshot()
      };
      log(isAbort?'info':'error','parser.failure',details);
      if (!isAbort && telemetry.consecutiveFailures >= 3) {
        log('warn','worker.pressure.suspected',{
          reason:'three_or_more_consecutive_parser_failures',
          note:'Possible Worker pressure/resource exhaustion. This is a diagnostic inference, not proof.',
          telemetry:snapshot({route,status,message:details.message})
        });
        probeWorkerHealth('consecutive-parser-failures');
      }
      throw error;
    }
  }

  async function postJson(url, body, signal) {
    const route = new URL(url).pathname;
    for (let attempt=0; attempt<=RETRY_5XX_MAX; attempt+=1) {
      try {
        const data = await requestJson(url,{method:'POST',body,signal,attempt});
        if (attempt > 0) {
          telemetry.retries5xxRecovered += 1;
          log('info','parser.retry.recovered',{route,attempt,query:body?.query,telemetry:snapshot()});
        }
        return data;
      } catch(error) {
        if (error?.name === 'AbortError') throw error;
        const status = Number(error?.status || 0) || null;
        const retryable = status != null && status >= 500 && status <= 599 && attempt < RETRY_5XX_MAX;
        if (!retryable) throw error;
        telemetry.retries5xx += 1;
        log('warn','parser.retry.scheduled',{
          route,
          query:body?.query,
          status,
          attempt:attempt+1,
          maxRetries:RETRY_5XX_MAX,
          delayMs:RETRY_5XX_DELAY_MS,
          cfRay:error?.cfRay || null,
          workerRequestId:error?.workerRequestId || null,
          workerVersion:error?.workerVersion || null,
          workerBuild:error?.workerBuild || null,
          responseBody:error?.response ?? null,
          telemetry:snapshot()
        });
        await waitWithSignal(RETRY_5XX_DELAY_MS,signal);
        log('info','parser.retry.start',{route,query:body?.query,attempt:attempt+1,telemetry:snapshot()});
      }
    }
    throw new Error('Retry loop exhausted');
  }

  async function searchKleinanzeigen(item, options = {}) {
    const query = `Evercade ${item.title}`;
    const payload = {contract:config.genericParserContract,adapter:'evercade',mode:'live',source:'auto',query,page:0,cartridge:{key:item.key,title:item.title,series:item.series,number:item.number},required_terms:['Evercade'],accept_bundles:true,accept_incomplete:false,include_review:true,include_rejected:false,sort_by:'relevance'};
    const errors=[];
    for (const path of config.genericParserSearchPaths) {
      try {
        const data=await postJson(`${config.genericParserWorkerUrl}${path}`,payload,options.signal);
        const offers=collectListings(data).map(entry=>normalizeOffer(entry,'Kleinanzeigen')).filter(Boolean);
        log('info','parser.normalized',{cartridge:item.key,path,offers:offers.length,telemetry:snapshot()});
        return {source:'Kleinanzeigen',status:'ok',offers,raw:data,endpoint:path};
      } catch(error) {
        if (error?.name==='AbortError') throw error;
        errors.push(`${path}: ${error.message}`);
      }
    }
    const error=new Error(`GenericParser nicht erreichbar (${errors.join('; ')})`);
    error.code='GENERIC_PARSER_UNREACHABLE';
    throw error;
  }

  function directSearches(item) {
    const query=encodeURIComponent(`Evercade ${item.title}`);
    return config.directSources.map(source=>({name:source.name,url:source.url.replace('{query}',query)}));
  }

  async function search(item, options = {}) {
    const result=await searchKleinanzeigen(item,options);
    const automatic=[...result.offers].sort((a,b)=>(a.total??Number.POSITIVE_INFINITY)-(b.total??Number.POSITIVE_INFINITY)||a.price-b.price);
    const status=[{name:result.source,status:'ok',count:result.offers.length,endpoint:result.endpoint}];
    const checkedAt=new Date().toISOString();
    log('info','search.complete',{cartridge:item.key,automatic:automatic.length,status,telemetry:snapshot()});
    return {automatic,direct:directSearches(item),status,checkedAt};
  }

  window.EVERCADE_WORKER_TELEMETRY=Object.freeze({snapshot,probeWorkerHealth});
  window.EvercadeSearch=Object.freeze({search,searchKleinanzeigen,directSearches,normalizeOffer,requestJson,collectListings,telemetry:snapshot});
})();

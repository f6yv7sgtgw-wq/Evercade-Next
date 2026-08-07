(() => {
  'use strict';

  const config = window.EVERCADE_CONFIG;
  const log = (level,event,details={}) => window.EVERCADE_LOG?.log(level,event,details);

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
    const candidates = [payload?.listings,payload?.results,payload?.items,payload?.data?.listings,payload?.data?.results,payload?.data?.items,payload?.packets?.flatMap?.(packet => packet?.listings || packet?.results || [])];
    return candidates.find(Array.isArray) || [];
  }

  async function postJson(url, body, signal) {
    const started=performance.now();
    log('info','parser.request',{url,query:body.query,source:body.source});
    try{
      const response = await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-generic-parser-contract':config.genericParserContract},body:JSON.stringify(body),signal,cache:'no-store'});
      const durationMs=Math.round(performance.now()-started);
      log(response.ok?'info':'error','parser.response',{url,status:response.status,durationMs});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }catch(error){
      log('error','parser.failure',{url,message:error.message,durationMs:Math.round(performance.now()-started)});
      throw error;
    }
  }

  async function searchKleinanzeigen(item, options = {}) {
    const query = `Evercade ${item.title}`;
    const payload = {contract:config.genericParserContract,adapter:'evercade',mode:'live',source:'auto',query,page:0,cartridge:{key:item.key,title:item.title,series:item.series,number:item.number},required_terms:['Evercade'],accept_bundles:true,accept_incomplete:false,include_review:true,include_rejected:false,sort_by:'relevance'};
    const errors=[];
    for (const path of config.genericParserSearchPaths) {
      try {
        const data=await postJson(`${config.genericParserWorkerUrl}${path}`,payload,options.signal);
        const offers=collectListings(data).map(entry=>normalizeOffer(entry,'Kleinanzeigen')).filter(Boolean);
        log('info','parser.normalized',{cartridge:item.key,path,offers:offers.length});
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
    log('info','search.complete',{cartridge:item.key,automatic:automatic.length,status});
    return {automatic,direct:directSearches(item),status,checkedAt};
  }

  window.EvercadeSearch=Object.freeze({search,searchKleinanzeigen,directSearches,normalizeOffer});
})();

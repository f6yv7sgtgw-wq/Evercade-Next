(() => {
  'use strict';
  const catalog = window.EVERCADE_CATALOG || [];
  const config = window.EVERCADE_CONFIG;
  const searchClient = window.EvercadeSearch;
  const log = (level,event,details={}) => window.EVERCADE_LOG?.log(level,event,details);
  const defaultOwned = ['console-31','console-34','console-37','console-40','console-48','arcade-1','computer-8'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const seriesLabel = {console:'Console',arcade:'Arcade',computer:'Home Computer'};
  const seriesOrder = {console:0,arcade:1,computer:2};
  const load = () => { try { return JSON.parse(localStorage.getItem(config.storageKey)) || {}; } catch { return {}; } };
  const emptyQueue = () => ({status:'idle',keys:[],index:0,done:0,offers:0,errors:0,startedAt:null,updatedAt:null,current:null});
  let state = { owned: defaultOwned, wishlist: [], prices: {}, notes: {}, searches: {}, offerIndex: {}, dealCenterSeenAt: null, queue: emptyQueue(), ...load() };
  if (!state.queue || !Array.isArray(state.queue.keys)) state.queue = emptyQueue();
  if (!state.offerIndex || typeof state.offerIndex !== 'object' || Array.isArray(state.offerIndex)) state.offerIndex = {};
  let searchController = null;
  let queueController = null;
  let queueLoopActive = false;
  let consecutiveLoadFailures = 0;
  const QUEUE_DELAY_MS = 50;
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 0;
  const RECOVERY_FAILURE_THRESHOLD = 3;
  const RECOVERY_DELAY_MS = 60000;
  const RECOVERY_HEALTH_RETRY_MS = 15000;
  const save = () => localStorage.setItem(config.storageKey, JSON.stringify(state));
  const numericMoney = (value,{allowZero=false}={}) => {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return allowZero ? (number >= 0 ? number : null) : (number > 0 ? number : null);
  };
  const money = value => { const number=numericMoney(value,{allowZero:true}); return number==null?'—':`${number.toFixed(2).replace('.',',')} €`; };
  const item = key => catalog.find(x => x.key === key);
  const color = s => s==='console'?'red':s==='arcade'?'violet':'blue';
  const sortItems = list => [...list].sort((a,b) => (seriesOrder[a.series] - seriesOrder[b.series]) || (a.number - b.number));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

  function canonicalOfferKey(offer){
    try {
      const url=new URL(offer.url);
      url.hash='';
      for(const key of [...url.searchParams.keys()]) if(/^utm_|ref$|tracking/i.test(key)) url.searchParams.delete(key);
      return `${String(offer.source||'unknown').toLowerCase()}|${url.origin}${url.pathname}${url.search}`;
    } catch { return `${String(offer.source||'unknown').toLowerCase()}|${String(offer.id||offer.url||'')}`; }
  }
  function isNewOffer(entry){
    if(!entry?.firstSeen) return false;
    if(!state.dealCenterSeenAt) return true;
    return new Date(entry.firstSeen).getTime() > new Date(state.dealCenterSeenAt).getTime();
  }
  function offerPrice(entry){ return numericMoney(entry?.price); }
  function offerShipping(entry){ return entry?.shippingKnown ? numericMoney(entry?.shipping,{allowZero:true}) : null; }
  function explicitOfferTotal(entry){ return numericMoney(entry?.total); }
  function offerTotal(entry){
    const explicit=explicitOfferTotal(entry);
    if(explicit!=null) return explicit;
    const price=offerPrice(entry), shipping=offerShipping(entry);
    if(price!=null && entry?.shippingKnown && shipping!=null) return Math.round((price+shipping)*100)/100;
    return price ?? Number.POSITIVE_INFINITY;
  }
  function normalizedTitleTokens(value){
    const ignored=new Set(['evercade','blaze','collection','cartridge','cartouche','the','and']);
    return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(token=>token.length>1&&!ignored.has(token));
  }
  function titleMatch(entry){
    const expected=normalizedTitleTokens(entry?.cartridgeTitle), actual=new Set(normalizedTitleTokens(entry?.title));
    if(!expected.length) return 0;
    return expected.filter(token=>actual.has(token)).length/expected.length;
  }
  function offerScore(entry,activeEntries){
    let score=0;
    const total=offerTotal(entry);
    if(Number.isFinite(total)) score+=25;
    if(entry?.shippingKnown) score+=15;
    if(entry?.active!==false) score+=10;
    if(/neu|ovp|new/i.test(String(entry?.condition||''))) score+=5;
    score+=Math.round(titleMatch(entry)*25);
    const same=(activeEntries||[]).filter(candidate=>candidate.cartridgeKey===entry.cartridgeKey).map(offerTotal).filter(Number.isFinite);
    if(same.length&&Number.isFinite(total)){
      const cheapest=Math.min(...same);
      if(total<=cheapest*1.05) score+=20;
      else if(total<=cheapest*1.15) score+=10;
    }
    return Math.max(0,Math.min(100,score));
  }

  function sanitizeOfferIndex(){
    let repaired=0,removed=0;
    for(const [key,entry] of Object.entries(state.offerIndex||{})){
      if(!entry||!entry.url){ delete state.offerIndex[key]; removed+=1; continue; }
      let price=offerPrice(entry);
      if(price==null){
        const search=state.searches?.[entry.cartridgeKey];
        const recovered=(search?.offers||[]).find(candidate=>canonicalOfferKey(candidate)===key);
        price=numericMoney(recovered?.price);
      }
      if(price==null){ delete state.offerIndex[key]; removed+=1; continue; }
      const shipping=entry.shippingKnown?numericMoney(entry.shipping,{allowZero:true}):null;
      let total=numericMoney(entry.total);
      if(total==null&&entry.shippingKnown&&shipping!=null) total=Math.round((price+shipping)*100)/100;
      const changed=entry.price!==price||entry.shipping!==shipping||entry.total!==total;
      entry.price=price;
      entry.shipping=shipping;
      entry.total=total;
      if(Array.isArray(entry.priceHistory)) entry.priceHistory=entry.priceHistory.map(point=>({
        ...point,
        price:numericMoney(point?.price),
        total:numericMoney(point?.total)
      })).filter(point=>point.price!=null);
      if(changed) repaired+=1;
    }
    if(repaired||removed){ save(); log('info','deals.index.sanitized',{repaired,removed,indexed:Object.keys(state.offerIndex).length,reason:'null_zero_price_bug_cleanup'}); }
  }

  function updateOfferIndex(cartridge,result){
    const checkedAt=result.checkedAt || new Date().toISOString();
    const offers=result.automatic || [];
    const priorKeys=Object.keys(state.offerIndex).filter(k=>state.offerIndex[k]?.cartridgeKey===cartridge.key);
    priorKeys.forEach(k=>{ state.offerIndex[k].active=false; state.offerIndex[k].inactiveAt=checkedAt; });
    let added=0,updated=0,reactivated=0,rejected=0;
    for(const offer of offers){
      const price=numericMoney(offer.price);
      if(price==null){ rejected+=1; log('warn','deals.offer.rejected',{cartridge:cartridge.key,source:offer.source||null,title:offer.title||null,reason:'missing_positive_price'}); continue; }
      const key=canonicalOfferKey(offer);
      const previous=state.offerIndex[key];
      const shipping=offer.shippingKnown?numericMoney(offer.shipping,{allowZero:true}):null;
      const explicit=numericMoney(offer.total);
      const total=explicit ?? (offer.shippingKnown&&shipping!=null?Math.round((price+shipping)*100)/100:null);
      const history=Array.isArray(previous?.priceHistory)?[...previous.priceHistory]:[];
      const lastHistory=history.at(-1);
      if(!lastHistory || lastHistory.price!==price || lastHistory.total!==total) history.push({at:checkedAt,price,total});
      if(history.length>12) history.splice(0,history.length-12);
      if(!previous) added+=1; else { updated+=1; if(previous.active===false) reactivated+=1; }
      state.offerIndex[key]={
        ...(previous||{}), key, cartridgeKey:cartridge.key, cartridgeTitle:cartridge.title, cartridgeSeries:cartridge.series, cartridgeNumber:cartridge.number,
        id:offer.id||previous?.id||key, source:offer.source||previous?.source||'Unbekannt', title:offer.title||previous?.title||cartridge.title,
        price, shipping, total,
        shippingKnown:Boolean(offer.shippingKnown), location:offer.location||'', condition:offer.condition||'Unbekannt', sellerType:offer.sellerType||'Unbekannt',
        url:offer.url, firstSeen:previous?.firstSeen||checkedAt, lastSeen:checkedAt, inactiveAt:null, active:true, priceHistory:history
      };
    }
    state.searches[cartridge.key]={checkedAt,offers:offers.slice(0,20),status:result.status};
    save();
    log('info','deals.index.updated',{cartridge:cartridge.key,checkedAt,offers:offers.length,added,updated,reactivated,rejected,inactivated:Math.max(0,priorKeys.length-offers.length),indexed:Object.keys(state.offerIndex).length});
  }

  function migrateLegacyOffers(){
    if(Object.keys(state.offerIndex).length) return;
    for(const [cartridgeKey,search] of Object.entries(state.searches||{})){
      const cartridge=item(cartridgeKey); if(!cartridge) continue;
      const checkedAt=search?.checkedAt||new Date().toISOString();
      for(const offer of search?.offers||[]){
        const price=numericMoney(offer.price); if(price==null) continue;
        const shipping=offer.shippingKnown?numericMoney(offer.shipping,{allowZero:true}):null;
        const explicit=numericMoney(offer.total);
        const total=explicit ?? (offer.shippingKnown&&shipping!=null?Math.round((price+shipping)*100)/100:null);
        const key=canonicalOfferKey(offer);
        state.offerIndex[key]={key,cartridgeKey,cartridgeTitle:cartridge.title,cartridgeSeries:cartridge.series,cartridgeNumber:cartridge.number,id:offer.id||key,source:offer.source||'Unbekannt',title:offer.title||cartridge.title,price,shipping,total,shippingKnown:Boolean(offer.shippingKnown),location:offer.location||'',condition:offer.condition||'Unbekannt',sellerType:offer.sellerType||'Unbekannt',url:offer.url,firstSeen:checkedAt,lastSeen:checkedAt,inactiveAt:null,active:true,priceHistory:[{at:checkedAt,price,total}]};
      }
    }
    save();
  }

  async function applyVersion(){
    try { const r=await fetch(`${config.versionFile}?t=${Date.now()}`,{cache:'no-store'}); const v=await r.json(); $$('.version').forEach(n=>n.textContent=v.displayVersion||v.version); }
    catch { $$('.version').forEach(n=>n.textContent='—'); }
  }
  function stats(){
    const owned=state.owned.length, missing=catalog.length-owned;
    $('#ownedStat').textContent=`${owned} / ${catalog.length}`; $('#missingStat').textContent=missing;
    $('#wishStat').textContent=state.wishlist.length;
    const total=state.owned.reduce((s,k)=>s+(Number(state.prices[k])||0),0); $('#valueStat').textContent=money(total);
    const pct=Math.round(owned/catalog.length*100); $('#progressPct').textContent=`${pct}%`; $('#progressBar').style.width=`${pct}%`;
  }
  function card(x, context){
    const owned=state.owned.includes(x.key), price=state.prices[x.key];
    return `<article class="card ${color(x.series)}"><div class="card-main"><div><span class="eyebrow">${seriesLabel[x.series]} · #${String(x.number).padStart(2,'0')}</span><h3>${escapeHtml(x.title)}</h3><p>${owned?'In Sammlung':'Nicht im Bestand'}${price?` · ${money(price)}`:''}</p></div><div class="card-actions">${context!=='owned'?`<button data-own="${x.key}">${owned?'Entfernen':'Hinzufügen'}</button>`:''}<button data-deal="${x.key}">Treffer</button><button data-detail="${x.key}">Details</button></div></div></article>`;
  }
  function renderCollection(){ $('#collectionList').innerHTML=sortItems(catalog.filter(x=>state.owned.includes(x.key))).map(x=>card(x,'owned')).join('')||'<p class="empty">Noch keine Cartridges erfasst.</p>'; }
  function renderCatalog(){
    const q=$('#catalogSearch').value.toLowerCase(); const filter=$('#seriesFilter').value;
    const rows=catalog.filter(x=>(!q||x.title.toLowerCase().includes(q)||String(x.number).includes(q))&&(filter==='all'||x.series===filter));
    $('#catalogCount').textContent=`${rows.length} Treffer`; $('#catalogList').innerHTML=sortItems(rows).map(x=>card(x,'catalog')).join('');
  }
  function renderMissing(){ const el=$('#missingList'); if(el) el.innerHTML=''; const c=$('#missingCount'); if(c)c.textContent=''; }
  function renderWishlist(){ const el=$('#wishlistList'); if(el) el.innerHTML=''; }
  function populateDealSelect(){
    const select=$('#dealCartridge'); if(!select||select.options.length) return;
    select.innerHTML=sortItems(catalog).map(x=>`<option value="${x.key}">${seriesLabel[x.series]} #${String(x.number).padStart(2,'0')} · ${escapeHtml(x.title)}</option>`).join('');
  }
  function syncSourceFilter(entries){
    const select=$('#dealFilterSource'); if(!select)return;
    const current=select.value||'all';
    const sources=[...new Set(entries.map(e=>e.source).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
    select.innerHTML='<option value="all">Alle Quellen</option>'+sources.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if(current==='all'||sources.includes(current))select.value=current;
  }
  function renderDealCenter(){
    const all=Object.values(state.offerIndex||{}).filter(e=>e?.url&&offerPrice(e)!=null);
    syncSourceFilter(all);
    const active=all.filter(e=>e.active!==false);
    const fresh=active.filter(isNewOffer);
    const cartridges=new Set(active.map(e=>e.cartridgeKey));
    const best=active.map(offerTotal).filter(Number.isFinite).sort((a,b)=>a-b)[0];
    $('#dealActiveCount').textContent=active.length;
    $('#dealNewCount').textContent=fresh.length;
    $('#dealCartridgeCount').textContent=cartridges.size;
    $('#dealBestPrice').textContent=Number.isFinite(best)?money(best):'—';
    const status=$('#dealFilterStatus')?.value||'active';
    const ownership=$('#dealFilterOwnership')?.value||'all';
    const source=$('#dealFilterSource')?.value||'all';
    const maxRaw=Number($('#dealMaxPrice')?.value); const max=Number.isFinite(maxRaw)&&maxRaw>0?maxRaw:null;
    const sort=$('#dealSort')?.value||'best';
    let rows=all.filter(e=>status==='all'||(status==='active'&&e.active!==false)||(status==='new'&&e.active!==false&&isNewOffer(e)));
    if(ownership==='owned') rows=rows.filter(e=>state.owned.includes(e.cartridgeKey));
    if(ownership==='missing') rows=rows.filter(e=>!state.owned.includes(e.cartridgeKey));
    if(source!=='all')rows=rows.filter(e=>e.source===source);
    if(max!=null)rows=rows.filter(e=>offerTotal(e)<=max);
    rows.sort((a,b)=>{
      if(sort==='newest')return new Date(b.firstSeen)-new Date(a.firstSeen);
      if(sort==='cartridge')return String(a.cartridgeTitle).localeCompare(String(b.cartridgeTitle),'de')||offerTotal(a)-offerTotal(b);
      if(sort==='price')return offerTotal(a)-offerTotal(b)||String(a.cartridgeTitle).localeCompare(String(b.cartridgeTitle),'de');
      return offerScore(b,active)-offerScore(a,active)||offerTotal(a)-offerTotal(b)||String(a.cartridgeTitle).localeCompare(String(b.cartridgeTitle),'de');
    });
    $('#dealCenterMeta').textContent=`${rows.length} angezeigt · ${active.length} aktiv · ${fresh.length} neu · ${all.length} historisch gespeichert`;
    $('#dealStatusBadge').textContent=active.length?`${active.length} aktiv`:'Keine Treffer';
    $('#automaticDeals').innerHTML=rows.length?rows.map(e=>{
      const total=explicitOfferTotal(e);
      const price=offerPrice(e);
      const calculated=e.shippingKnown?offerTotal(e):null;
      const displayPrice=total!=null?money(total):(calculated!=null&&e.shippingKnown?money(calculated):`${money(price)} · Versand unbekannt`);
      const history=e.priceHistory||[]; const prev=history.length>1?history[history.length-2]:null;
      const previousTotal=numericMoney(prev?.total), currentTotal=explicitOfferTotal(e);
      const delta=previousTotal!=null&&currentTotal!=null?currentTotal-previousTotal:null;
      const change=delta==null?'':delta<0?` · ↓ ${money(Math.abs(delta))}`:delta>0?` · ↑ ${money(delta)}`:' · Preis unverändert';
      const score=offerScore(e,active);
      return `<article class="card"><div class="card-main"><div><span class="eyebrow">${escapeHtml(e.cartridgeTitle)}</span><h3>${escapeHtml(e.title)}</h3><div class="deal-card-meta"><span class="deal-tag">${escapeHtml(e.source)}</span>${score>=75?'<span class="deal-tag top">Top-Angebot</span>':''}${isNewOffer(e)?'<span class="deal-tag new">Neu</span>':''}${e.active===false?'<span class="deal-tag stale">Nicht mehr bestätigt</span>':''}${state.owned.includes(e.cartridgeKey)?'<span class="deal-tag">In Sammlung</span>':'<span class="deal-tag">Fehlt</span>'}${e.location?`<span class="deal-tag">${escapeHtml(e.location)}</span>`:''}</div><div class="deal-price">${displayPrice}</div><div class="deal-history">Erstmals ${new Date(e.firstSeen).toLocaleString('de-DE')} · zuletzt ${new Date(e.lastSeen).toLocaleString('de-DE')}${change}</div></div><div class="card-actions"><a class="button" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">Angebot öffnen</a></div></div></article>`;
    }).join(''):'<p class="empty">Für diese Filter sind keine Angebote vorhanden.</p>';
  }
  function renderDealResult(result,cartridge){
    updateOfferIndex(cartridge,result);
    const offers=result.automatic||[];
    $('#dealStatus').textContent=`${cartridge.title}: ${offers.length} Treffer · geprüft ${new Date(result.checkedAt).toLocaleString('de-DE')}`;
    $('#directSources').innerHTML=result.direct.map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join('');
    renderDealCenter();
  }
  async function runDealSearch(key=$('#dealCartridge').value){
    const cartridge=item(key); if(!cartridge||!searchClient)return;
    if(searchController) searchController.abort(); searchController=new AbortController();
    $('#dealCartridge').value=key; showView('deals'); $('#dealStatusBadge').textContent='Läuft'; $('#dealStatus').textContent=`Suche nach ${cartridge.title} …`;
    try { const result=await searchClient.search(cartridge,{signal:searchController.signal}); renderDealResult(result,cartridge); }
    catch(error){ if(error.name==='AbortError')return; $('#dealStatusBadge').textContent='Fehler'; $('#dealStatus').textContent=error.message; }
  }

  function queueOrder(){ return sortItems(catalog.filter(x=>!state.owned.includes(x.key))); }
  function createQueue(){
    const ordered=queueOrder(); consecutiveLoadFailures=0;
    state.queue={status:'paused',keys:ordered.map(x=>x.key),index:0,done:0,offers:0,errors:0,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),current:null}; save();
    log('info','queue.created',{total:ordered.length,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS,recoveryFailureThreshold:RECOVERY_FAILURE_THRESHOLD,recoveryDelayMs:RECOVERY_DELAY_MS}); renderQueue();
  }
  function renderQueue(){
    const q=state.queue,total=q.keys.length,processed=Math.min(q.index,total),pct=total?Math.round(processed/total*100):0,current=q.current?item(q.current):null;
    $('#queueProgressText').textContent=`${processed} / ${total}`; $('#queuePct').textContent=`${pct}%`; $('#queueProgressBar').style.width=`${pct}%`;
    $('#queueRemaining').textContent=Math.max(0,total-processed); $('#queueDone').textContent=q.done||0; $('#queueOffers').textContent=q.offers||0; $('#queueErrors').textContent=q.errors||0;
    $('#queueStatusBadge').textContent=q.status==='running'?'Läuft':q.status==='paused'?'Pausiert':q.status==='complete'?'Fertig':'Bereit';
    $('#queueCurrent').textContent=current?`Aktuell: ${current.title}`:q.status==='complete'?'Suchlauf abgeschlossen':'Noch nicht gestartet';
    const upcoming=q.keys.slice(q.index,q.index+8).map(item).filter(Boolean);
    $('#queuePreview').innerHTML=upcoming.length?upcoming.map((x,i)=>`<article class="queue-row"><span>${i===0&&q.status==='running'?'Jetzt':'Danach'}</span><strong>${escapeHtml(x.title)}</strong><small>${seriesLabel[x.series]} #${String(x.number).padStart(2,'0')}</small></article>`).join(''):'<p class="empty">Keine offenen Einträge in der Warteschlange.</p>';
    $('#queueStart').disabled=q.status==='running'; $('#queuePause').disabled=q.status!=='running'; $('#queueResume').disabled=!(q.status==='paused'&&q.index<total);
  }
  async function timedQueuePause(eventPrefix,delayMs,details){ const started=performance.now(); log('info',`${eventPrefix}.start`,{...details,delayMs}); await sleep(delayMs); log('info',`${eventPrefix}.end`,{...details,delayMs,actualDelayMs:Math.round(performance.now()-started)}); }
  async function queueDelay(cartridge,index,total){ return timedQueuePause('queue.delay',QUEUE_DELAY_MS,{key:cartridge.key,title:cartridge.title,index,total,reason:'paid_worker_pacing'}); }
  async function workerHealthCheck(){
    const requestId=globalThis.crypto?.randomUUID?.()||`recovery-${Date.now()}`,started=performance.now();
    try{ const response=await fetch(`${config.genericParserWorkerUrl}/health?t=${Date.now()}`,{cache:'no-store',mode:'cors',credentials:'omit',headers:{accept:'application/json','x-generic-parser-contract':config.genericParserContract,'x-request-id':requestId}}); const ok=response.ok; log(ok?'info':'warn','queue.recovery.health',{ok,status:response.status,durationMs:Math.round(performance.now()-started),requestId}); return ok; }
    catch(error){ log('warn','queue.recovery.health',{ok:false,status:null,durationMs:Math.round(performance.now()-started),requestId,errorName:error?.name||null,message:error?.message||String(error)}); return false; }
  }
  async function recoveryPause(index,total){
    log('warn','queue.recovery.triggered',{index,total,consecutiveLoadFailures,threshold:RECOVERY_FAILURE_THRESHOLD,initialDelayMs:RECOVERY_DELAY_MS,reason:'three_load_failed_requests'});
    await timedQueuePause('queue.recovery.pause',RECOVERY_DELAY_MS,{index,total,reason:'worker_recovery'}); let attempt=0;
    while(state.queue.status==='running'){ attempt+=1; if(await workerHealthCheck()){ log('info','queue.recovery.complete',{index,total,attempts:attempt,consecutiveLoadFailuresBeforeReset:consecutiveLoadFailures}); consecutiveLoadFailures=0; return true; } log('warn','queue.recovery.wait',{index,total,attempt,retryInMs:RECOVERY_HEALTH_RETRY_MS}); await sleep(RECOVERY_HEALTH_RETRY_MS); }
    return false;
  }
  async function queueLoop(){
    if(queueLoopActive||state.queue.status!=='running')return; queueLoopActive=true;
    try{
      while(state.queue.status==='running'&&state.queue.index<state.queue.keys.length){
        const key=state.queue.keys[state.queue.index],cartridge=item(key);
        if(!cartridge||state.owned.includes(key)){ state.queue.index+=1; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); continue; }
        state.queue.current=key; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); log('info','queue.item.start',{index:state.queue.index+1,total:state.queue.keys.length,key,title:cartridge.title,consecutiveLoadFailures}); queueController=new AbortController();
        try{
          const result=await searchClient.search(cartridge,{signal:queueController.signal}); if(state.queue.status!=='running')break;
          const offers=result.automatic||[]; updateOfferIndex(cartridge,result); state.queue.offers+=offers.length; state.queue.done+=1; consecutiveLoadFailures=0; log('info','queue.item.complete',{key,title:cartridge.title,offers:offers.length,index:state.queue.index+1,total:state.queue.keys.length});
        }catch(error){
          if(error?.name==='AbortError'){ log('info','queue.item.aborted',{key,title:cartridge.title}); break; }
          const loadFailures=(String(error?.message||'').match(/Load failed/g)||[]).length; consecutiveLoadFailures=loadFailures?consecutiveLoadFailures+loadFailures:0; state.queue.errors+=1; state.queue.done+=1; log('error','queue.item.error',{key,title:cartridge.title,message:error.message,loadFailuresInError:loadFailures,consecutiveLoadFailures});
        }
        state.queue.index+=1; state.queue.current=null; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); renderDealCenter();
        if(state.queue.status!=='running'||state.queue.index>=state.queue.keys.length)continue;
        if(consecutiveLoadFailures>=RECOVERY_FAILURE_THRESHOLD){ if(!await recoveryPause(state.queue.index,state.queue.keys.length))break; }
        if(state.queue.status==='running')await queueDelay(cartridge,state.queue.index,state.queue.keys.length);
      }
      if(state.queue.status==='running'&&state.queue.index>=state.queue.keys.length){ state.queue.status='complete'; state.queue.current=null; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); renderDealCenter(); log('info','queue.complete',{total:state.queue.keys.length,done:state.queue.done,offers:state.queue.offers,errors:state.queue.errors,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS,recoveryFailureThreshold:RECOVERY_FAILURE_THRESHOLD,recoveryDelayMs:RECOVERY_DELAY_MS,indexedOffers:Object.keys(state.offerIndex).length}); }
    }finally{ queueLoopActive=false; queueController=null; }
  }
  function startQueue(){ if(!searchClient){log('error','queue.start.failed',{reason:'search client unavailable'});return;} createQueue(); state.queue.status='running'; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); log('info','queue.started',{total:state.queue.keys.length,interCartridgeDelayMs:QUEUE_DELAY_MS}); queueLoop(); }
  function pauseQueue(){ if(state.queue.status!=='running')return; state.queue.status='paused'; state.queue.updatedAt=new Date().toISOString(); save(); queueController?.abort(); renderQueue(); log('info','queue.paused',{index:state.queue.index,total:state.queue.keys.length}); }
  function resumeQueue(){ if(state.queue.status!=='paused'||state.queue.index>=state.queue.keys.length)return; state.queue.status='running'; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); log('info','queue.resumed',{index:state.queue.index,total:state.queue.keys.length,interCartridgeDelayMs:QUEUE_DELAY_MS}); queueLoop(); }
  function resetQueue(){ queueController?.abort(); consecutiveLoadFailures=0; state.queue=emptyQueue(); save(); renderQueue(); log('info','queue.reset'); }
  function restoreQueue(){ if(state.queue.status==='running'){ state.queue.status='paused'; state.queue.current=null; state.queue.updatedAt=new Date().toISOString(); save(); log('info','queue.restored',{index:state.queue.index,total:state.queue.keys.length}); setTimeout(resumeQueue,800); } renderQueue(); }

  function showView(name){ $$('.view').forEach(v=>v.hidden=v.id!==`${name}View`); $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name)); if(name==='deals')renderDealCenter(); }
  function renderAll(){ stats(); renderCollection(); renderCatalog(); renderMissing(); renderWishlist(); populateDealSelect(); renderQueue(); renderDealCenter(); }
  function toggleOwned(key){ state.owned=state.owned.includes(key)?state.owned.filter(k=>k!==key):[...state.owned,key]; save(); renderAll(); }
  function openDetail(key){ const x=item(key);if(!x)return;$('#detailTitle').textContent=x.title;$('#detailMeta').textContent=`${seriesLabel[x.series]} · #${String(x.number).padStart(2,'0')}`;$('#detailOwned').checked=state.owned.includes(key);$('#detailWish').checked=false;$('#detailPrice').value=state.prices[key]??'';$('#detailNotes').value=state.notes[key]??'';$('#detailDialog').dataset.key=key;$('#detailDialog').showModal(); }
  function bind(){
    document.addEventListener('click',e=>{ const b=e.target.closest('button');if(!b)return;if(b.dataset.own)toggleOwned(b.dataset.own);if(b.dataset.detail)openDetail(b.dataset.detail);if(b.dataset.deal){ $('#dealCartridge').value=b.dataset.deal; showView('deals'); const x=item(b.dataset.deal); if(x)$('#directSources').innerHTML=searchClient.directSearches(x).map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join(''); }if(b.dataset.view)showView(b.dataset.view); });
    $('#catalogSearch').addEventListener('input',renderCatalog); $('#seriesFilter').addEventListener('change',renderCatalog); $('#runDealSearch').addEventListener('click',()=>runDealSearch());
    $('#queueStart').addEventListener('click',startQueue); $('#queuePause').addEventListener('click',pauseQueue); $('#queueResume').addEventListener('click',resumeQueue); $('#queueReset').addEventListener('click',resetQueue);
    for(const id of ['dealFilterStatus','dealFilterOwnership','dealFilterSource','dealMaxPrice','dealSort']) $(`#${id}`).addEventListener(id==='dealMaxPrice'?'input':'change',renderDealCenter);
    $('#markDealsSeen').addEventListener('click',()=>{ state.dealCenterSeenAt=new Date().toISOString(); save(); renderDealCenter(); log('info','deals.marked.seen',{at:state.dealCenterSeenAt}); });
    $('#dealCartridge').addEventListener('change',()=>{ const x=item($('#dealCartridge').value);if(x)$('#directSources').innerHTML=searchClient.directSearches(x).map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join(''); });
    $('#detailForm').addEventListener('submit',e=>{e.preventDefault();const key=$('#detailDialog').dataset.key;state.owned=$('#detailOwned').checked?[...new Set([...state.owned,key])]:state.owned.filter(k=>k!==key);const p=parseFloat($('#detailPrice').value);if(Number.isFinite(p))state.prices[key]=p;else delete state.prices[key];state.notes[key]=$('#detailNotes').value.trim();save();$('#detailDialog').close();renderAll();});
    $('#exportData').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='evercade-next-backup.json';a.click();URL.revokeObjectURL(a.href);});
    $('#importData').addEventListener('change',async e=>{try{state={...state,...JSON.parse(await e.target.files[0].text())};if(!state.queue)state.queue=emptyQueue();if(!state.offerIndex)state.offerIndex={};sanitizeOfferIndex();save();renderAll();}catch{alert('Die Datei konnte nicht importiert werden.');}});
  }
  migrateLegacyOffers(); sanitizeOfferIndex(); applyVersion(); bind(); renderAll(); restoreQueue();
  const initial=item($('#dealCartridge').value); if(initial) $('#dealCartridge').dispatchEvent(new Event('change'));
})();

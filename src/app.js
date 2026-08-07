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
  let state = { owned: defaultOwned, wishlist: [], prices: {}, notes: {}, searches: {}, queue: emptyQueue(), ...load() };
  if (!state.queue || !Array.isArray(state.queue.keys)) state.queue = emptyQueue();
  let searchController = null;
  let queueController = null;
  let queueLoopActive = false;
  let consecutiveLoadFailures = 0;
  const QUEUE_DELAY_MS = 200;
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 0;
  const RECOVERY_FAILURE_THRESHOLD = 3;
  const RECOVERY_DELAY_MS = 60000;
  const RECOVERY_HEALTH_RETRY_MS = 15000;
  const save = () => localStorage.setItem(config.storageKey, JSON.stringify(state));
  const money = v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2).replace('.',',')} €` : '—';
  const item = key => catalog.find(x => x.key === key);
  const color = s => s==='console'?'red':s==='arcade'?'violet':'blue';
  const sortItems = list => [...list].sort((a,b) => (seriesOrder[a.series] - seriesOrder[b.series]) || (a.number - b.number));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

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
    const owned=state.owned.includes(x.key), wished=state.wishlist.includes(x.key), price=state.prices[x.key];
    return `<article class="card ${color(x.series)}"><div class="card-main"><div><span class="eyebrow">${seriesLabel[x.series]} · #${String(x.number).padStart(2,'0')}</span><h3>${escapeHtml(x.title)}</h3><p>${owned?'In Sammlung':wished?'Auf Wunschliste':'Fehlend'}${price?` · ${money(price)}`:''}</p></div><div class="card-actions">${context!=='owned'?`<button data-own="${x.key}">${owned?'Entfernen':'Hinzufügen'}</button>`:''}<button data-wish="${x.key}">${wished?'Wunsch entfernen':'Wünschen'}</button><button data-deal="${x.key}">Deals</button><button data-detail="${x.key}">Details</button></div></div></article>`;
  }
  function renderCollection(){ $('#collectionList').innerHTML=sortItems(catalog.filter(x=>state.owned.includes(x.key))).map(x=>card(x,'owned')).join('')||'<p class="empty">Noch keine Cartridges erfasst.</p>'; }
  function renderCatalog(){
    const q=$('#catalogSearch').value.toLowerCase(); const filter=$('#seriesFilter').value;
    const rows=catalog.filter(x=>(!q||x.title.toLowerCase().includes(q)||String(x.number).includes(q))&&(filter==='all'||x.series===filter));
    $('#catalogCount').textContent=`${rows.length} Treffer`; $('#catalogList').innerHTML=sortItems(rows).map(x=>card(x,'catalog')).join('');
  }
  function renderMissing(){ const rows=sortItems(catalog.filter(x=>!state.owned.includes(x.key))); $('#missingCount').textContent=`${rows.length} fehlend`; $('#missingList').innerHTML=rows.map(x=>card(x,'missing')).join(''); }
  function renderWishlist(){ const rows=sortItems(catalog.filter(x=>state.wishlist.includes(x.key))); $('#wishlistList').innerHTML=rows.map(x=>card(x,'wishlist')).join('')||'<p class="empty">Die Wunschliste ist leer.</p>'; }
  function populateDealSelect(){
    const select=$('#dealCartridge');
    if(select.options.length) return;
    select.innerHTML=sortItems(catalog).map(x=>`<option value="${x.key}">${seriesLabel[x.series]} #${String(x.number).padStart(2,'0')} · ${escapeHtml(x.title)}</option>`).join('');
  }
  function renderDealResult(result, cartridge){
    const offers=result.automatic||[];
    $('#dealStatusBadge').textContent=offers.length?`${offers.length} Treffer`:'Keine Treffer';
    $('#dealStatus').textContent=`Geprüft: ${new Date(result.checkedAt).toLocaleString('de-DE')} · ${result.status.map(s=>`${s.name}: ${s.status==='ok'?`${s.count} Treffer`:'Fehler'}`).join(' · ')}`;
    $('#automaticDeals').innerHTML=offers.length?offers.map(offer=>`<article class="card"><div class="card-main"><div><span class="eyebrow">${escapeHtml(offer.source)}</span><h3>${escapeHtml(offer.title)}</h3><p>${offer.total!=null?`Gesamt ${money(offer.total)}`:`Preis ${money(offer.price)} · Versand unbekannt`}${offer.location?` · ${escapeHtml(offer.location)}`:''}</p></div><div class="card-actions"><a class="button" href="${escapeHtml(offer.url)}" target="_blank" rel="noopener noreferrer">Angebot öffnen</a></div></div></article>`).join(''):'<p class="empty">Der automatische Parser hat keine verwertbaren Angebote geliefert.</p>';
    $('#directSources').innerHTML=result.direct.map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join('');
    state.searches[cartridge.key]={checkedAt:result.checkedAt,offers:offers.slice(0,20),status:result.status}; save();
  }
  async function runDealSearch(key=$('#dealCartridge').value){
    const cartridge=item(key); if(!cartridge||!searchClient)return;
    if(searchController) searchController.abort();
    searchController=new AbortController();
    $('#dealCartridge').value=key; showView('deals');
    $('#dealStatusBadge').textContent='Läuft'; $('#dealStatus').textContent=`Suche nach ${cartridge.title} …`; $('#automaticDeals').innerHTML='';
    try { const result=await searchClient.search(cartridge,{signal:searchController.signal}); renderDealResult(result,cartridge); }
    catch(error){ if(error.name==='AbortError')return; $('#dealStatusBadge').textContent='Fehler'; $('#dealStatus').textContent=error.message; }
  }

  function queueOrder(){
    const missing=catalog.filter(x=>!state.owned.includes(x.key));
    const wished=new Set(state.wishlist);
    return [...missing].sort((a,b)=>{
      const wp=(wished.has(a.key)?0:1)-(wished.has(b.key)?0:1);
      return wp || (seriesOrder[a.series]-seriesOrder[b.series]) || (a.number-b.number);
    });
  }
  function createQueue(){
    const ordered=queueOrder();
    consecutiveLoadFailures=0;
    state.queue={status:'paused',keys:ordered.map(x=>x.key),index:0,done:0,offers:0,errors:0,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),current:null};
    save();
    log('info','queue.created',{total:ordered.length,wishlistFirst:state.wishlist.filter(k=>ordered.some(x=>x.key===k)).length,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS,recoveryFailureThreshold:RECOVERY_FAILURE_THRESHOLD,recoveryDelayMs:RECOVERY_DELAY_MS});
    renderQueue();
  }
  function renderQueue(){
    const q=state.queue;
    const total=q.keys.length;
    const processed=Math.min(q.index,total);
    const pct=total?Math.round(processed/total*100):0;
    const current=q.current?item(q.current):null;
    $('#queueProgressText').textContent=`${processed} / ${total}`;
    $('#queuePct').textContent=`${pct}%`;
    $('#queueProgressBar').style.width=`${pct}%`;
    $('#queueRemaining').textContent=Math.max(0,total-processed);
    $('#queueDone').textContent=q.done||0;
    $('#queueOffers').textContent=q.offers||0;
    $('#queueErrors').textContent=q.errors||0;
    $('#queueStatusBadge').textContent=q.status==='running'?'Läuft':q.status==='paused'?'Pausiert':q.status==='complete'?'Fertig':'Bereit';
    $('#queueCurrent').textContent=current?`Aktuell: ${current.title}`:q.status==='complete'?'Suchlauf abgeschlossen':'Noch nicht gestartet';
    const upcoming=q.keys.slice(q.index,q.index+8).map(item).filter(Boolean);
    $('#queuePreview').innerHTML=upcoming.length?upcoming.map((x,i)=>`<article class="queue-row"><span>${i===0&&q.status==='running'?'Jetzt':'Danach'}</span><strong>${escapeHtml(x.title)}</strong><small>${seriesLabel[x.series]} #${String(x.number).padStart(2,'0')}${state.wishlist.includes(x.key)?' · Wunschliste':''}</small></article>`).join(''):'<p class="empty">Keine offenen Einträge in der Warteschlange.</p>';
    $('#queueStart').disabled=q.status==='running';
    $('#queuePause').disabled=q.status!=='running';
    $('#queueResume').disabled=!(q.status==='paused'&&q.index<total);
  }
  async function timedQueuePause(eventPrefix, delayMs, details){
    const started=performance.now();
    log('info',`${eventPrefix}.start`,{...details,delayMs});
    await sleep(delayMs);
    log('info',`${eventPrefix}.end`,{...details,delayMs,actualDelayMs:Math.round(performance.now()-started)});
  }
  async function queueDelay(cartridge,index,total){
    return timedQueuePause('queue.delay',QUEUE_DELAY_MS,{key:cartridge.key,title:cartridge.title,index,total,reason:'paid_worker_pacing'});
  }
  async function workerHealthCheck(){
    const requestId=globalThis.crypto?.randomUUID?.() || `recovery-${Date.now()}`;
    const started=performance.now();
    try{
      const response=await fetch(`${config.genericParserWorkerUrl}/health?t=${Date.now()}`,{cache:'no-store',mode:'cors',credentials:'omit',headers:{accept:'application/json','x-generic-parser-contract':config.genericParserContract,'x-request-id':requestId}});
      const ok=response.ok;
      log(ok?'info':'warn','queue.recovery.health',{ok,status:response.status,durationMs:Math.round(performance.now()-started),requestId});
      return ok;
    }catch(error){
      log('warn','queue.recovery.health',{ok:false,status:null,durationMs:Math.round(performance.now()-started),requestId,errorName:error?.name||null,message:error?.message||String(error)});
      return false;
    }
  }
  async function recoveryPause(index,total){
    log('warn','queue.recovery.triggered',{index,total,consecutiveLoadFailures,threshold:RECOVERY_FAILURE_THRESHOLD,initialDelayMs:RECOVERY_DELAY_MS,reason:'three_load_failed_requests'});
    await timedQueuePause('queue.recovery.pause',RECOVERY_DELAY_MS,{index,total,reason:'worker_recovery'});
    let attempt=0;
    while(state.queue.status==='running'){
      attempt+=1;
      const healthy=await workerHealthCheck();
      if(healthy){
        log('info','queue.recovery.complete',{index,total,attempts:attempt,consecutiveLoadFailuresBeforeReset:consecutiveLoadFailures});
        consecutiveLoadFailures=0;
        return true;
      }
      log('warn','queue.recovery.wait',{index,total,attempt,retryInMs:RECOVERY_HEALTH_RETRY_MS});
      await sleep(RECOVERY_HEALTH_RETRY_MS);
    }
    return false;
  }
  async function queueLoop(){
    if(queueLoopActive || state.queue.status!=='running') return;
    queueLoopActive=true;
    try {
      while(state.queue.status==='running' && state.queue.index<state.queue.keys.length){
        const key=state.queue.keys[state.queue.index];
        const cartridge=item(key);
        if(!cartridge || state.owned.includes(key)){
          state.queue.index+=1; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue(); continue;
        }
        state.queue.current=key; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue();
        log('info','queue.item.start',{index:state.queue.index+1,total:state.queue.keys.length,key,title:cartridge.title,consecutiveLoadFailures});
        queueController=new AbortController();
        try{
          const result=await searchClient.search(cartridge,{signal:queueController.signal});
          if(state.queue.status!=='running') break;
          const offers=result.automatic||[];
          state.searches[key]={checkedAt:result.checkedAt,offers:offers.slice(0,20),status:result.status};
          state.queue.offers+=offers.length;
          state.queue.done+=1;
          consecutiveLoadFailures=0;
          log('info','queue.item.complete',{key,title:cartridge.title,offers:offers.length,index:state.queue.index+1,total:state.queue.keys.length});
        }catch(error){
          if(error?.name==='AbortError'){
            log('info','queue.item.aborted',{key,title:cartridge.title});
            break;
          }
          const loadFailures=(String(error?.message||'').match(/Load failed/g)||[]).length;
          consecutiveLoadFailures=loadFailures?consecutiveLoadFailures+loadFailures:0;
          state.queue.errors+=1;
          state.queue.done+=1;
          log('error','queue.item.error',{key,title:cartridge.title,message:error.message,loadFailuresInError:loadFailures,consecutiveLoadFailures});
        }
        state.queue.index+=1;
        state.queue.current=null;
        state.queue.updatedAt=new Date().toISOString();
        save(); renderQueue();
        if(state.queue.status!=='running' || state.queue.index>=state.queue.keys.length) continue;
        if(consecutiveLoadFailures>=RECOVERY_FAILURE_THRESHOLD){
          const recovered=await recoveryPause(state.queue.index,state.queue.keys.length);
          if(!recovered) break;
        }
        if(state.queue.status==='running'){
          await queueDelay(cartridge,state.queue.index,state.queue.keys.length);
        }
      }
      if(state.queue.status==='running' && state.queue.index>=state.queue.keys.length){
        state.queue.status='complete'; state.queue.current=null; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue();
        log('info','queue.complete',{total:state.queue.keys.length,done:state.queue.done,offers:state.queue.offers,errors:state.queue.errors,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS,recoveryFailureThreshold:RECOVERY_FAILURE_THRESHOLD,recoveryDelayMs:RECOVERY_DELAY_MS});
      }
    } finally { queueLoopActive=false; queueController=null; }
  }
  function startQueue(){
    if(!searchClient){ log('error','queue.start.failed',{reason:'search client unavailable'}); return; }
    createQueue();
    state.queue.status='running'; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue();
    log('info','queue.started',{total:state.queue.keys.length,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS,recoveryFailureThreshold:RECOVERY_FAILURE_THRESHOLD,recoveryDelayMs:RECOVERY_DELAY_MS});
    queueLoop();
  }
  function pauseQueue(){
    if(state.queue.status!=='running') return;
    state.queue.status='paused'; state.queue.updatedAt=new Date().toISOString(); save();
    queueController?.abort(); renderQueue();
    log('info','queue.paused',{index:state.queue.index,total:state.queue.keys.length});
  }
  function resumeQueue(){
    if(state.queue.status!=='paused' || state.queue.index>=state.queue.keys.length) return;
    state.queue.status='running'; state.queue.updatedAt=new Date().toISOString(); save(); renderQueue();
    log('info','queue.resumed',{index:state.queue.index,total:state.queue.keys.length,interCartridgeDelayMs:QUEUE_DELAY_MS,batchSize:BATCH_SIZE,batchDelayMs:BATCH_DELAY_MS});
    queueLoop();
  }
  function resetQueue(){
    queueController?.abort(); consecutiveLoadFailures=0; state.queue=emptyQueue(); save(); renderQueue(); log('info','queue.reset');
  }
  function restoreQueue(){
    if(state.queue.status==='running'){
      state.queue.status='paused'; state.queue.current=null; state.queue.updatedAt=new Date().toISOString(); save();
      log('info','queue.restored',{index:state.queue.index,total:state.queue.keys.length});
      setTimeout(resumeQueue,800);
    }
    renderQueue();
  }

  function showView(name){ $$('.view').forEach(v=>v.hidden=v.id!==`${name}View`); $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name)); }
  function renderAll(){ stats(); renderCollection(); renderCatalog(); renderMissing(); renderWishlist(); populateDealSelect(); renderQueue(); }
  function toggleOwned(key){ state.owned=state.owned.includes(key)?state.owned.filter(k=>k!==key):[...state.owned,key]; save(); renderAll(); }
  function toggleWish(key){ state.wishlist=state.wishlist.includes(key)?state.wishlist.filter(k=>k!==key):[...state.wishlist,key]; save(); renderAll(); }
  function openDetail(key){
    const x=item(key); if(!x)return; $('#detailTitle').textContent=x.title; $('#detailMeta').textContent=`${seriesLabel[x.series]} · #${String(x.number).padStart(2,'0')}`;
    $('#detailOwned').checked=state.owned.includes(key); $('#detailWish').checked=state.wishlist.includes(key); $('#detailPrice').value=state.prices[key]??''; $('#detailNotes').value=state.notes[key]??''; $('#detailDialog').dataset.key=key; $('#detailDialog').showModal();
  }
  function bind(){
    document.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return; if(b.dataset.own)toggleOwned(b.dataset.own); if(b.dataset.wish)toggleWish(b.dataset.wish); if(b.dataset.detail)openDetail(b.dataset.detail); if(b.dataset.deal)runDealSearch(b.dataset.deal); if(b.dataset.view)showView(b.dataset.view); });
    $('#catalogSearch').addEventListener('input',renderCatalog); $('#seriesFilter').addEventListener('change',renderCatalog); $('#runDealSearch').addEventListener('click',()=>runDealSearch());
    $('#queueStart').addEventListener('click',startQueue); $('#queuePause').addEventListener('click',pauseQueue); $('#queueResume').addEventListener('click',resumeQueue); $('#queueReset').addEventListener('click',resetQueue);
    $('#dealCartridge').addEventListener('change',()=>{ const x=item($('#dealCartridge').value); if(x) $('#directSources').innerHTML=searchClient.directSearches(x).map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join(''); });
    $('#detailForm').addEventListener('submit',e=>{e.preventDefault(); const key=$('#detailDialog').dataset.key; state.owned=$('#detailOwned').checked?[...new Set([...state.owned,key])]:state.owned.filter(k=>k!==key); state.wishlist=$('#detailWish').checked?[...new Set([...state.wishlist,key])]:state.wishlist.filter(k=>k!==key); const p=parseFloat($('#detailPrice').value); if(Number.isFinite(p))state.prices[key]=p; else delete state.prices[key]; state.notes[key]=$('#detailNotes').value.trim(); save(); $('#detailDialog').close(); renderAll();});
    $('#exportData').addEventListener('click',()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); a.download='evercade-next-backup.json'; a.click(); URL.revokeObjectURL(a.href); });
    $('#importData').addEventListener('change',async e=>{ try{ state={...state,...JSON.parse(await e.target.files[0].text())}; if(!state.queue)state.queue=emptyQueue(); save(); renderAll(); }catch{ alert('Die Datei konnte nicht importiert werden.'); } });
  }
  applyVersion(); bind(); renderAll(); restoreQueue();
  const initial=item($('#dealCartridge').value); if(initial) $('#dealCartridge').dispatchEvent(new Event('change'));
})();
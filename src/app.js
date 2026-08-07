(() => {
  'use strict';
  const catalog = window.EVERCADE_CATALOG || [];
  const config = window.EVERCADE_CONFIG;
  const searchClient = window.EvercadeSearch;
  const defaultOwned = ['console-31','console-34','console-37','console-40','console-48','arcade-1','computer-8'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const seriesLabel = {console:'Console',arcade:'Arcade',computer:'Home Computer'};
  const seriesOrder = {console:0,arcade:1,computer:2};
  const load = () => { try { return JSON.parse(localStorage.getItem(config.storageKey)) || {}; } catch { return {}; } };
  let state = { owned: defaultOwned, wishlist: [], prices: {}, notes: {}, searches: {}, ...load() };
  let searchController = null;
  const save = () => localStorage.setItem(config.storageKey, JSON.stringify(state));
  const money = v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2).replace('.',',')} €` : '—';
  const item = key => catalog.find(x => x.key === key);
  const color = s => s==='console'?'red':s==='arcade'?'violet':'blue';
  const sortItems = list => [...list].sort((a,b) => (seriesOrder[a.series] - seriesOrder[b.series]) || (a.number - b.number));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

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
  function showView(name){ $$('.view').forEach(v=>v.hidden=v.id!==`${name}View`); $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name)); }
  function renderAll(){ stats(); renderCollection(); renderCatalog(); renderMissing(); renderWishlist(); populateDealSelect(); }
  function toggleOwned(key){ state.owned=state.owned.includes(key)?state.owned.filter(k=>k!==key):[...state.owned,key]; save(); renderAll(); }
  function toggleWish(key){ state.wishlist=state.wishlist.includes(key)?state.wishlist.filter(k=>k!==key):[...state.wishlist,key]; save(); renderAll(); }
  function openDetail(key){
    const x=item(key); if(!x)return; $('#detailTitle').textContent=x.title; $('#detailMeta').textContent=`${seriesLabel[x.series]} · #${String(x.number).padStart(2,'0')}`;
    $('#detailOwned').checked=state.owned.includes(key); $('#detailWish').checked=state.wishlist.includes(key); $('#detailPrice').value=state.prices[key]??''; $('#detailNotes').value=state.notes[key]??''; $('#detailDialog').dataset.key=key; $('#detailDialog').showModal();
  }
  function bind(){
    document.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return; if(b.dataset.own)toggleOwned(b.dataset.own); if(b.dataset.wish)toggleWish(b.dataset.wish); if(b.dataset.detail)openDetail(b.dataset.detail); if(b.dataset.deal)runDealSearch(b.dataset.deal); if(b.dataset.view)showView(b.dataset.view); });
    $('#catalogSearch').addEventListener('input',renderCatalog); $('#seriesFilter').addEventListener('change',renderCatalog); $('#runDealSearch').addEventListener('click',()=>runDealSearch());
    $('#dealCartridge').addEventListener('change',()=>{ const x=item($('#dealCartridge').value); if(x) $('#directSources').innerHTML=searchClient.directSearches(x).map(source=>`<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}<span>↗</span></a>`).join(''); });
    $('#detailForm').addEventListener('submit',e=>{e.preventDefault(); const key=$('#detailDialog').dataset.key; state.owned=$('#detailOwned').checked?[...new Set([...state.owned,key])]:state.owned.filter(k=>k!==key); state.wishlist=$('#detailWish').checked?[...new Set([...state.wishlist,key])]:state.wishlist.filter(k=>k!==key); const p=parseFloat($('#detailPrice').value); if(Number.isFinite(p))state.prices[key]=p; else delete state.prices[key]; state.notes[key]=$('#detailNotes').value.trim(); save(); $('#detailDialog').close(); renderAll();});
    $('#exportData').addEventListener('click',()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); a.download='evercade-next-backup.json'; a.click(); URL.revokeObjectURL(a.href); });
    $('#importData').addEventListener('change',async e=>{ try{ state={...state,...JSON.parse(await e.target.files[0].text())}; save(); renderAll(); }catch{ alert('Die Datei konnte nicht importiert werden.'); } });
  }
  applyVersion(); bind(); renderAll();
  const initial=item($('#dealCartridge').value); if(initial) $('#dealCartridge').dispatchEvent(new Event('change'));
})();

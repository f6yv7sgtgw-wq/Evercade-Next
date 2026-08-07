window.EVERCADE_CONFIG = Object.freeze({
  versionFile: 'VERSION.json',
  storageKey: 'project-evercade-next-v1',
  pagesUrl: 'https://f6yv7sgtgw-wq.github.io/Evercade-Next/',
  genericParserWorkerUrl: 'https://genericparser.f6yv7sgtgw.workers.dev',
  genericParserContract: 'generic-parser-module-v1',
  genericParserExpectedVersion: '0.45.2',
  genericParserExpectedBuild: 'gp-0452-20260807-6',
  genericParserSearchPaths: Object.freeze(['/api/module/search','/api/search','/search']),
  genericParserDiagnosticPaths: Object.freeze({health:'/health',version:'/version',diagnostics:'/diagnostics'}),
  genericParserEndpointTests: Object.freeze([
    Object.freeze({id:'get-health',label:'GET /health',method:'GET',path:'/health',kind:'diagnostic'}),
    Object.freeze({id:'get-version',label:'GET /version',method:'GET',path:'/version',kind:'diagnostic'}),
    Object.freeze({id:'get-diagnostics',label:'GET /diagnostics',method:'GET',path:'/diagnostics',kind:'diagnostic'}),
    Object.freeze({id:'options-module-search',label:'OPTIONS /api/module/search',method:'OPTIONS',path:'/api/module/search',kind:'cors'}),
    Object.freeze({id:'post-search',label:'POST /search',method:'POST',path:'/search',kind:'search'}),
    Object.freeze({id:'post-api-search',label:'POST /api/search',method:'POST',path:'/api/search',kind:'search'}),
    Object.freeze({id:'post-module-search',label:'POST /api/module/search',method:'POST',path:'/api/module/search',kind:'search'})
  ]),
  genericParserCorsHeaders: Object.freeze(['access-control-allow-origin','access-control-allow-methods','access-control-allow-headers']),
  dealApiUrl: 'https://project-evercade-deal-api.jnldc.chatgpt.site',
  automatedSources: Object.freeze([
    Object.freeze({name:'Kleinanzeigen',kind:'parser'}),
    Object.freeze({name:'eBay Deutschland',kind:'retailer'}),
    Object.freeze({name:'Amazon Deutschland',kind:'retailer'}),
    Object.freeze({name:'Google Shopping',kind:'retailer'}),
    Object.freeze({name:'Idealo',kind:'retailer'}),
    Object.freeze({name:'Kaufland',kind:'retailer'}),
    Object.freeze({name:'Retroplace',kind:'retailer'}),
    Object.freeze({name:'DragonBox',kind:'retailer'}),
    Object.freeze({name:'ASC-Shop',kind:'retailer'}),
    Object.freeze({name:'Funstock',kind:'retailer'})
  ]),
  directSources: Object.freeze([
    {name:'eBay Deutschland',url:'https://www.ebay.de/sch/i.html?_nkw={query}'},
    {name:'Kleinanzeigen',url:'https://www.kleinanzeigen.de/s-{query}/k0'},
    {name:'Amazon Deutschland',url:'https://www.amazon.de/s?k={query}'},
    {name:'Google Shopping',url:'https://www.google.com/search?tbm=shop&q={query}'},
    {name:'Idealo',url:'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q={query}'},
    {name:'Kaufland',url:'https://www.kaufland.de/s/?search_value={query}'},
    {name:'Retroplace',url:'https://www.retroplace.com/de/suche?q={query}'},
    {name:'DragonBox',url:'https://dragonbox.de/de/suche?sSearch={query}'},
    {name:'ASC-Shop',url:'https://www.asc-shop.de/shop/action/modul/side/27/action3/psearch/psearch/show2/modul/10/suchstring/{query}'},
    {name:'Funstock',url:'https://funstock.co.uk/search?type=product&q={query}'}
  ])
});

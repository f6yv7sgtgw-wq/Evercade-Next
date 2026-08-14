(() => {
  'use strict';
  // 1.6-UI-Schicht: hochwertigere Optik (Verläufe, Hairlines, Glow) und
  // iPhone-PWA-Feinschliff (Safe-Areas, Tap-Targets, Bottom-Sheet-Dialog).
  // Lädt nach ui-1.5.js und überschreibt dessen injizierte Regeln gezielt.
  const style = document.createElement('style');
  style.id = 'evercade-v160-ui';
  style.textContent = `
:root{--bg:#07090d;--panel:#141926;--panel2:#151b28;--line:rgba(255,255,255,.07);--text:#f4f6fa;--muted:#a7b0c0;--red:#e6203a;--red-soft:#ff4d63}
html{-webkit-text-size-adjust:100%}
body{background:radial-gradient(1200px 620px at 50% -220px,rgba(230,32,58,.15),transparent 60%),radial-gradient(900px 520px at 100% 0,rgba(32,132,244,.06),transparent 55%),#07090d;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}
button,.button{-webkit-tap-highlight-color:transparent}
.topbar{background:linear-gradient(180deg,rgba(14,17,25,.94),rgba(8,10,15,.88));backdrop-filter:blur(18px) saturate(1.35);border-bottom:1px solid var(--line);padding-top:calc(18px + env(safe-area-inset-top))}
.topbar h1{letter-spacing:-.02em;background:linear-gradient(180deg,#fff,#c9d0dd);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.version-pill,.badge{border:1px solid var(--line);background:rgba(255,255,255,.05);border-radius:999px;color:#d7dde8}
.tabs{background:transparent!important;border-bottom:0!important;padding-top:12px!important;padding-bottom:6px!important}
.tabs button{background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:12px;color:#c3cad6;font-weight:650;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .08s ease}
.tabs button:active{transform:scale(.97)}
.tabs .active{background:linear-gradient(165deg,#ff4056,#d90f2c)!important;border-color:rgba(255,255,255,.16)!important;color:#fff;box-shadow:0 6px 18px rgba(230,32,58,.35),inset 0 1px 0 rgba(255,255,255,.22)}
.stats article,.panel{background:linear-gradient(165deg,#141a27,#0d111a 55%,#0b0e16);border:1px solid var(--line);border-radius:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 14px 34px rgba(0,0,0,.38)}
.stats strong,.progress-panel>strong,.queue-metrics strong,.deal-center-grid strong,.deal-price{font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.eyebrow{color:#ff6d80}
.card{background:linear-gradient(160deg,#171d2b,#111623);border:1px solid var(--line);border-radius:14px;box-shadow:0 6px 16px rgba(0,0,0,.24)}
.card:before{width:4px;border-radius:0 4px 4px 0;background:linear-gradient(180deg,var(--red-soft),var(--red))}
button,.button,.tabs button{border-radius:12px}
button,.button{border-color:rgba(255,255,255,.09);background:linear-gradient(180deg,#232b3a,#1a212e);transition:border-color .15s ease,background .15s ease,transform .08s ease}
button:active,.button:active{transform:translateY(1px)}
.primary,.tabs .active{border-color:rgba(255,255,255,.16)}
.primary{background:linear-gradient(165deg,#ff4056,#d90f2c)!important;box-shadow:0 6px 18px rgba(230,32,58,.32),inset 0 1px 0 rgba(255,255,255,.22)}
input,select,textarea,.filters input,.filters select,.deal-controls select,.deal-filter-grid input,.deal-filter-grid select,dialog input,dialog textarea{background:rgba(9,12,18,.82)!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--red-soft)!important;box-shadow:0 0 0 3px rgba(230,32,58,.22)}
input::placeholder{color:#6e7889}
.progress-track{background:rgba(255,255,255,.07)}
.progress-track div{background:linear-gradient(90deg,#ff5a6e,#e6203a);box-shadow:0 0 12px rgba(230,32,58,.45)}
.deal-tag{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
.deal-center-grid article,.queue-metrics article,.queue-progress,.queue-row,.health-card,.log-entry,.endpoint-card{background:linear-gradient(160deg,#151b28,#10141f);border:1px solid var(--line);border-radius:14px}
.source-link{background:linear-gradient(160deg,#161c29,#111623);border:1px solid var(--line);border-radius:14px;transition:border-color .15s ease,transform .12s ease}
.source-link:hover{border-color:rgba(255,255,255,.22);background:linear-gradient(160deg,#1b2231,#141a26);transform:translateY(-1px)}
.cartridge-cover,.v150-cover{border-color:rgba(255,255,255,.09)!important;box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.05)!important}
dialog{border:1px solid rgba(255,255,255,.1);border-radius:20px;background:linear-gradient(170deg,#161c2a,#101521);box-shadow:0 24px 60px rgba(0,0,0,.55)}
dialog::backdrop{background:rgba(4,6,10,.62);backdrop-filter:blur(6px)}
@media(max-width:720px){
  main{padding:12px 12px calc(26px + env(safe-area-inset-bottom))!important}
  .topbar{padding:calc(14px + env(safe-area-inset-top)) 14px 12px!important}
  input,select,textarea{font-size:16px!important}
  .tabs button,.card-actions button,.card-actions .button,.queue-actions button{min-height:42px}
  dialog{margin:auto auto 0;width:100vw;max-width:100%;border-radius:22px 22px 0 0;border-bottom:0}
  dialog form{padding:20px 20px calc(20px + env(safe-area-inset-bottom))}
}
@media(display-mode:standalone){
  .topbar{position:sticky!important;top:0!important}
}
`;
  document.head.appendChild(style);
  window.EVERCADE_UI_160 = Object.freeze({ version: '1.6.0', layer: 'premium-mobile-pwa' });
})();

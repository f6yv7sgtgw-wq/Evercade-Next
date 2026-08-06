# Project Evercade Next 1.0.0

Kompletter Neuaufbau des Evercade-Sammlungsmanagers ohne Altlasten aus dem früheren Repository.

## Phase 1 – Fundament

- `VERSION.json` ist die einzige Release-Versionsquelle.
- `src/config.js` enthält zentrale Laufzeit- und Servicekonfiguration.
- Ein einziger Workflow validiert und veröffentlicht GitHub Pages.
- Keine alten Hotfix-, Runtime- oder Parallel-Deployment-Dateien.
- `.nojekyll` verhindert unerwartete Jekyll-Verarbeitung.
- `scripts/validate.mjs` prüft Struktur, Katalogumfang, Assets und alte Versionsliterale.

## Phase 2 – Kernfunktionen

- vollständiger Katalog mit 87 Cartridges
- Sammlung mit sieben übernommenen Ausgangseinträgen
- fehlende Cartridges
- Wunschliste
- Such- und Reihenfilter
- Kaufpreis und Notizen je Cartridge
- Sammlungsfortschritt und Kaufwert
- JSON-Export und -Import
- responsive Oberfläche für iPhone und Desktop

## Entwicklung

```bash
node --check src/config.js
node --check src/catalog.js
node --check src/app.js
node scripts/validate.mjs
```

## Veröffentlichung

Der kanonische Workflow `.github/workflows/pages.yml` veröffentlicht ausschließlich den geprüften Stand von `main` als GitHub-Pages-Artefakt.

Geplante URL: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/`

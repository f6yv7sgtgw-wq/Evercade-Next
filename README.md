# Project Evercade Next 1.1.0

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

## Phase 3 – Angebotsquellen

- GenericParser-Client gemäß `generic-parser-module-v1`
- automatische Kleinanzeigen-Suche je Cartridge
- tolerante Normalisierung verschiedener Parser-Antwortformate
- Sortierung nach bekanntem Gesamtpreis
- Direktsuchen für eBay, Kleinanzeigen, Amazon, Google Shopping, Idealo, Kaufland, Retroplace und DragonBox
- Deal-Schaltfläche direkt an jeder Cartridge
- Speicherung der letzten Suchergebnisse im lokalen Anwendungszustand
- Syntax- und Integrationsprüfung des Parser-Clients vor jedem Deployment

## Entwicklung

```bash
node --check src/config.js
node --check src/catalog.js
node --check src/parser-client.js
node --check src/app.js
node scripts/validate.mjs
```

## Veröffentlichung

Der kanonische Workflow `.github/workflows/pages.yml` veröffentlicht ausschließlich den geprüften Stand von `main` als GitHub-Pages-Artefakt.

GitHub Pages ist auf **GitHub Actions** als Veröffentlichungsquelle eingestellt.

URL: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/`

# Project Evercade Next 1.4.0

Kompletter Neuaufbau des Evercade-Sammlungsmanagers ohne Altlasten aus dem früheren Repository.

## Phase 1 – Fundament

- `VERSION.json` ist die einzige Release-Versionsquelle.
- `src/config.js` enthält zentrale Laufzeit- und Servicekonfiguration.
- Ein einziger Workflow validiert und veröffentlicht GitHub Pages.
- Keine alten Hotfix-, Runtime- oder Parallel-Deployment-Dateien.
- `.nojekyll` verhindert unerwartete Jekyll-Verarbeitung.

## Phase 2 – Kernfunktionen

- vollständiger Katalog mit 87 Cartridges
- Sammlung, fehlende Cartridges und Wunschliste
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
- Speicherung der letzten Suchergebnisse

## Phase 4 – Diagnose und Release-Sicherheit

- persistentes Browser-Eventlog mit maximal 500 Einträgen
- Erfassung von Seitenaufrufen, Sichtbarkeitswechseln, JavaScript-Fehlern und unbehandelten Promises
- Protokollierung von Parser-Anfragen, Antworten, Laufzeiten und Fehlern
- eigene Seite `debug.html` für Log, Export und Systemdiagnose
- Live-Prüfung von Version, Konfiguration, Katalog, Parser-Vertrag und Browser-Speicher
- erweiterte Repository-Konsistenzprüfung
- Syntaxprüfung sämtlicher JavaScript-Dateien
- öffentlicher Smoke-Test nach jedem Deployment

## Phase 5.1 – Suchengine für alle fehlenden Cartridges

- Ansicht `Vollsuche`
- Warteschlange ausschließlich aus nicht vorhandenen Cartridges
- Wunschlisten-Einträge zuerst
- danach deterministische Reihenfolge nach Serie und Katalognummer
- Start, Pause, Fortsetzen und Zurücksetzen
- persistenter Fortschritt und per-Cartridge-Suchergebnisse
- Eventlog für jeden Queue-Schritt

## Phase 5.2 – GenericParser-Endpunktdiagnose

Die Vollsuche zeigte, dass der Browser den konfigurierten GenericParser-Worker derzeit nicht zuverlässig erreicht. Phase 5.2 macht diese Schnittstelle deshalb direkt aus der ausgelieferten GitHub-Pages-Anwendung messbar.

Auf `debug.html` stehen vier Einzeltests und ein Gesamttest bereit:

- `GET /search`
- `POST /search`
- `POST /api/search`
- `POST /api/module/search`

Jeder Test zeigt:

- vollständigen Ziel-Endpunkt
- HTTP-Status, falls eine Antwort im Browser ankommt
- Fetch-/Load-Fehler, falls keine auswertbare Browserantwort ankommt
- Response-Type
- lesbare Response-Header
- Antwortinhalt bis 6000 Zeichen
- Laufzeit
- kurze Diagnose zur Unterscheidung von HTTP-/Routing-Problemen und Browser/CORS-/Preflight-Problemen

Alle Testergebnisse werden zusätzlich im Eventlog als `endpoint.test.*` protokolliert. Die Testmatrix liegt zentral in `src/config.js`; `scripts/validate.mjs` und der Pages-Workflow prüfen die Phase-5.2-Dateien vor jedem Deployment.

Die eigentliche Multi-Quellen-Automatik wird erst auf dem durch Phase 5.2 bestätigten funktionierenden Parser-Endpunkt aufgebaut, damit fehlgeschlagene Requests nicht erneut als echte Nulltreffer gewertet werden.

## Entwicklung

```bash
node --check src/config.js
node --check src/catalog.js
node --check src/eventlog.js
node --check src/debug.js
node --check src/endpoint-test.js
node --check src/parser-client.js
node --check src/app.js
node --check scripts/smoke.mjs
node scripts/validate.mjs
```

## Veröffentlichung

Der einzige Workflow `.github/workflows/pages.yml` validiert, veröffentlicht und überprüft den Stand von `main` über GitHub Actions Pages.

Anwendung: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/`

Diagnose und Phase-5.2-Endpunkttests: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/debug.html`

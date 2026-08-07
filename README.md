# Project Evercade Next 4.5.1

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

Die bisherige Browserdiagnose machte Routing-, Fetch- und CORS-Probleme sichtbar. Diese Basis bleibt in 4.5.1 erhalten und wird erweitert.

## Release 4.5.1 – GenericParser 0.45.1 Infrastruktur

4.5.1 ist ein Stabilitäts- und Infrastruktur-Release. Suchalgorithmen, Matching, Ranking und Preisbewertung werden nicht verändert. Ziel ist eine dauerhaft nachvollziehbare Browserkommunikation mit dem GenericParser-Worker.

### Zentrale API-Konfiguration

Evercade Next kennt zentral folgende GenericParser-Endpunkte:

- `GET /health`
- `GET /version`
- `GET /diagnostics`
- `POST /search`
- `POST /api/search`
- `POST /api/module/search`

Der Suchclient behält die bisherige Fallback-Reihenfolge `/api/module/search` → `/api/search` → `/search`. Der Modulvertrag bleibt `generic-parser-module-v1`.

### CORS und Preflight-Diagnose

`debug.html` prüft zusätzlich `OPTIONS /api/module/search`. Die Diagnose zeigt relevante `Access-Control-Allow-*`-Header und bewertet, ob `Access-Control-Allow-Origin` den Evercade-Origin oder `*` erlaubt. POST-Aufrufe senden weiterhin den Modulvertrag und zusätzlich eine eindeutige Request-ID.

### Request-Logging

Für Parser-Aufrufe protokolliert der Browser soweit clientseitig verfügbar:

- Request-ID
- Timestamp
- Route
- Methode
- Origin
- User-Agent
- Laufzeit
- HTTP-Status
- Trefferzahl
- Fehlertext und Stacktrace bei Clientfehlern
- Worker-Request-ID bzw. Cloudflare-Ray-ID, sofern in der Antwort sichtbar

Serverseitige Stacktraces können nur vom Worker selbst geliefert werden; Evercade erfindet oder rekonstruiert sie nicht.

### Diagnose

Die Diagnose prüft automatisch:

- lokale Release-Version
- zentrale Konfiguration
- Katalog
- Modulvertrag
- Worker Health
- Worker Version
- Worker Diagnostics
- Browser-Speicher
- Routing und Suchendpunkte über die Endpunktmatrix
- CORS/OPTIONS-Verhalten
- Antwortzeiten

### Deployment-Qualität

Vor jedem GitHub-Pages-Deploy laufen Syntax- und Repository-Validierungen. Nach dem Deploy prüft der bestehende Smoke-Test die veröffentlichte Version und die Diagnose-Seite. Die Browser-Endpunktmatrix bildet den End-to-End-Test gegen den konfigurierten GenericParser-Worker.

### Nicht Bestandteil von 4.5.1

- keine neuen Suchquellen
- keine Multi-Quellen-Suche
- keine Rankingänderungen
- keine Preisbewertungsänderungen
- keine Änderung am Modulvertrag

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

Diagnose und 4.5.1-Endpunkttests: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/debug.html`

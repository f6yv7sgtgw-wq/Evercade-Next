# Project Evercade Next 1.3.0

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

- neue Ansicht `Vollsuche`
- erzeugt eine Warteschlange ausschließlich aus nicht vorhandenen Cartridges
- Wunschlisten-Einträge werden zuerst verarbeitet
- danach deterministische Reihenfolge nach Serie und Katalognummer
- Suche läuft Cartridge für Cartridge über den bestehenden automatischen Suchclient
- Fortschritt, aktueller Eintrag, Treffer und Fehler werden live angezeigt
- Start, Pause, Fortsetzen und Zurücksetzen
- Warteschlange, Fortschritt und Ergebnisse werden in `localStorage` gespeichert
- ein während eines Browser-Neustarts laufender Suchlauf wird automatisch wieder aufgenommen
- bereits abgeschlossene Einträge werden beim Fortsetzen nicht erneut verarbeitet
- jeder Queue-Schritt wird im Eventlog protokolliert

Phase 5.1 stellt die Suchwarteschlange bereit. Die Erweiterung auf die vollständige Multi-Quellen-Automatik folgt in Phase 5.2.

## Entwicklung

```bash
node --check src/config.js
node --check src/catalog.js
node --check src/eventlog.js
node --check src/debug.js
node --check src/parser-client.js
node --check src/app.js
node --check scripts/smoke.mjs
node scripts/validate.mjs
```

## Veröffentlichung

Der einzige Workflow `.github/workflows/pages.yml` validiert, veröffentlicht und überprüft den Stand von `main` über GitHub Actions Pages.

Anwendung: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/`

Diagnose: `https://f6yv7sgtgw-wq.github.io/Evercade-Next/debug.html`

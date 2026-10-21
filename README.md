# Schattendepot

Lernende Börsen-**Simulation** mit fiktivem Geld zu Informations- und Lernzwecken.
**Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.**
Keine echten Orders, keine Anbindung an ein echtes Depot.

App: https://pennyboberde-source.github.io/schattendepot/ (auf dem iPad in Safari → Teilen → Zum Home-Bildschirm)

## Aufbau

| Baustein | Technik | Aufgabe |
|---|---|---|
| App | PWA: Vite + Preact + TypeScript, GitHub Pages | Übersicht, Briefing, Order-Details, Lernen, Quellenstatus, Einstellungen, Push-Anmeldung |
| Datensammler | GitHub Actions (`sammler.yml`), reiner Code | Quellen abfragen, Signale vereinheitlichen und bewerten, Lagebild bauen, Kandidaten mitverfolgen |
| Gehirn | Claude-Code-Routinen (Pro-Abo, kein API-Schlüssel) | Morgenlauf (Orders vormerken, Briefing), Abendlauf (Berichte, Lektionen), Ereignislauf, Wochenrückblick |
| Kurswächter | GitHub Actions (`waechter.yml`, alle 15 Min.), reiner Code | Vormerkungen ausführen, Ziel/Stop/Termin/Knock-out prüfen, Pushes, Kalender, Ereignislauf auslösen |
| Übernahme | GitHub Actions (`uebernahme.yml`) | Claude-Ergebnisse gegen Schema prüfen und übernehmen |
| Daten | JSON im Branch `daten` | Ereignisprotokoll (nur anhängen), daraus abgeleitet: Positionen, Statistik, Lagebilder … |
| Push | Web Push (VAPID) aus Actions | Mitteilungen aufs iPad |

**Leitprinzip:** Alles, was Code kann, macht Code (Kurse, Gebühren, Steuern, Ausführung, Statistik, Gewichte – alles getestet). Claude urteilt nur.

### Datenfluss an einem Handelstag

```
06:27  Datensammler  → lagebild/<datum>.md (≤ ~6.000 Tokens) + Tracking der Kandidaten
07:32  Morgenlauf    → Branch claude/lauf-<datum>-morgenlauf (laeufe/<datum>-morgenlauf.json)
       Übernahme     → prüft Schema, schreibt Vormerkungen ins Protokoll, ☀️ Briefing-Push
08:00–22:00 alle 15 Min. Kurswächter → kauft zum Briefkurs (nur mit Kurs NACH der Entscheidung),
       prüft Ziel/Stop/Termin/Knock-out, 🟢 ✅ 🔻 ⚡ Pushes, termine.ics, bei ±5 % → Ereignislauf
stündlich Datensammler → Nachrichten zu Positionen, starke Meldung → Ereignislauf (max. 1/Tag)
22:17  Abendlauf     → Abschlussberichte 📘, Lektionen, Gewichtsvorschläge
Sa     Datensammler (Gewichte anpassen) → Wochenrückblick 📊
```

### Branches

- `main` – Code, Konfiguration (`config/`), Routinen-Anweisungen (`routine/`), Schema (`schema/`).
- `daten` – Laufzeitdaten; schreiben nur die Actions (Concurrency-Gruppe `daten-schreiben`).
- `claude/lauf-<datum>-<typ>` – Ergebnis eines Routinen-Laufs; die Übernahme-Action prüft, übernimmt und löscht den Branch.

### Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `core/` | Reine, getestete Logik (Gebühren, Steuern, Spreads, Rendite, Kalender, Bewertung, Wächter, Signale, Statistik, Gewichte …) |
| `jobs/` | Action-Skripte (`waechter.ts`, `sammler.ts`, `uebernahme.ts`, `test-push.ts`, `trockenlauf.ts`), Kursanbieter (`kurse/`), Quellen (`quellen/`) |
| `config/` | Gebühren (Consorsbank-Standardpreis), Steuern, Spreads, Einstellungen, Signal-Gewichte, Universum, Push |
| `routine/` | Anweisungen für die vier Claude-Läufe + `kontext.mjs` (kompakter Kontext) + `pruefen.mjs` (Schema-Prüfung) |
| `src/` | PWA (Ansichten in `src/views/`, Service Worker `src/sw.ts`) |
| `demo/daten/` | Demo-Daten für Entwicklung und E2E-Tests (werden nie deployt) |
| `vorlage/daten/` | Startinhalt des `daten`-Branches |

## Quellen-Katalog (Stand 21.10.2026, Budget 0 €)

| Quelle | Schlüssel | Gratis-Kontingent | Nutzung hier | Wofür |
|---|---|---|---|---|
| Finnhub | `FINNHUB_API_KEY` | 60 Abfragen/Min. | Kurse US (Wächter), Quartalszahlen, Nachrichten | Kurse, Termine, Überraschungen |
| Twelve Data | `TWELVEDATA_API_KEY` | 800/Tag, 8/Min., nur US + Forex | EUR/USD je Wächter-Lauf, Kurs-Fallback US | Wechselkurs |
| Financial Modeling Prep | `FMP_API_KEY` | ca. 250/Tag | Wächter ≤ 150, Sammler ≤ 80 | EU-Kurse (`.DE`), Gewinner/Verlierer, Quartalszahlen |
| Alpha Vantage | `ALPHAVANTAGE_API_KEY` | 25/Tag (geteilt mit dem claude.ai-Konnektor!) | Wächter ≤ 5, Sammler ≤ 2 | Notfall-Kurse, Nachrichten-Stimmung, Meistgehandelte |
| Kraken | – | großzügig | Krypto-Kurse mit echtem Geld/Brief | Krypto-ETNs, Krypto-Lage |
| Frankfurter (EZB) | – | – | EUR/USD-Fallback (täglich) | Wechselkurs |
| FRED | `FRED_API_KEY` (optional) | großzügig | 1–4/Tag | VIX, US-Rendite, EUR/USD, Brent |
| OpenInsider | – | – | 2/Tag | Insider-Cluster-Käufe (US, aus SEC Form 4) |
| ApeWisdom | – | – | 1/Tag | Reddit-Erwähnungen (Stimmung, geringes Gewicht) |
| tagesschau, Handelsblatt, FAZ, CNBC, MarketWatch (RSS) | – | – | je 1 pro Lauf | Schlagzeilen → Signale über Stichworte |
| GDELT | – | zurückhaltend nutzen | je offene Position/Lauf | Nachrichten zu Positionen |

Bewusst **nicht** genutzt: Yahoo Finance (Nutzungsbedingungen verbieten automatisierten Abruf), Google-News-RSS (per robots.txt gesperrt), Tradegate-JSON (per robots.txt gesperrt), EQS (sperrt KI-Bots). Vorschläge für später: BaFin-Datenbank Eigengeschäfte, Bundesanzeiger Leerverkäufe, SEC 8-K, Wikipedia-Seitenaufrufe, CoinGecko, OpenFIGI.

## Kosten und Limits

- **Laufende Kosten: 0 €** (öffentliches Repo → GitHub Actions und Pages kostenlos; alle Datenquellen im Gratis-Tarif).
- **Claude:** 3 Läufe Mo–Fr (Morgen, Abend, ggf. Ereignis) + 1 am Samstag über das Pro-Abo; jeder Lauf zählt aufs normale Nutzungslimit. Routinen lesen nur den kompakten Kontext (`routine/kontext.mjs`), höchstens 5 Websuchen pro Morgenlauf.
- **Routinen-Limits laut Doku (Okt. 2026):** Stundenlimits (API-Fires 30/h je Routine), Mindestintervall eines Zeitplans 1 h.
- **GitHub-Cron** startet oft einige Minuten verspätet; Kurse tragen immer Zeitstempel und Quelle.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (zeigt demo/daten oder _daten/)
npm test           # Unit-Tests (Vitest)
npm run build      # Produktions-Build nach dist/
npm run e2e        # Playwright: iPad hoch/quer, WebKit, iPhone
npm run demo       # Demo-Daten neu erzeugen
```

Workflows manuell starten (GitHub → Actions → Workflow → „Run workflow“ oder `gh workflow run <datei>`):
`trockenlauf.yml` (Wächter mit echten Kursen in einer Datenkopie), `test-push.yml`, `sammler.yml` (Eingabe `haupt`), `waechter.yml`.

## Fehler melden und beheben

In der App (Einstellungen oder Order-Detail) öffnet „Fehler melden“ ein vorbefülltes GitHub-Issue mit dem Label `fehler`.
Eine neue Claude-Sitzung arbeitet offene Issues ab (`gh issue list --label fehler`). Jeder Fix auf `main` wird automatisch
deployt; die App auf dem iPad aktualisiert sich beim nächsten Öffnen selbst.

## Fehlerbehebung

| Problem | Ursache / Lösung |
|---|---|
| Keine Mitteilungen | App vom Home-Bildschirm öffnen → Einstellungen → „Push neu verbinden“, neuen Code als Secret `PUSH_SUBSCRIPTION` speichern. iPad-Einstellungen → Mitteilungen → Schattendepot prüfen. |
| „Push-Anmeldung abgelaufen“ | Der Versand meldete 404/410 → wie oben neu verbinden. |
| Order wird nicht ausgeführt | Quellenstatus prüfen: Kurs nur nach der Entscheidung und in der Handelszeit (Tradegate 08–22 Uhr). US-Werte erst nach US-Eröffnung (15:30). Nach 26 h ohne Kurs wird die Vormerkung verworfen (Push). |
| Deutsche Aktien ohne Kurs | `FMP_API_KEY` fehlt oder FMP deckt das Symbol im Gratis-Tarif nicht ab (Quellenstatus → `system.json kursabrufe`). |
| „⚠️ Morgenlauf ausgefallen“ | Routine prüfen: claude.ai/code/routines → Läufe ansehen (GitHub-Verbindung? Nutzungslimit?). |
| Claude-Ergebnis „verletzt das Schema“ | Datei liegt unter `daten/laeufe/ungueltig/` mit Fehlertext; Anweisungen in `routine/` schärfen. |
| Quelle ausgefallen | Tab „Quellen“ zeigt letzten Fehler; der Rest läuft weiter. Kontingent erschöpft → am nächsten Tag automatisch wieder. |
| Workflows starten nicht | GitHub verarbeitet Pushes manchmal verzögert; Actions-Tab prüfen. Geplante Workflows werden nach 60 Tagen ohne Aktivität pausiert (hier durch die Daten-Commits ausgeschlossen). |

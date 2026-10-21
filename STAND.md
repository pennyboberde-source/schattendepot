# STAND – Schattendepot

_Zuletzt aktualisiert: 21.10.2026 (Sitzung 1)_

## Phase
**Meilenstein 1 – Grundgerüst** (läuft). Plan von Peer bestätigt (`PLAN.md`, inkl. `main`/`daten`-Branches).

## Erledigt
- Auftrag gelesen; `CLAUDE.md`, `PLAN.md`, `STAND.md` angelegt; Faktencheck (siehe unten).
- Git 2.55 (`C:\Program Files\Git`) und GitHub CLI 2.102 (winget, Benutzer) installiert. In neuen Shells ggf. PATH neu laden:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- Lokales Git-Repo `main` initialisiert (noch kein Commit, noch kein Remote). Git-Identität noch nicht gesetzt → nach Login die GitHub-noreply-Adresse verwenden (nicht die private Mail).
- Projekt-Gerüst: `package.json` (Versionen wie Feierabend + ajv, workbox), `tsconfig.json` (+ `tsconfig.sw.json` für den Service Worker), `vite.config.ts` (injectManifest, Dev-Server liefert `/daten/` aus `_daten/` bzw. `demo/daten/`), `.gitignore`, `.gitattributes`, `index.html`, Icons (aus `public/favicon.svg` per `npm run icons`).
- `config/`: `gebuehren.json` (Consorsbank inkl. Statusstufen/Freetrades), `steuern.json`, `spreads.json`, `einstellungen.json`.
- `core/` (getestet, 27 Unit-Tests grün): `geld.ts` (Rundung, de-Format), `gebuehren.ts`, `steuern.ts` (Verlustverrechnung Aktien/Sonstige, Vortrag, Teilfreistellung, KiSt, Pauschbetrag), `spreads.ts`, `rendite.ts` (Stückzahl, Kauf/Verkauf, Ergebnis, Zielkurs nach Gebühren per Bisektion), `typen.ts` (Datenmodell).
- App (`src/`): Tabs Übersicht, Briefing, Abgeschlossen, Lernen, Quellen, Einstellungen + Order-Detail; Pflichthinweis fix über der Tab-Leiste; Service Worker mit Push-Handler und NetworkFirst für `/daten/`; „Fehler melden“ (GitHub-Issue), „In Claude besprechen“ (claude.ai/new?q=…), „Auf GitHub ändern“ für `config/`, Kalender-Abo-Link, JSON-Export, lokale Anzeige-Option „nach Steuern“.
- `scripts/`: `demo-daten.ts` (Demo-Daten aus core berechnet), `daten-einbinden.mjs`, `gen-icons.mjs`.
- E2E (Playwright, 20 Tests grün): iPad hoch/quer, iPad WebKit, iPhone; prüft Tabs, Touch-Ziele ≥ 44 px, Pflichthinweis, Order-Detail, keine horizontale Scrollleiste, Manifest.
- `.github/workflows/deploy.yml`: Build aus `main` + Daten aus `daten`-Branch → Pages; `workflow_call`/`workflow_dispatch` für Datenläufe.
- `vorlage/daten/`: Startinhalt für den `daten`-Branch.
- Wünsche von Peer aufgenommen: leicht reparierbar (Fehler-melden-Issue, automatische Updates) und Erfolgschance im Kauf-Push (siehe PLAN.md).

## Offen / nächster Schritt
1. **GitHub-Login** abschließen (Device-Flow per Skript, Bestätigung auf dem iPad unter github.com/login/device). GitHub CLI selbst bricht bei sporadischen HTTP-503 ab → eigenes Skript mit Wiederholung (Scratchpad `gh-login.ps1`; bei neuer Sitzung neu schreiben: Device-Flow mit client_id `178c6fc778ccc68e1d6a`, Token per `gh auth login --with-token`, nie ausgeben).
2. Danach: Git-Identität (noreply), erster Commit, Repo `schattendepot` (öffentlich) anlegen, `main` pushen, Branch `daten` aus `vorlage/daten` (orphan) pushen, Pages auf „GitHub Actions“ stellen (`gh api -X POST repos/<owner>/schattendepot/pages -f build_type=workflow`), Deploy prüfen, Link testen.
3. Prüfen, ob `actions/checkout@v5`, `setup-node@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4` laufen (sonst Feierabend-Versionen v4/v3).
4. Meilenstein 1 abschließen → STAND.md, Halt, Stand an Peer.

## Faktencheck (Ergebnisse, nicht erneut recherchieren)
- **Consorsbank** (consorsbank.de/web/Wertpapierhandel/Preismodell): Peers Angaben stimmen. Silver (0–25 Orders/Jahr): 4,95 € + 0,25 %, min. 9,95 €, max. 69 €. Gold (26–500): 3,95 € + 0,25 %, min. 8,95 €, max. 59 €. Platinum (ab 501): 3,95 € + 0,22…0,08 %, min. 7,95…6,95 €, max. 49…29 €; ab Platinum 4 Sterne (3001+) Tradegate provisionsfrei + 0,95 €. Freetrades nach der 10./100./250. relevanten Order im Kalenderjahr (nur 0,95 € Tradegate-Entgelt). Handelsplatzentgelte außer Tradegate (0,95 €) stehen nicht auf der Seite → aus Peers Angaben übernommen.
- **Claude-Routinen** heißen jetzt „Scheduled tasks“ (Adresse weiter claude.ai/code/routines, CLI `/schedule` bzw. `/routines`):
  - Laut aktueller Doku **keine feste Tagesgrenze von 5 Läufen** mehr, sondern Stundenlimits (100 geplante Läufe/h pro Konto, 30 Fires/h pro Routine) plus normales Nutzungslimit. Plan mit 3 Läufen Mo–Fr + 1 Sa bleibt aus Verbrauchsgründen.
  - Mindestintervall eines Zeitplans: 1 Stunde. Läufe genau zur vollen Stunde starten oft verspätet → z. B. 07:32 statt 07:30.
  - API-Trigger nur im Web anlegbar (nicht per CLI). `POST https://api.anthropic.com/v1/claude_code/routines/<trig_…>/fire`, Header `Authorization: Bearer sk-ant-oat01-…`, `anthropic-version: 2023-06-01`, Body `{"text": "…"}` (≤ 65.536 Zeichen). Text kommt als `<routine-fire-payload>` an und muss im Prompt ausdrücklich zur Auswertung freigegeben werden. Keine Idempotenz.
  - Branches: Claude pusht standardmäßig auf `claude/…`; Pushes erscheinen als Peers GitHub-Nutzer (lösen daher Workflows aus).
  - Netzwerk: Standard-Umgebung „Trusted“ = nur Allowlist; Optionen „Custom“ (eigene Domains + Standardliste) oder „Full“. Konnektoren laufen über Anthropic und brauchen keine Allowlist.
  - Alle verbundenen Konnektoren sind standardmäßig aktiv → pro Routine abwählen.
  - GitHub-Zugriff fehlt beim Lauf → Läufe werden bis 72 h übersprungen, danach wird die Routine abgeschaltet.
- **iPadOS Web Push:** ab 16.4 nur für zum Home-Bildschirm hinzugefügte Web-Apps (Safari), Anmeldung nur nach Nutzer-Tipp, VAPID-Standard. Peers iPad: **iPadOS 26.2** ✓.

## Antworten von Peer
- Plan bestätigt; Git/gh per winget erlaubt; öffentliches Repo `schattendepot` ok.
- iPadOS 26.2.
- Konnektoren Alpha Vantage, FMP, Crypto.com sind in claude.ai verbunden.
- Claude Code im Web: Einrichtung in M3 gemeinsam (vom iPad aus).
- Peer steuert die Sitzung per Remote Control vom iPad/iPhone; Eingaben am PC per Fernzugriff sind mühsam (kein @) → **alles, was Peer bestätigen muss, so gestalten, dass es auf dem iPad geht.**

## Offene Fragen an Peer
- (keine, außer GitHub-Login bestätigen)

## Vorschläge (kosten Geld oder später)
- (noch keine)

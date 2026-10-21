# STAND – Schattendepot

_Zuletzt aktualisiert: 21.10.2026 (Sitzung 1)_

## Phase
**Meilenstein 1 – Grundgerüst: ERLEDIGT** (21.10.2026). Warte auf Peers „weiter“ für **Meilenstein 2** (Kurswächter + Web Push + Kalender-Abo).

- Repo: https://github.com/pennyboberde-source/schattendepot (öffentlich, Default-Branch `main`, Branch `daten` existiert)
- App: https://pennyboberde-source.github.io/schattendepot/
- GitHub-Konto: `pennyboberde-source`; gh-Login mit Scopes repo, read:org, gist, workflow (Keyring). Git-Identität im Repo: noreply-Adresse.
- Lokaler Worktree `_daten/` = Branch `daten` (gitignored im main-Checkout).
- Hinweise: GitHub verarbeitete die ersten Pushes mit mehreren Minuten Verzögerung (Workflows erschienen erst nach ~10 Min.). `actions/deploy-pages@v4` läuft mit Node-20-Warnung (wird auf Node 24 gezwungen) – bei Gelegenheit auf neuere Version prüfen. `ubuntu-latest` wechselt ab 19.10.2026 auf Ubuntu 26.

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

## Nächster Schritt: Meilenstein 2 (nach Peers „weiter“)
1. Kursquelle klären: Nutzungsbedingungen Yahoo Finance (inoffiziell) prüfen; falls verboten → Gratis-Schlüssel-Anbieter (Twelve Data / Finnhub / EODHD) mit Kontingentplanung; Provider-Schnittstelle mit Fallbacks, Zeitstempel + Quelle, verzögert kennzeichnen. Ggf. 🔴❗ gebündelte Anmeldung bei 1–2 Gratis-Diensten (vom iPad aus).
2. `core/`: Ereignisprotokoll → Positionen/Abgeschlossen/Kennzahlen ableiten (Event-Sourcing), Ausführung ohne Rückschaufehler, Ziel/Stop/Termin/Knock-out (inkl. synthetischer Turbo-Kurs), Börsenkalender (Feiertage Tradegate/Xetra, Sommerzeit), Push-Texte inkl. „Chance ~x %“, Ruhezeit-Warteschlange, `termine.ics`. Alles mit Vitest.
3. `jobs/waechter.ts` + `.github/workflows/waechter.yml` (Cron alle 15 Min. UTC, Guard 08:00–22:00 Berlin, Concurrency `daten-schreiben`, schreibt `daten`, stößt Deploy per `gh workflow run` an).
4. Web Push: VAPID-Schlüssel erzeugen (Private Key nur als Secret `VAPID_PRIVATE_KEY`; Public Key in `config`/Build), `web-push` im Job, Push-Anmeldung in der App (Knopf „Mitteilungen erlauben“, Push-Code mit Kopierknopf), 404/410 → `system.json` `pushAbgelaufen`.
5. Peer: App zum Home-Bildschirm, Mitteilungen erlauben, Push-Code kopieren und vom iPad aus als Secret `PUSH_SUBSCRIPTION` hinterlegen (GitHub → Repo → Settings → Secrets and variables → Actions; Anleitung mit direktem Link geben). Push-Code nicht in den öffentlichen Chat/Repo. Danach Test-Push.
6. Workflow `Test-Push` (workflow_dispatch) für Trockenlauf.

## Login-Notiz (falls gh je neu angemeldet werden muss)
GitHub CLI bricht bei sporadischen HTTP-503 im Device-Flow ab, und PowerShell-Pipes setzen eine BOM vor den Token. Lösung: eigenes Skript (Device-Flow mit client_id `178c6fc778ccc68e1d6a`, Polling mit Wiederholung, Token in ASCII-Datei, `cmd /c "gh auth login --with-token < datei"`, Datei löschen, Token nie ausgeben). Peer bestätigt auf dem iPad unter github.com/login/device.

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
- Weiter mit Meilenstein 2?

## Vorschläge (kosten Geld oder später)
- (noch keine)

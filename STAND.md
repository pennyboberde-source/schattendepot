# STAND – Schattendepot

_Zuletzt aktualisiert: 21.10.2026 ~17:40 (Sitzung 1)_

## 🚀 LIVE seit 21.10.2026 ~18:15 Berlin
- Routinen (claude.ai, per RemoteTrigger angelegt, Umgebung `env_01BSC8PJ9ffzbBH7oX6fy8wc` „Default“ = Trusted, keine Variablen; Modell claude-opus-5-5; Konnektoren NUR Alpha Vantage/FMP/Crypto.com Market Data – der Server hängt sonst ALLE Konnektoren an, daher immer explizite Liste übergeben):
  - Morgenlauf `trig_01TAvkP41ZEYZE9azpzewhPq` – cron `40 5 * * 1-5` (UTC! = 07:40 Sommer / 06:40 Winter)
  - Abendlauf `trig_01H3UdvCwFfTDni3gumeM5wZ` – cron `17 21 * * 1-5` (= 23:17 Sommer / 22:17 Winter)
  - Wochenrückblick `trig_01HJbMVApAyYKb9vzdo4rZdQ` – cron `7 8 * * 6` (= 10:07 Sommer / 09:07 Winter)
  - Kein Ereignislauf-Routine (API-Token nur im Web) → tokenfreier Ersatz über offene-ereignisse.json.
- Trockenlauf Abendlauf am 21.10. erfolgreich: Routine → `claude/lauf-2026-10-21-abendlauf` → Übernahme (Schema ok) → Branch gelöscht.
- `ausfallWarnungAktiv: true`.
- Erster echter Morgenlauf: Do 22.10. 07:40. **Nächste Sitzung: Lauf prüfen** (`RemoteTrigger list_runs` trig_01TAvkP41ZEYZE9azpzewhPq, `get_run_log`), daten/laeufe/, Positionen, Pushes; Verbrauch nach einer Woche prüfen (ggf. Modell → Sonnet per `RemoteTrigger update`).

## Quellen-Ausbau + Spekulation + Mittagslauf (21.10. spätabends)
- Neu: `jobs/quellen/finra.ts` (FINRA Reg-SHO-Tagesdateien, Leerverkaufsquote US), `jobs/quellen/gettexscanner.ts` (Kursraketen aus allen gettex-Geschäften der letzten Stunde, Namen via OpenFIGI), `jobs/quellen/anreicherung.ts` (2. Stufe Hauptlauf: Finnhub-Analystentrend `/stock/recommendation` + Drift nach Quartalszahlen über `/quote` dp), Alpha Vantage Top-Gewinner → `kursrakete`. Gelegenheiten des Tages in `daten/gelegenheiten.json`.
- **BaFin (robots Disallow /) und Bundesanzeiger /nlp (Disallow) bewusst NICHT genutzt.**
- Risiko-Budget (`config/einstellungen.json risikoBudget`): `risikoklasse: spekulativ`, max. 1 je Lauf, max. 30 % der aktiven Positionen, Stop ≥ −25 %, Spread-Klasse `spekulativ` (3 %), Mindestkurs 0,01 €. Erzwungen in `core/entscheidung.ts` bzw. `core/waechter.ts`; Statistik `nachRisikoklasse`.
- **Mittagslauf** `trig_01PkFLbMgdJxtZhLPmdexexL`, cron `52 14 * * 1-5` UTC (16:52 Sommer / 15:52 Winter): offene Ereignisse + Gelegenheiten, max. 1 Order (bevorzugt spekulativ), keine Pflicht-Order. Ersetzt den Ereignislauf-Slot (3 Claude-Läufe Mo–Fr).
- Hinweis: Am Live-Start-Abend (21.10.) hat die Ausfallwarnung einmal ausgelöst (Warnung nur protokolliert, Push noch nicht verbunden) – erwartbar, kein Fehler.

## gettex als Hauptkursquelle (21.10. abends)
- `jobs/kurse/gettex.ts`: kostenlose MiFIR-Nachhandelsdaten der Bayerischen Börse (Dateiliste auf gettex.de/en/trading/delayed-data/posttrade-data/, Dateien `erdk.bayerische-boerse.de:8000/.../posttrade.JJJJMMTT.HH.MM.munc|mund.csv.gz`, Format `ISIN,HH:MM:SS.ffffff(UTC),EUR,Kurs,Stück`, ~0,3 MB/15 Min., ≥ 24 h abrufbar). Wächter holt Kurse nach ISIN (+ Vergleichs-ETF IE00B4L5Y983), merkt Vortageskurs in `schlusskurse.json`. `core/waechter.ts` nimmt `direktKurse` vorrangig (Zeitprüfung gegen den Geschäftszeitpunkt → kein Rückschaufehler); Knock-out weiter am Basiswert (falls Kursbasis vorhanden) oder Produktkurs ≤ 0,001.
- Live-Test 21.10. 21:06: SAP, Siemens, Allianz, Apple, MSCI-World-ETF, BTC-ETN geliefert (5–21 Min. alt). gettex robots: `User-agent: *` Allow (ClaudeBot u. a. gesperrt – Abruf erfolgt per GitHub Action, nicht per Claude).
- Peers Fragen (Ereignislauf/Edge) beantwortet: Ereignislauf vorerst nicht nötig → **messen** (TODO: bei Ereignis Kurs zum Ereigniszeitpunkt und beim nächsten Claude-Lauf festhalten, nach 3–4 Wochen auswerten). Ehrliche Einschätzung: kein Geschwindigkeitsvorteil; Chance nur bei langsamen Mustern (Insider-Cluster, Nach-Quartalszahlen-Drift, Analysten-Revisionen); Gebühren-Hürde 2,2 %.
- Nächste Quellen (0 €): BaFin Directors' Dealings, Bundesanzeiger Leerverkäufe, Finnhub-Analystenempfehlungen (`/stock/recommendation`), PEAD-Signal aus Kursen. Option für Peer: Routinen-Netzwerk „Custom“ mit wenigen Nachrichten-Domains (kleiner Sicherheitskompromiss).

## Phase
- M1 Grundgerüst ✅ · M2 Kurswächter/Push/Kalender ✅ (Code fertig, Live-Test wartet auf Secrets) · M3 Routinen-Anweisungen/Übernahme ✅ (Routinen-Anlage wartet auf Peer, Schritt 3) · M4 Datensammler ✅ (13 Quellen, 9–10 ohne Schlüssel live geprüft)
- **Jetzt: M5 Lernschleife.** Danach M6 Trockenlauf + Live-Start, dann M7 Quellen-Ausbau.
- **Peer will ohne Halt bis zum Nutzungslimit** („Mach so lange automatisch weiter“). Neue Sitzung: einfach beim nächsten Schritt weitermachen.

## Links
- Repo: https://github.com/pennyboberde-source/schattendepot (öffentlich; `main` = Code, `daten` = Laufzeitdaten nur von Actions, `claude/lauf-*` = Routinen-Ergebnisse)
- App: https://pennyboberde-source.github.io/schattendepot/
- Lokaler Worktree `_daten/` = Branch `daten`. GitHub-Konto `pennyboberde-source` (gh angemeldet, Keyring).

## Wichtige Vorgaben von Peer
- **Gebühren: immer Consorsbank-Standardpreis**, keine Stufen, keine Freetrades.
- Erfolgschance („Chance ~x %“) im Kauf-Push; später mit Kalibrierung („bisher y % Treffer“, ab 10 Fällen).
- Leicht reparierbar: Fehler melden → GitHub-Issue (Label `fehler`); neue Sitzung: `gh issue list -R pennyboberde-source/schattendepot --label fehler`.
- Alles, was Peer tun muss, iPad-tauglich (Links, kopierbare Namen); Freigaben mit 🔴❗ + Push.

## Sicherheit (21.10. geprüft und gehärtet – Peer: „höchste Priorität“)
- Secrets nur als GitHub-Secrets; Code/Daten/Logs gescannt: 0 Schlüsselspuren. `jobs/lib/schwaerzen.ts` schwärzt alle Secret-Werte + abgeleitete Teile (Push-Endpoint/Keys, Fire-URL-Pfad) vor jedem Schreiben in Dateien/Logs; `logsMaskieren()` (::add-mask::) läuft beim Import von pushen.ts.
- Repo: Secret-Scanning + Push-Protection an; Default-Workflow-Rechte read; nur GitHub-eigene Actions erlaubt; Rulesets: `daten` (kein Löschen, kein Force-Push), `main` (kein Löschen).
- Routinen: OHNE Konnektoren (Crypto.com-Konnektor könnte echtes Konto berühren) und Standard-Netzwerk „Trusted“ (nicht Full).
- **Fund:** Commit 54a090c („Vorlage: Leerzeile (Actions-Test)“, per Contents-API erzeugt) trägt als Autor-/Committer-Mail die private Adresse des GitHub-Kontos; zusätzlich stand sie versehentlich in einer früheren Fassung dieser Datei (Commit 1d15fb1). Bereinigung = Historie von main umschreiben (Mail in Metadaten → noreply-Adresse, Dateiinhalt bereinigen) + `git push --force-with-lease` – **vom Auto-Modus blockiert, wartet auf Peers ausdrückliches „Ja, Historie bereinigen“**. Nie wieder Commits per Contents-API; private Adressen nie in Repo-Dateien schreiben.
- Kosten: kein API-Schlüssel, Gratis-Tarife ohne Karte, öffentliches Repo. Einziges Restrisiko: „Extra usage“ in claude.ai → Peer prüft (C).
- SEC 8-K braucht Kontakt-Mail im User-Agent (sonst 403) → nur mit Secret `SEC_KONTAKT`; private Mail NICHT ungefragt verwenden.

## Routinen per API (RemoteTrigger)
- `RemoteTrigger create` funktioniert grundsätzlich; Pflicht: `job_config.ccr.environment_id` (Wert `"default"` wurde akzeptiert) und verbundenes GitHub-Konto in claude.ai (Fehler `github_token_missing` → Peer B).
- Body-Vorlage: `{"name","cron_expression":"32 7 * * 1-5","enabled":false,"job_config":{"ccr":{"environment_id":"default","events":[{"data":{"message":{"content":"Lies routine/morgenlauf.md …","role":"user"},"type":"user","parent_tool_use_id":null}}],"session_context":{"sources":[{"git_repository":{"url":"https://github.com/pennyboberde-source/schattendepot"}}],"model":"claude-opus-5-5"}}},"mcp_connections":[]}` – Zeitzone der Cron-Angabe nach dem Anlegen am Ergebnis prüfen (Server meldet Laufzeit).
- API-Token für /fire nur im Web erzeugbar → **Ersatz ohne Token gebaut**: `ereignisBehandeln()` → sofort Push + `offene-ereignisse.json`; kontext.mjs zeigt sie Morgen-/Abendlauf; Übernahme leert die Liste. Ist ROUTINE_FIRE_* gesetzt, wird direkt gefeuert.

## Offene Schritte für Peer (Stand 21.10. abends)
- D: App auf Home-Bildschirm + Mitteilungen erlauben + Secret PUSH_SUBSCRIPTION (bis dahin werden Pushes nur protokolliert, siehe daten/pushes.json). Danach `gh workflow run test-push.yml`.
- github.com/settings/emails: „Keep my email addresses private“ + „Block command line pushes …“ (Claude fehlt Scope `user`).
- A: Historie bereinigen nur nach ausdrücklichem „Ja, Historie bereinigen“.
- Optional: FRED_API_KEY, SEC_KONTAKT (Kontakt-Mail für SEC – nur wenn Peer will), Kalender-Abo.

## (alt) Offene Schritte für Peer (am 21.10. ~17:35 als Anleitung geschickt)
Prüfen: `gh secret list -R pennyboberde-source/schattendepot` · `RemoteTrigger list`
1. Secrets: FINNHUB_API_KEY, TWELVEDATA_API_KEY, FMP_API_KEY, ALPHAVANTAGE_API_KEY, (FRED_API_KEY empfohlen). CoinGecko/OpenFIGI erst M7.
2. Claude GitHub App auf `schattendepot` + claude.ai/code mit GitHub verbunden.
3. Routine „Schattendepot Ereignislauf“ (nur API-Trigger, Opus, Repo, Netzwerk Full, Konnektoren nur AV/FMP/Crypto.com) + Secrets ROUTINE_FIRE_URL, ROUTINE_FIRE_TOKEN.
4. App auf Home-Bildschirm → Mitteilungen erlauben → Secret PUSH_SUBSCRIPTION. Danach `gh workflow run test-push.yml -R pennyboberde-source/schattendepot`.
**Danach Claude:** Morgenlauf (Mo–Fr 07:32), Abendlauf (Mo–Fr 22:17), Wochenrückblick (Sa 10:07) per `RemoteTrigger create` anlegen – Konfiguration (Repo/Environment/Konnektoren/Modell) von der Ereignislauf-Routine per `RemoteTrigger get` übernehmen; pausiert (enabled=false) bis M6.

## Aufbau (Kurzüberblick, Details im Code)
- `core/`: geld, gebuehren, steuern, spreads, rendite (Zielkurs nach Gebühren), kalender (Feiertage/Sommerzeit/Ruhezeit), bewertung (USD→EUR, Knock-out/Turbo, Krypto-ETN), waechter (Ausführung ohne Rückschaufehler, Ziel/Stop/Termin/KO, Ereignislauf ±5 %, Ausfallwarnung), ableiten (Ereignisprotokoll → Positionen/Abgeschlossen/Kennzahlen), push (Texte, Ruhezeit-Warteschlange), ics, entscheidung (Claude-Ergebnis → Ereignisse), signale (Zusammenführen/Bewerten), texterkennung (Schlagzeile → Wert/Typ), lagebild.
- `jobs/`: waechter.ts, sammler.ts, uebernahme.ts, test-push.ts; `jobs/kurse/` (Finnhub, Twelve Data, FMP, Alpha Vantage, Kraken, Frankfurter), `jobs/quellen/` (RSS ×5, OpenInsider, ApeWisdom, FRED, Kraken, Finnhub, FMP, Alpha Vantage, GDELT), `jobs/lib/` (dateien, netz+Kontingente, pushen, routine (/fire), uebernahme, abgeleitet).
- Workflows: deploy (Pages, Build + daten), waechter (*/15 6–21 UTC Mo–Fr), sammler (06:27 Berlin Haupt, stündlich :07, Sa), uebernahme (Push auf claude/**), test-push. Alle Daten-Workflows: Concurrency `daten-schreiben`; Wächter übernimmt liegengebliebene claude-Branches mit.
- `routine/`: gemeinsam.md, morgenlauf.md, abendlauf.md, ereignis.md, wochenrueckblick.md, kontext.mjs (kompakter Kontext), pruefen.mjs (Schema-Prüfung). Schema: `schema/entscheidung.schema.json`.
- `config/`: gebuehren, steuern, spreads, einstellungen (`ausfallWarnungAktiv: false` bis M6!), push (VAPID public), signale (Gewichte/Grenzen), universum (DAX + US-Werte für Schlagzeilen).
- Secrets gesetzt: VAPID_PRIVATE_KEY (von Claude erzeugt).
- Tests: 92 Unit-Tests (Vitest), 20 E2E (Playwright, iPad hoch/quer/WebKit, iPhone).

## Erkenntnisse/Fallstricke
- Yahoo Finance verboten (ToS) → nicht genutzt. Tradegate sperrt /json/ per robots. Google News RSS per robots gesperrt → GDELT. EQS sperrt KI-Bots → zurückgestellt (M7: BaFin-Datenbank prüfen).
- Twelve Data Gratis = nur US + Forex. FMP-Gratis-Abdeckung für `.DE` unklar → mit echtem Schlüssel im Actions-Lauf testen (Quellenstatus/`system.json.kursabrufe` ansehen).
- GitHub verarbeitete Pushes heute teils >10 Min. verzögert; Workflows erscheinen verspätet.
- Windows PowerShell 5.1 hängt beim Pipen eine BOM an → Geheimnisse per Datei + `cmd /c "… < datei"`.
- Playwright-WebKit unter Windows hängt bei `pushManager.getSubscription()` → nur in Standalone aufrufen.
- FRED-Webseite war 21.10. in Wartung (liefert HTML) → Fehler wird jetzt erkannt; mit FRED_API_KEY offizielle API.
- Kurse für US-Werte: Finnhub-Zeitstempel = letzter US-Handel → Vormerkungen für US-Werte werden erst nach US-Eröffnung (15:30) ausgeführt (kein Rückschaufehler, bewusst konservativ).

## Nächste Schritte (M5 Lernschleife)
1. `core/statistik.ts`: Trefferquote/Ø-Rendite (netto, nach Steuern) je Strategie, Signal-Typ, Quelle, Anlageklasse, Haltedauer, Konfidenzstufe; Kalibrierung; Pflicht vs. Überzeugung; erwartet vs. tatsächlich → `daten/statistik.json` (+ `zusammenfassung` für kontext.mjs).
2. Nicht-Käufe mitverfolgen: Kandidaten aus `signale/<datum>.json` → Kurs nach 1 T/1 W/1 M (sparsam, Kontingente!) → `daten/kandidaten-tracking.json`.
3. Gewichte wöchentlich (Samstag) im Code anpassen, in Grenzen (`config/signale.json grenzen`), Claude-Vorschläge (`lernen/vorschlaege.json`) nur innerhalb der Grenzen → `daten/gewichte.json`, `lernen/gewichtsaenderungen.json`.
4. ETF-Vergleich je Order (iShares Core MSCI World IE00B4L5Y983, Kursbasis z. B. `EUNL.DE` über FMP oder `URTH` US-Proxy) inkl. gleicher Gebühren → Ereignis `etfVergleich` beim Verkauf.
5. Lernen-Ansicht: Lektionen, Statistik-Diagramme, Kalibrierung, Rangliste Quellen/Signale mit Gewichten. Kalibrierte Chance in den Kauf-Push.
6. Dann M6 (Trockenlauf: Sammler, Wächter, jede Routine manuell, Test-Push; `ausfallWarnungAktiv: true`; Routinen aktivieren) und M7.

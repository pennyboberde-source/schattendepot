# STAND – Schattendepot

_Zuletzt aktualisiert: 23.10.2026 abends (Sitzung 2: Daytrader + Randquellen, Planung)_

## 🆕 Sitzung 2 (23.10. abends): Daytrader + Randquellen – Entscheidungen des Nutzers
Auftrag: Daytrader-Skill `Jakeschincariol/day-trader-skill` (MIT, Stand 3d0f4ef vom 20.10.2026, 11 Skills, Python) in die App holen, wie das normale Depot simulieren und auswerten; zusätzlich gründliche Recherche nach Randplattformen (alle Anlageklassen).
- **Keine bestehende Quelle je entfernen.** Neue Quellen kommen nur zusätzlich dazu.
- **Eigener Bereich „Daytrading“ in der App**: eigene Konten, Kurve, Statistik. Nichts fließt in die Kennzahlen des normalen Depots.
- Skill-Logik wird nach TypeScript portiert (getestet, `core/`), kein Plugin/Python nötig. Yahoo bleibt verboten → Kerzen aus gettex-Geschäftsdaten, 60-Tage-Historie für die Time Machine von Twelve Data (US), Kraken (Krypto). Broker-Skill entfällt (keine echten Orders); Alerts → eigene Pushes.
- **Zwei Zweige, getrennt ausgewertet:** Code (Skill-Regeln mechanisch) und Claude (Watchlist im Morgenlauf, kein zusätzlicher Lauf).
- **Märkte:** US-Aktien (Original), DAX/EU-Aktien, Krypto-ETNs, Hebel/Turbos – je getrennt ausgewertet.
- **Konto:** 5.000 € je Konto, 1 % Risiko (50 €) je Trade – wie im Skill, aber **bis 10 Trades/Tag** je Konto (Nutzer 23.10.: „ruhig mehr nach eigenem Ermessen, ~10“; kostet kein Nutzungslimit, läuft als Code in Actions), Tagesverlust-Grenze mitgezogen, Puffer 10 %, max. 75 % je Position, Chance/Risiko ≥ 1, flach vor Börsenschluss).
- **Gebühren Daytrading:** Hauptmodell **Smartbroker+** (gettex 0 € ab 500 €, darunter 1 €; Turbos UniCredit 0 € ab 500 €, andere Emittenten 4 €). Vergleichsspalten: **Consorsbank**, **Trade Republic** (1 € Bestpreis), dazu immer das Ergebnis vor Gebühren. Quellen: smartbrokerplus.de/de-de/konditionen (PLV 2026_07), Trade Republic seit 02.07.2026 1 € Bestpreis / 2 € Direktpreis.
- **Normales Depot:** rechnet weiter mit Consorsbank, zeigt zusätzlich einen Smartbroker+-Vergleichswert. Risiko-Budget mutiger: 2 spekulative je Lauf, 50 % (config/einstellungen.json, 23.10.).
- **Pushes Daytrader:** Einstieg + Ausstieg (je Wächter-Lauf gebündelt).
- **Recherche Randplattformen:** gründlich (~40–60 Webabfragen, Bedingungen/robots je Quelle), kostenlose Anmeldung ohne Zahlungsdaten erlaubt (iPad-Anleitung, Schlüssel per GitHub-Einstellungen). Ergebnis: Rangliste → nach „weiter“ einbauen.
- **Nutzungslimit (Pro):** am 23.10. ~23:45 Woche 76 %, Reset **Di 27.10. 06:00 Berlin**. Daytrades selbst kosten nichts (Code in Actions); teuer sind Bauen und Recherche. → **D1 erst nach dem Wochen-Reset starten**, Recherche (D4) sparsam aufteilen. Routinen (Mo 3 Läufe, Sa Wochenrückblick) brauchen den Wochenrest.
- **Nächster Schritt:** D1 Daytrader-Kern. Skill-Quelle zum Nachlesen: `git clone --depth 1 https://github.com/Jakeschincariol/day-trader-skill` in den Scratchpad (nur lesen, nicht ausführen; v. a. trader-scanner/scan.py, trader-entry/entry.py, trader-exit/exit.py, trader-timemachine/timemachine.py, trader-budget/size.py, trader-risk/check.py + config.example.json).
- **Meilensteine:** D1 Daytrader-Kern in `core/` (Kerzen, Eröffnungsspanne, Einstieg, Ausstieg, Time Machine, Größe, Risiko, Simulation, Statistik, Gebührenmodelle) · D2 Jobs (Scanner, Kurse, Wächter-Anbindung, Pushes, Claude-Watchlist im Morgenlauf + Schema) · D3 App-Bereich Daytrading + E2E · D4 Recherche-Bericht Randplattformen · D5 Einbau der besten Quellen.

## 🛠️ Fehler beheben in einer neuen Sitzung
1. In der App „Fehler melden“ (Einstellungen oder Order-Detail) → GitHub-Issue mit Label `fehler` (Ansicht, App-Version, Gerät stehen schon drin).
2. Neue Claude-Code-Sitzung starten – egal wo:
   - **iPad/iPhone (PC darf aus sein):** claude.ai/code → Repo `pennyboberde-source/schattendepot` wählen.
   - **PC:** Claude-App → Code → Ordner `schattendepot`.
3. Erster Satz: **„Lies STAND.md und behebe die offenen Fehler-Issues.“** (oder den Fehler direkt beschreiben)
4. Ablauf für Claude: `gh issue list --label fehler` → Ursache im Code finden → Test dazu → `npx tsc --noEmit` + `npx vitest run` grün → Commit auf `main` (Push startet Deploy) → Issue mit kurzer Erklärung schließen → STAND.md nachziehen.
   - Cloud-Sitzung (claude.ai/code) arbeitet auf einem Branch `claude/…` → Pull Request; der Nutzer tippt auf GitHub „Merge“. Die Übernahme-Action reagiert nur auf `claude/lauf-*`, Code-Branches sind sicher.
   - Ist `gh` in der Cloud-Sitzung nicht angemeldet: Nutzer kopiert den Issue-Link/-Text in den Chat.
   - Daten nie von Hand ändern (`daten`-Branch schreiben nur Actions). Ereignisprotokoll nur anhängen.
   - Laufzeitfehler ansehen: Actions-Logs (`gh run list`, `gh run view --log-failed`), `daten/system.json` (Quellenstatus), `daten/laeufe/ungueltig/`, Routinen-Läufe per `RemoteTrigger list_runs`/`get_run_log`.

## 🚀 LIVE seit 21.10.2026 ~18:15 Berlin
- Routinen (claude.ai, per RemoteTrigger angelegt, Umgebung `env_01BSC8PJ9ffzbBH7oX6fy8wc` „Default“ = Trusted, keine Variablen; Modell claude-opus-5-5; Konnektoren NUR Alpha Vantage/FMP/Crypto.com Market Data – der Server hängt sonst ALLE Konnektoren an, daher immer explizite Liste übergeben):
  - Morgenlauf `trig_01TAvkP41ZEYZE9azpzewhPq` – cron `40 5 * * 1-5` (UTC! = 07:40 Sommer / 06:40 Winter)
  - Mittagslauf `trig_01PkFLbMgdJxtZhLPmdexexL` – cron `52 14 * * 1-5` (= 16:52 Sommer / 15:52 Winter)
  - Abendlauf `trig_01H3UdvCwFfTDni3gumeM5wZ` – cron `17 21 * * 1-5` (= 23:17 Sommer / 22:17 Winter)
  - Wochenrückblick `trig_01HJbMVApAyYKb9vzdo4rZdQ` – cron `7 8 * * 6` (= 10:07 Sommer / 09:07 Winter)
  - Kein Ereignislauf-Routine (API-Token nur im Web) → tokenfreier Ersatz über offene-ereignisse.json.
- Trockenlauf Abendlauf am 21.10. erfolgreich: Routine → `claude/lauf-2026-10-21-abendlauf` → Übernahme (Schema ok) → Branch gelöscht.
- `ausfallWarnungAktiv: true`.
- Erster echter Morgenlauf: Do 22.10. 07:40. **Nächste Sitzung: Lauf prüfen** (`RemoteTrigger list_runs` trig_01TAvkP41ZEYZE9azpzewhPq, `get_run_log`), daten/laeufe/, Positionen, Pushes; Verbrauch nach einer Woche prüfen (ggf. Modell → Sonnet per `RemoteTrigger update`).

## Frühe Signale + unkonventionelle Quellen (21.10. nachts)
- Wikipedia-Seitenaufrufe (`jobs/quellen/aufmerksamkeit.ts`, `wiki`-Titel in `config/universum.json`): Spitze ≥ 3× Median der Vortage und ≥ 2.000 Aufrufe → `stimmung_social`.
- Wikimedia-Regeln 2026: User-Agent mit https-Kontakt-URL → 200/Min.; ohne → 10/Min. Quelle pausiert 0,7 s je Abfrage und bricht bei 429 ab (live geprüft 21.10.: 39 Abfragen ok).
- Kalender-Effekte (`core/kalendereffekte.ts`): Verfall, Monats-/Quartalswechsel, Tag vor Feiertag → im Makro-Teil des Lagebilds.
- YouTube Data API v3 (`jobs/quellen/youtube.ts`, Secret `YOUTUBE_API_KEY`, optional): 4 Suchen im Hauptlauf (400 von 10.000 Einheiten), Wert ab 2 viel gesehenen Videos → Stimmung. Speichert nur eigene Zählung (Richtlinien YouTube API). Ohne Schlüssel wird die Quelle übersprungen.
- Bewusst nicht: Instagram/Facebook/TikTok/X (Bedingungen verbieten Auslesen), Presse-Verteiler (sperren Bots). Routinen dürfen kostenlose Berichte (IR-Seiten, EDGAR, EZB/Bundesbank/Destatis/Fed) lesen.
- Ehrliche Einordnung: kein Geschwindigkeitsvorteil möglich; Chancen liegen in langsamen Mustern (Insider-Cluster, Drift nach Zahlen, Analysten-Trend, Aufmerksamkeit). Hürde 2,2 % Gebühren.
- Vorschläge: USAspending (Staatsaufträge), openFDA (Zulassungen) – Zuordnung zu Tickern aufwendig.

## Selbstlernen erweitert (21.10. spätabends)
- `core/lernhinweise.ts`: Code leitet aus der Statistik Hinweise ab (Kalibrierung, Strategien/Haltedauer/Anlageklasse, Verkaufsgründe, Spekulativ vs. normal, Pflicht vs. Überzeugung, stärkste/schwächste Signale) → `statistik.lernhinweise` + in `zusammenfassung` (Kontext der Routinen) + Lernen-Ansicht. `wirksamesRisikoBudget` lernt mit (ab 10 spekulativen Orders; Leitplanken 10–50 %, 1–2 je Lauf) → `statistik.risikoBudget`, von der Übernahme verwendet.
- Nutzer: „eigenständig lernen, verbessern, gewinnen“ – kein menschliches Urteil nötig.
- **TODO nach Zeitumstellung (So 25.10.):** Crons per `RemoteTrigger update` auf Winterzeit ziehen, damit Ortszeiten gleich bleiben: Morgenlauf `40 6 * * 1-5` (07:40), Mittagslauf `52 14` bleibt (15:52), Abendlauf `17 21` bleibt (22:17), Wochenrückblick `7 9 * * 6` (10:07); Sammler-Hauptlauf passt automatisch. Ende März umgekehrt.

## Quellen-Ausbau + Spekulation + Mittagslauf (21.10. spätabends)
- Neu: `jobs/quellen/finra.ts` (FINRA Reg-SHO-Tagesdateien, Leerverkaufsquote US), `jobs/quellen/gettexscanner.ts` (Kursraketen aus allen gettex-Geschäften der letzten Stunde, Namen via OpenFIGI), `jobs/quellen/anreicherung.ts` (2. Stufe Hauptlauf: Finnhub-Analystentrend `/stock/recommendation` + Drift nach Quartalszahlen über `/quote` dp), Alpha Vantage Top-Gewinner → `kursrakete`. Gelegenheiten des Tages in `daten/gelegenheiten.json`.
- **BaFin (robots Disallow /) und Bundesanzeiger /nlp (Disallow) bewusst NICHT genutzt.**
- Risiko-Budget (`config/einstellungen.json risikoBudget`): `risikoklasse: spekulativ`, max. 1 je Lauf, max. 30 % der aktiven Positionen, Stop ≥ −25 %, Spread-Klasse `spekulativ` (3 %), Mindestkurs 0,01 €. Erzwungen in `core/entscheidung.ts` bzw. `core/waechter.ts`; Statistik `nachRisikoklasse`.
- **Mittagslauf** `trig_01PkFLbMgdJxtZhLPmdexexL`, cron `52 14 * * 1-5` UTC (16:52 Sommer / 15:52 Winter): offene Ereignisse + Gelegenheiten, max. 1 Order (bevorzugt spekulativ), keine Pflicht-Order. Ersetzt den Ereignislauf-Slot (3 Claude-Läufe Mo–Fr).
- Hinweis: Am Live-Start-Abend (21.10.) hat die Ausfallwarnung einmal ausgelöst (Warnung nur protokolliert, Push noch nicht verbunden) – erwartbar, kein Fehler.

## gettex als Hauptkursquelle (21.10. abends)
- `jobs/kurse/gettex.ts`: kostenlose MiFIR-Nachhandelsdaten der Bayerischen Börse (Dateiliste auf gettex.de/en/trading/delayed-data/posttrade-data/, Dateien `erdk.bayerische-boerse.de:8000/.../posttrade.JJJJMMTT.HH.MM.munc|mund.csv.gz`, Format `ISIN,HH:MM:SS.ffffff(UTC),EUR,Kurs,Stück`, ~0,3 MB/15 Min., ≥ 24 h abrufbar). Wächter holt Kurse nach ISIN (+ Vergleichs-ETF IE00B4L5Y983), merkt Vortageskurs in `schlusskurse.json`. `core/waechter.ts` nimmt `direktKurse` vorrangig (Zeitprüfung gegen den Geschäftszeitpunkt → kein Rückschaufehler); Knock-out weiter am Basiswert (falls Kursbasis vorhanden) oder Produktkurs ≤ 0,001.
- Live-Test 21.10. 21:06: SAP, Siemens, Allianz, Apple, MSCI-World-ETF, BTC-ETN geliefert (5–21 Min. alt). gettex robots: `User-agent: *` Allow (ClaudeBot u. a. gesperrt – Abruf erfolgt per GitHub Action, nicht per Claude).
- Fragen des Nutzers (Ereignislauf/Edge) beantwortet: Ereignislauf vorerst nicht nötig → **messen** (TODO: bei Ereignis Kurs zum Ereigniszeitpunkt und beim nächsten Claude-Lauf festhalten, nach 3–4 Wochen auswerten). Ehrliche Einschätzung: kein Geschwindigkeitsvorteil; Chance nur bei langsamen Mustern (Insider-Cluster, Nach-Quartalszahlen-Drift, Analysten-Revisionen); Gebühren-Hürde 2,2 %.
- Nächste Quellen (0 €): BaFin Directors' Dealings, Bundesanzeiger Leerverkäufe, Finnhub-Analystenempfehlungen (`/stock/recommendation`), PEAD-Signal aus Kursen. Option für der Nutzer: Routinen-Netzwerk „Custom“ mit wenigen Nachrichten-Domains (kleiner Sicherheitskompromiss).

## Phase
- M1 Grundgerüst ✅ · M2 Kurswächter/Push/Kalender ✅ (Code fertig, Live-Test wartet auf Secrets) · M3 Routinen-Anweisungen/Übernahme ✅ (Routinen-Anlage wartet auf der Nutzer, Schritt 3) · M4 Datensammler ✅ (13 Quellen, 9–10 ohne Schlüssel live geprüft)
- **Jetzt: M5 Lernschleife.** Danach M6 Trockenlauf + Live-Start, dann M7 Quellen-Ausbau.
- **Der Nutzer will ohne Halt bis zum Nutzungslimit** („Mach so lange automatisch weiter“). Neue Sitzung: einfach beim nächsten Schritt weitermachen.

## Links
- Repo: https://github.com/pennyboberde-source/schattendepot (öffentlich; `main` = Code, `daten` = Laufzeitdaten nur von Actions, `claude/lauf-*` = Routinen-Ergebnisse)
- App: https://pennyboberde-source.github.io/schattendepot/
- Lokaler Worktree `_daten/` = Branch `daten`. GitHub-Konto `pennyboberde-source` (gh angemeldet, Keyring).

## Wichtige Vorgaben des Nutzers
- **Gebühren: immer Consorsbank-Standardpreis**, keine Stufen, keine Freetrades.
- Erfolgschance („Chance ~x %“) im Kauf-Push; später mit Kalibrierung („bisher y % Treffer“, ab 10 Fällen).
- Leicht reparierbar: Fehler melden → GitHub-Issue (Label `fehler`); neue Sitzung: `gh issue list -R pennyboberde-source/schattendepot --label fehler`.
- Alles, was der Nutzer tun muss, iPad-tauglich (Links, kopierbare Namen); Freigaben mit 🔴❗ + Push.

## Sicherheit (21.10. geprüft und gehärtet – Nutzer: „höchste Priorität“)
- Secrets nur als GitHub-Secrets; Code/Daten/Logs gescannt: 0 Schlüsselspuren. `jobs/lib/schwaerzen.ts` schwärzt alle Secret-Werte + abgeleitete Teile (Push-Endpoint/Keys, Fire-URL-Pfad) vor jedem Schreiben in Dateien/Logs; `logsMaskieren()` (::add-mask::) läuft beim Import von pushen.ts.
- Repo: Secret-Scanning + Push-Protection an; Default-Workflow-Rechte read; nur GitHub-eigene Actions erlaubt; Rulesets: `daten` (kein Löschen, kein Force-Push), `main` (kein Löschen).
- Routinen: OHNE Konnektoren (Crypto.com-Konnektor könnte echtes Konto berühren) und Standard-Netzwerk „Trusted“ (nicht Full).
- **Fund:** Commit 54a090c („Vorlage: Leerzeile (Actions-Test)“, per Contents-API erzeugt) trägt als Autor-/Committer-Mail die private Adresse des GitHub-Kontos; zusätzlich stand sie versehentlich in einer früheren Fassung dieser Datei (Commit 1d15fb1). Bereinigung = Historie von main umschreiben (Mail in Metadaten → noreply-Adresse, Dateiinhalt bereinigen) + `git push --force-with-lease` – **vom Auto-Modus blockiert, wartet auf ausdrückliches „Ja, Historie bereinigen“**. Nie wieder Commits per Contents-API; private Adressen nie in Repo-Dateien schreiben.
- Kosten: kein API-Schlüssel, Gratis-Tarife ohne Karte, öffentliches Repo. Einziges Restrisiko: „Extra usage“ in claude.ai → der Nutzer prüft (C).
- SEC 8-K braucht Kontakt-Mail im User-Agent (sonst 403) → nur mit Secret `SEC_KONTAKT`; private Mail NICHT ungefragt verwenden.

## Routinen per API (RemoteTrigger)
- `RemoteTrigger create` funktioniert grundsätzlich; Pflicht: `job_config.ccr.environment_id` (Wert `"default"` wurde akzeptiert) und verbundenes GitHub-Konto in claude.ai (Fehler `github_token_missing` → der Nutzer B).
- Body-Vorlage: `{"name","cron_expression":"32 7 * * 1-5","enabled":false,"job_config":{"ccr":{"environment_id":"default","events":[{"data":{"message":{"content":"Lies routine/morgenlauf.md …","role":"user"},"type":"user","parent_tool_use_id":null}}],"session_context":{"sources":[{"git_repository":{"url":"https://github.com/pennyboberde-source/schattendepot"}}],"model":"claude-opus-5-5"}}},"mcp_connections":[]}` – Zeitzone der Cron-Angabe nach dem Anlegen am Ergebnis prüfen (Server meldet Laufzeit).
- API-Token für /fire nur im Web erzeugbar → **Ersatz ohne Token gebaut**: `ereignisBehandeln()` → sofort Push + `offene-ereignisse.json`; kontext.mjs zeigt sie Morgen-/Abendlauf; Übernahme leert die Liste. Ist ROUTINE_FIRE_* gesetzt, wird direkt gefeuert.

## Offene Schritte für den Nutzer (Stand 21.10. abends)
- ✅ App auf Home-Bildschirm, Mitteilungen erlaubt, Secret PUSH_SUBSCRIPTION gesetzt (21.10. 21:55), Test-Push erfolgreich gesendet.
- github.com/settings/emails: „Keep my email addresses private“ + „Block command line pushes …“ (Claude fehlt Scope `user`).
- A: Historie bereinigen nur nach ausdrücklichem „Ja, Historie bereinigen“.
- Optional: YOUTUBE_API_KEY (Google-Cloud-Projekt ohne Zahlungsdaten), FRED_API_KEY, SEC_KONTAKT (Kontakt-Mail für SEC – nur wenn gewünscht), Kalender-Abo.

## (alt) Offene Schritte für den Nutzer (am 21.10. ~17:35 als Anleitung geschickt)
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

## Nächste Schritte
1. **Do 22.10.:** ersten echten Morgenlauf prüfen (`RemoteTrigger list_runs` trig_01TAvkP41ZEYZE9azpzewhPq, `get_run_log`), Übernahme, `daten/laeufe/`, Vormerkungen → Ausführung im Wächter, Pushes angekommen? Danach Mittags- und Abendlauf.
2. Offene Fehler-Issues: `gh issue list --label fehler`.
3. Winterzeit: Morgenlauf ✅ am 23.10. auf `40 6 * * 1-5` gestellt (nächster Lauf Mo 26.10. 07:40). **Offen: Wochenrückblick nach dem Lauf am Sa 24.10. auf `7 9 * * 6`** (sonst 09:07 statt 10:07). Mittag/Abend bleiben.
3a. **Daytrader D1 nach Wochen-Reset (Di 27.10.)** – siehe Abschnitt Sitzung 2 oben.
4. Nach einer Woche: Nutzungsverbrauch der Routinen prüfen (ggf. Modell Sonnet).
5. Nach 3–4 Wochen: Statistik, Kalibrierung, Ereignis-Messung auswerten.
6. Optional auf Wunsch: YouTube-Schlüssel, FRED_API_KEY, SEC_KONTAKT; Historie bereinigen nur nach „Ja, Historie bereinigen“.

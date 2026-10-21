# STAND – Schattendepot

_Zuletzt aktualisiert: 21.10.2026 ~17:40 (Sitzung 1)_

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
- **Fund:** Commit 54a090c („Vorlage: Leerzeile (Actions-Test)“, per Contents-API erzeugt) trägt Autor-/Committer-Mail `pennyboberde@gmail.com`. Bereinigung = `git filter-branch --env-filter` (Mail → 344003264+pennyboberde-source@users.noreply.github.com) + `git push --force-with-lease` auf main – **vom Auto-Modus blockiert, wartet auf Peers ausdrückliches „Ja, Historie bereinigen“**. Nie wieder Commits per Contents-API.
- Kosten: kein API-Schlüssel, Gratis-Tarife ohne Karte, öffentliches Repo. Einziges Restrisiko: „Extra usage“ in claude.ai → Peer prüft (C).
- SEC 8-K braucht Kontakt-Mail im User-Agent (sonst 403) → nur mit Secret `SEC_KONTAKT`; private Mail NICHT ungefragt verwenden.

## Routinen per API (RemoteTrigger)
- `RemoteTrigger create` funktioniert grundsätzlich; Pflicht: `job_config.ccr.environment_id` (Wert `"default"` wurde akzeptiert) und verbundenes GitHub-Konto in claude.ai (Fehler `github_token_missing` → Peer B).
- Body-Vorlage: `{"name","cron_expression":"32 7 * * 1-5","enabled":false,"job_config":{"ccr":{"environment_id":"default","events":[{"data":{"message":{"content":"Lies routine/morgenlauf.md …","role":"user"},"type":"user","parent_tool_use_id":null}}],"session_context":{"sources":[{"git_repository":{"url":"https://github.com/pennyboberde-source/schattendepot"}}],"model":"claude-opus-5-5"}}},"mcp_connections":[]}` – Zeitzone der Cron-Angabe nach dem Anlegen am Ergebnis prüfen (Server meldet Laufzeit).
- API-Token für /fire nur im Web erzeugbar → **Ersatz ohne Token gebaut**: `ereignisBehandeln()` → sofort Push + `offene-ereignisse.json`; kontext.mjs zeigt sie Morgen-/Abendlauf; Übernahme leert die Liste. Ist ROUTINE_FIRE_* gesetzt, wird direkt gefeuert.

## Offene Schritte für Peer (am 21.10. ~17:35 als Anleitung geschickt)
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

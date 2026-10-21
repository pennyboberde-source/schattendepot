# Plan Schattendepot (Entwurf, wartet auf Bestätigung des Nutzers)

## Architektur
Ein öffentliches GitHub-Repo `schattendepot`, keine eigenen Server, 0 € laufend.

```
main (Code)                       daten (nur Actions schreiben)          claude/lauf-* (nur Routinen)
├─ src/        PWA                ├─ ereignisse.jsonl  (nur anhängen)     └─ entscheidung.json
├─ core/       reine Logik+Tests  ├─ positionen.json   (abgeleitet)          (gegen Schema geprüft)
├─ jobs/       Action-Skripte     ├─ abgeschlossen.json
├─ quellen/    Quellen-Module     ├─ signale/JJJJ-MM-TT.json
├─ config/     Gebühren, Spreads, ├─ lagebild/JJJJ-MM-TT.md + heute.json
│              Regeln, Grenzen    ├─ lernen/lektionen.md
├─ routine/    morgenlauf.md …    ├─ statistik.json, gewichte.json
│              + schema/*.json    ├─ kandidaten-tracking.json
└─ .github/workflows/             ├─ quellenstatus.json, kurse.json
                                  ├─ push-warteschlange.json
                                  └─ termine.ics
```

**Warum zwei Branches?** Die Actions committen bis zu ~60-mal am Tag. Lägen die Daten auf `main`, würde jeder Code-Push vom PC mit Bot-Commits kollidieren, und die Code-Historie wäre zugemüllt. Mit `daten` bleiben Code und Laufzeitdaten sauber getrennt.

**Deploy:** Ein wiederverwendbarer Workflow baut die App aus `main` (Build gecacht pro Commit) und legt die Daten aus `daten` daneben (`/daten/...`). Er läuft bei Code-Pushes und nach jeder Datenänderung. So liest die App alles vom selben Ursprung und funktioniert offline.

**Datenfluss pro Tag (Mo–Fr):**
1. 06:30 Datensammler (Code) → Signale, Bewertung, `lagebild/<datum>.md` (≤ ~6.000 Tokens).
2. 07:30 Morgenlauf (Claude): liest Statistik → Lektionen → Lagebild, ≤ 5 Websuchen, schreibt `claude/lauf-<datum>-morgen` mit Order-Vormerkungen, Anpassungen und Briefing.
3. Übernahme-Action (Push auf `claude/**`): Schema-Prüfung → nach `daten` → Briefing-Push (~07:50) → Deploy → Branch löschen.
4. 08:00–22:00 alle 15 Min. Kurswächter (Code): Vormerkungen zum Briefkurs ausführen, Ziel/Stop/Termin/Knock-out prüfen, Pushes, `termine.ics`, Warn-Push bis 10:00 ohne Order, bei ±5 % → Ereignislauf per `/fire` (max. 1/Tag).
5. Stündlich Datensammler: Meldungen zu offenen Positionen; starke Meldung → Ereignislauf (gleiche Tagessperre).
6. 22:15 Abendlauf (Claude): Abschlussberichte, Learnings, Lektionen, Gewichtsvorschläge → Übernahme-Action → Statistik und Gewichte rechnet der Code.
7. Sa: Datensammler-Lauf, dann Wochenrückblick (Claude) mit Push.

**Einstellungen ohne Server:** Reine Anzeige-Einstellungen (Steuerzeile, Theme) speichert die App lokal. Einstellungen, die die Actions brauchen (Ruhezeit, Nachrichtentypen, Hebel-Limit, Ereignis-Schwelle, Gebührenstatus, Steuern), liegen in `config/einstellungen.json`. Die App zeigt sie an, und ein Knopf öffnet die Datei direkt im GitHub-Editor.

**Wartbarkeit (Wunsch des Nutzers):** Fixes landen immer in derselben App (Push auf `main` → automatischer Deploy → PWA aktualisiert sich selbst). Rechenlogik getrennt von der Oberfläche in `core/` mit Tests. In der App öffnet „Fehler melden“ ein vorbefülltes GitHub-Issue (Label `fehler`), das eine neue Sitzung abarbeitet.

**Erfolgschance im Kauf-Push (Wunsch des Nutzers):** `konfidenz` = geschätzte Erfolgschance in % (Wahrscheinlichkeit, nach Gebühren mit Gewinn zu schließen). Push: „… · Chance ~60 %“. Sobald die Kalibrierung genug Fälle hat (M5), zusätzlich „(bisher bei ~60 %: 52 % Treffer)“.

## Datenmodell (Kern)
- **Order:** id, isin, wkn, ticker, name, anlageklasse, handelsplatz, stueck, vorgemerkt_um, kauf {kurs, zeit, quelle}, ziel, stop, verkaufstermin, erwartete_rendite_netto, konfidenz 0–100, pflicht_order, strategie_typ, these, ausloeser, signal_ids[], risiken[], links[], einfluss_lektionen, hebel? {typ, basiswert, basispreis, bezugsverhaeltnis, ko_schwelle, richtung}, verkauf {kurs, zeit, grund}, gebuehren {kauf, verkauf}, ergebnis {brutto, netto, nach_steuern}, etf_vergleich, bericht.
- **Ereignis:** id, zeit, typ (vorgemerkt | gekauft | angepasst | verkauft | bericht | warnung), order_id, daten, begruendung, quelle (routine/waechter).
- **Signal:** id, wertpapier {name, ticker, isin}, typ, staerke, richtung, zeit, quellen[] {quelle, link, fakt}, score.
- `positionen.json`, `abgeschlossen.json` und `statistik.json` werden vom Code aus dem Ereignisprotokoll abgeleitet (nie von Hand).

## Meilensteine (Halt nach jedem)
1. **Grundgerüst:** Repo, App-Gerüst (alle Ansichten als Rahmen, Fußzeile mit Hinweis), Datenmodell + Schemas, `core/` mit Gebühren-, Steuer- und Spread-Rechner (Vitest), Konfiguration, Deploy auf GitHub Pages.
2. **Kurswächter + Push + Kalender:** Kurs-Provider mit Fallbacks, Ausführung, Ziel/Stop/Termin/Knock-out, Feiertage/Sommerzeit, VAPID + `web-push`, Push-Anmeldung in der App, Ruhezeit-Warteschlange, `termine.ics`, Test-Push aufs iPad.
3. **Claude-Routinen:** `routine/*.md` + JSON-Schemas, Übernahme-Action, Ausfallsicherung, Einrichtung der 4 Routinen + API-Trigger mit dir.
4. **Datensammler-Kern:** 8–10 ergiebigste Quellen (ohne Anmeldung + Alpha Vantage + FMP), Signale, Zusammenführung, Bewertung, Lagebild, Briefing-Ansicht, Quellenstatus.
5. **Lernschleife:** Statistik, Kalibrierung, Nicht-Käufe mitverfolgen, automatische Gewichte in Grenzen, ETF-Vergleich, Lernen-Ansicht.
6. **Trockenlauf und Live-Start.**
7. **Datensammler-Ausbau:** restliche Quellen (gebündelte Anmeldung bei Gratis-Diensten).

## Offene Risiken
- **Kursquelle:** Yahoo Finance (inoffiziell) verbietet laut Nutzungsbedingungen voraussichtlich automatisierten Abruf. Wird zu Beginn von M2 geprüft; bei Verbot werden Gratis-Schlüssel-Anbieter (Twelve Data, Finnhub, EODHD) mit Kontingent-Planung genutzt.
- **Geld-/Briefkurs:** Gratis-Quellen liefern meist nur den letzten Kurs. Dann wird ein synthetischer Geld-/Briefkurs aus dem letzten Kurs und dem konfigurierten Spread gebildet und in der App gekennzeichnet.
- **GitHub-Cron** startet unter Last oft 5–20 Min. verspätet. Das genügt für 15-Min.-Prüfungen, wird aber in der App als Zeitstempel sichtbar gemacht.

# Schattendepot – Projektregeln

Lernende Börsen-**Simulation** mit fiktivem Geld. Keine Anlageberatung, keine echten Orders, kein echtes Depot.
Der vollständige Auftrag steht in `schattendepot-prompt.md` (Abschnitte 0–9). Den aktuellen Stand und den nächsten Schritt gibt es in `STAND.md`.

## Arbeitsweise mit dem Nutzer
- Sitzungsstart: „Lies STAND.md und mach weiter“ → STAND.md lesen, beim „Nächsten Schritt“ weitermachen.
- Fehler: „Lies STAND.md und behebe die offenen Fehler-Issues“ → Ablauf in STAND.md › „Fehler beheben in einer neuen Sitzung“ (Issues mit Label `fehler` aus dem App-Knopf „Fehler melden“).
- Das System ist live: jede Änderung an `main` wird sofort deployt und von den Jobs genutzt → nur mit grünen Tests committen, Daten-Branch nie von Hand ändern.
- **Nach jedem Meilenstein anhalten**: STAND.md aktualisieren, kurzen Stand geben, auf „weiter“ warten.
- STAND.md und diese Datei nach jedem Arbeitsschritt aktuell halten.
- Freigabe-Anfragen (Zugänge, Klicks, Konten, Secrets) gebündelt stellen, jede Zeile mit 🔴❗ beginnen und zusätzlich eine Push-Benachrichtigung senden. der Nutzer steuert oft per Remote Control vom iPad: alles, was er bestätigen muss, so gestalten, dass es im iPad-Safari geht (nichts am PC tippen lassen).
- Windows PowerShell 5.1 setzt beim Pipen in Programme eine UTF-8-BOM davor → Geheimnisse/Daten nie per `|` an native Programme geben, sondern per Datei + `cmd /c "prog < datei"`.
- `schattendepot-prompt.md` (Originalauftrag) bleibt lokal und wird nicht committet (persönliche Angaben).
- Nutzungslimit schonen: keine ausufernde Recherche, große Dateien nicht wiederholt ganz lesen. Ungewöhnlich aufwendige Schritte vorher ankündigen.
- **0-€-Regel**: nichts einrichten, das Geld kosten kann oder eine Zahlungsmethode verlangt (bezahlte Tarife, Kreditkarte, Anthropic-API-Schlüssel, kostenpflichtige GitHub-Funktionen, Claude-„Zusatznutzung“). Nur bezahlt sinnvolle Dienste weglassen und als Vorschlag in STAND.md notieren.
- API-Schlüssel und Tokens nie in den Chat oder ins Repo. Der Nutzer setzt Secrets selbst per `gh secret set NAME` (Wert wird interaktiv abgefragt) oder in den GitHub-Repo-Einstellungen.

## Leitprinzip
Alles, was Code kann, macht Code. Claude (Routinen) urteilt nur: Auswahl, Begründung, Berichte, Learnings.
Gebühren, Steuern, Ausführung, Knock-out, Bewertung, Statistik und Gewichte rechnet getesteter Code.

## Stack (wie Feierabend: `..\feierabend`)
Vite + Preact + TypeScript, vite-plugin-pwa, Vitest, Playwright (iPad hoch/quer, WebKit). Deployment auf GitHub Pages per Actions (`BASE_PATH=/<repo>/`).
Jobs (Datensammler, Kurswächter, Übernahme) sind Node-Skripte in TypeScript, die in GitHub Actions laufen. Laufende Kosten: 0 €.

## Branches (wichtig)
- `main`: nur Code, Konfiguration und Routinen-Anweisungen (`routine/*.md`). Schreiben: Nutzer/Claude lokal.
- `daten`: alle Laufzeitdaten (Ereignisprotokoll, Positionen, Signale, Lagebilder, Statistik, Lektionen, `termine.ics`). Schreiben: **nur** GitHub Actions (gemeinsame Concurrency-Gruppe `daten-schreiben`).
- `claude/lauf-<datum>-<typ>`: Ausgabe je Routinen-Lauf. Eine Action prüft gegen JSON-Schema, übernimmt nach `daten`, sendet Pushes, deployt, löscht den Branch.
- Routinen und Actions schreiben nie auf denselben Branch.

## Daten-Regeln
- Ereignisprotokoll nur anhängen, nie umschreiben oder löschen. Keine Order wird nachträglich geschönt.
- Ausführung ohne Rückschaufehler: vorgemerkte Käufe erst beim nächsten Kurscheck zum Briefkurs, Verkäufe zum Geldkurs.
- Rohdaten nicht committen, nur verdichtete Signale/Lagebilder; Rohdaten höchstens im Actions-Cache.
- Keine Geheimnisse ins Repo (öffentlich). VAPID-Private-Key, Push-Anmeldung, Routinen-Token, API-Schlüssel nur als GitHub-Secrets.
- Gebühren, Spreads, Steuern, Gewichtsgrenzen in `config/*.json`, nie hart codiert. Gebührenmodell überall: Smartbroker+ (`config/gebuehren-smartbroker.json`); `gebuehrenUmrechnen` rechnet jede Order damit (das Ereignisprotokoll enthält aus der Anfangszeit noch andere Entgelte – die werden beim Ableiten ersetzt, nie angezeigt).
- Zwei Ebenen (Plan „Datenkrake“, STAND.md oben): **Datenkrake/Schattenbuch** verfolgt alles virtuell und misst Trefferquoten; **Schaufenster** kauft nur das Beste mit 1.000 € je Order in zwei getrennten Bereichen (Kennzahlen nie vermischen): **Depot** (Smartbroker+, Krypto direkt Trade Republic) und **Daytrading** (Smartbroker+, Vergleich Trade Republic, vor Gebühren). Krypto direkt (24/7): Trade Republic 1 € + Spread. Autopilot (Code kauft selbst) nur für im Schattenbuch bewiesene Signaltypen.
- Jeder Kauf (Code und Claude) nur bei Chance ≥ 40 % und positivem Erwartungswert nach Gebühren; keine Pflicht-Orders.
- Hebel/Spielart datengetrieben: Varianten-Schattenbuch (`core/varianten.ts`, Daytrading `setupVarianten`) misst je Signal/Setup Richtung × Hebel × Haltedauer; Autopilot und Daytrading nutzen nur vorsichtig bewiesene Spielarten; Wunsch-Hebel (`plan.hebelWunsch`) bildet Turbos synthetisch nach.
- Seit S2: Teilverkäufe sind ein eigenes Ereignis `teilverkauft` (`verkauft` enthält dann nur den Rest, `ergebnis` alles); Krypto direkt = `anlageklasse: krypto`, Handelsplatz `TRK`, ohne ISIN, Bruchstücke; Verkaufsregeln/Autopilot/Claude-Order-Grenzen stehen in `config/einstellungen.json`.
- Seit S3: Daytrading ist ein eigener Bereich mit eigenem Protokoll `daytrading/ereignisse.jsonl` (nur anhängen) und eigener Config `config/daytrading.json`; Kennzahlen nie mit dem Depot mischen. Job `jobs/daytrading.ts` läuft als eigener Schritt im Kurswächter-Workflow. gettex-Dateinamen nennen das ENDE des 15-Minuten-Fensters.
- Seit S4: App hat 4 Bereiche (Heute · Depot · Daytrading · Lernen) + Einstellungen; alte Routen bleiben gültig. Marktphasen in `lernen/marktphasen.json`, Wochenzeugnis samstags vom Code, Monatsprüfung im Wochenrückblick am ersten Samstag, „Heute gelernt“ aus dem Abendlauf.
- Bestehende Datenquellen nie entfernen; neue nur zusätzlich einbauen.

## Konventionen
- Alles auf Deutsch (UI, Push, Berichte, README). Zahlen im deutschen Format, Zeiten in Europe/Berlin.
- Cron läuft in UTC: Sommer-/Winterzeit und deutsche Börsenfeiertage im Code prüfen.
- Pflichthinweis überall (Fußzeile, jeder Bericht): „Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.“
- Quellen-Module: einheitliche Schnittstelle, Zeitlimit, Wiederholversuch, Cache, Kontingentzähler; Tests nur mit aufgezeichneten Beispielantworten, nie echte Abrufe.
- Nutzungsbedingungen/robots.txt jeder Quelle beachten; Quellen, die automatisierten Abruf verbieten, nicht verwenden.

## Befehle
```bash
npm install
npm run dev
npm test
npm run build
npm run e2e
```

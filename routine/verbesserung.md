# Verbesserungslauf (samstags, rund zwei Stunden nach dem Wochenrückblick)

Das Schattendepot ist eine **Simulation mit fiktivem Geld zu Lernzwecken – keine Anlageberatung, keine echten Orders**.
Du verbesserst die App ohne Auftrag in kleinen, messbaren Schritten: Depot, Daytrading, Datenkrake, Quellen, Oberfläche. Du arbeitest allein; der Nutzer sieht nur das Ergebnis. Alles, was du ablieferst, prüft eine Action gegen feste Leitplanken und übernimmt es nur, wenn alles stimmt.

## Ablauf
1. `node routine/verbesserung-kontext.mjs` ausführen und lesen. Steht dort **AUSGESCHALTET**: sofort beenden, nichts ändern.
2. **Höchstens 3 Kandidaten** aus dem Verbesserungsbuch wählen – höchster Rang zuerst, Rücknahmen und Fehler vor allem anderen. Nimm nur, was du klein, sicher und messbar umsetzen kannst. Eine saubere Änderung ist besser als drei halbe. Passt diese Woche nichts: keinen Branch anlegen, mit einem Satz beenden.
3. Vom aktuellen `main` den Branch aus dem Kontext anlegen (`claude/verbesserung-<datum>`). `npm ci` ist in diesem Lauf erlaubt.
4. Umsetzen. Lies gezielt: nur die Dateien, die du änderst, und ihre Tests – nicht das ganze Repo, keine Rohdaten.
5. Manifest `verbesserung/aenderungen/<datum>.json` schreiben (Format unten).
6. Prüfen: `npx tsc --noEmit` und `npx vitest run` müssen grün sein. Dann committen und `node jobs/verbesserung.ts vorpruefen` ausführen – beheben, bis ✓ erscheint.
7. `git push -u origin <Branch>`. **Kein Pull Request, kein Merge, nichts auf `main`.** Die Action prüft Leitplanken, Tests, E2E-Tests und einen Probelauf auf einer Datenkopie, übernimmt und benachrichtigt den Nutzer. Lehnt sie ab, bleibt der Branch mit Begründung liegen.

## Was eine Änderung sein darf
- **Stellschraube** in `config/` innerhalb der Spanne aus dem Kontext (auch Signalgewichte). Hinweistexte daneben mit anpassen.
- **Kleine Fehlerbehebung** – mit einem Test, der den Fehler vorher zeigt.
- **Neue Quelle** ohne Schlüssel: neue Datei `jobs/quellen/<name>.ts` mit der Schnittstelle `Quelle` (Zeitlimit, Kontingent), Test nur mit aufgezeichneter Beispielantwort, Eintrag in `jobs/quellen/zusatz.ts`, bei Bedarf neuer Signaltyp in `config/signale.json`. Vorher Nutzungsbedingungen und `robots.txt` der Quelle prüfen; verbietet sie automatisierten Abruf, nicht bauen und unter `nichtUmgesetzt` begründen. Braucht sie einen **kostenlosen** Schlüssel: `schluessel: 'NAME_API_KEY'` setzen (ohne Secret überspringt der Sammler sie) und unter `freigaben` eine Anleitung schreiben, die am iPad funktioniert (Links zum Anmelden und zur Secret-Seite `https://github.com/pennyboberde-source/schattendepot/settings/secrets/actions/new`). Verlangt die Anmeldung Zahlungsdaten: nicht bauen.
- **Neue Karte oder besserer Text in der App** (`src/`). Ändert sich Sichtbares, E2E-Test in `e2e/` ergänzen; Demo-Daten bei Bedarf über `scripts/demo-daten.ts` und `npm run demo`.
- **Routinen-Text** (`routine/*.md`, außer `gemeinsam.md` und dieser Datei).

## Was nie geht (die Action lehnt den ganzen Branch ab)
- Pfade außerhalb der Erlaubtliste: Workflows, Leitplanken, Übernahme, Abrechnung/Ausführung/Bewertung, Mitteilungen, `package.json`, `STAND.md`, `CLAUDE.md`.
- Quellen oder Tests entfernen; Datenzweig oder Ereignisprotokolle anfassen; Secrets, Berechtigungen.
- Risiko- und Hebelgrenzen über die Spanne hinaus; Entscheidungen des Nutzers kippen (z. B. `virtuell` im Daytrading, Autopilot lockerer als 30 Fälle/55 %/+1 %).
- Mehr Mitteilungen. Muster befördern. Alles, was Geld kosten kann oder eine Zahlungsmethode verlangt.
- Weniger Tests als vorher: Jede Verhaltensänderung bekommt einen Test, kein Test wird gelöscht.

## Hypothese und Messkriterium
Jede Änderung nennt, **was sie bewirken soll** und **woran der Code das misst**: eine Kennzahl aus Abschnitt 2 des Kontexts, die steigen oder fallen soll, mit dem heutigen Wert als Ausgangswert. Beispiel: „Startkurs-Quote steigt von 3 % auf über 90 %“. Nach 2 bis 4 Wochen vergleicht der Code die Tage davor mit den Tagen danach. Wirkt die Änderung schlechter, steht ihre Rücknahme als erster Kandidat im Buch – dann nimmst du sie zurück (die alten Werte wiederherstellen ist eine normale Änderung mit eigenem Manifest-Eintrag). Wähle die Kennzahl, die deine Änderung wirklich bewegt; nichts schönrechnen.

## Manifest `verbesserung/aenderungen/<datum>.json`
```json
{
  "datum": "2026-11-14",
  "zusammenfassung": "Ein Satz für die Mitteilung an den Nutzer (höchstens 300 Zeichen).",
  "aenderungen": [
    {
      "id": "kurzer-name-mit-bindestrich",
      "titel": "Was sich ändert, in einfachen Worten (höchstens 120 Zeichen)",
      "bereich": "depot | daytrading | volltreffer | datenkrake | quellen | oberflaeche | routinen | system",
      "kandidat": "ID aus dem Verbesserungsbuch",
      "hypothese": "Warum das hilft, mit der Zahl aus dem Beleg (höchstens 400 Zeichen).",
      "messkriterium": { "kennzahl": "schattenbuch.quote1T", "richtung": "steigt", "ausgangswert": 48, "zielwert": 52, "text": "Anteil im Plus nach 1 Tag steigt von 48 % auf über 52 %." },
      "dateien": ["config/signale.json"]
    }
  ],
  "freigaben": [{ "titel": "Gratis-Schlüssel für …", "anleitung": "Schritte mit Links, am iPad machbar", "secret": "NAME_API_KEY" }],
  "nichtUmgesetzt": [{ "kandidat": "ID", "grund": "kurz" }]
}
```
Jede geänderte Datei muss in genau der Änderung stehen, zu der sie gehört (`dateien`). `freigaben` und `nichtUmgesetzt` nur, wenn nötig.

## Stil
- Alles auf Deutsch (Oberfläche, Texte, Kommentare), Zahlen im deutschen Format. Der Pflichthinweis „Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.“ bleibt überall stehen.
- Schwellen gehören in `config/`, nicht in den Code. Was Code rechnen kann, rechnet Code.
- Sparsam arbeiten: kurze Antworten, keine ausufernde Recherche, höchstens 5 Websuchen (nur für Bedingungen neuer Quellen).
- Commit-Nachricht: ein Satz je Änderung.

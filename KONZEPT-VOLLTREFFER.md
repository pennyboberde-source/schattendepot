# Bauauftrag „Volltreffer“ für Schattendepot

Stand 11.11.2026. Dieser Auftrag ist vollständig, du brauchst kein weiteres Dokument. Es bleibt eine Simulation mit fiktivem Geld, keine Anlageberatung.

## 0. So gehst du vor

1. Lies STAND.md und CLAUDE.md. Alle Regeln daraus gelten weiter, Abschnitt 6 fasst sie zusammen.
2. Speichere diesen Auftrag unverändert als `KONZEPT-VOLLTREFFER.md` im Wurzelordner und committe ihn. Setze in STAND.md ganz oben den Abschnitt „GÜLTIGER PLAN Volltreffer (Nutzer 11.11.2026)“ mit Verweis auf die Datei und dem Stand der Meilensteine. Ergänze CLAUDE.md um eine Zeile dazu. Danach genügt in jeder neuen Sitzung „Lies STAND.md und mach weiter“.
3. Prüfe die Befunde aus Abschnitt 2 kurz gegen den aktuellen Stand von `main` und `daten`. Weicht etwas ab, gilt der aktuelle Stand; notiere die Abweichung in STAND.md.
4. Schicke mir sofort gebündelt die Freigaben F1 bis F3 aus Abschnitt 7, damit ich sie parallel erledigen kann. V0 braucht keine Freigabe, warte also nicht darauf.
5. Baue V0. Halte nach jedem Meilenstein an: Tests grün, Probelauf auf einer Datenkopie, STAND.md aktuell, kurzer Bericht (gebaut, gemessen, offen, nächster Schritt). Dann wartest du auf mein „weiter“. Schreibe ich „durchlaufen“, arbeitest du ohne Halt weiter, bis du eine Freigabe von mir brauchst.

## 1. Ziel und Entscheidungen

Ziel: Die Datenkrake soll binnen Wochen Signale erkennen, die einem großen Kurssprung vorausgehen, der in der Simulation nutzbar ist. Maßstab ist der Volltreffer: mindestens 400 € netto aus einer 1.000-€-Order, in allen Anlageklassen (Aktien, ETFs, Hebelprodukte, Krypto).

Vom Nutzer am 11.11.2026 entschieden:

- Es gibt einen eigenen dritten Bereich „Volltreffer“ neben Depot und Daytrading, mit eigenen Kennzahlen. Er startet rein virtuell. Sichtbar mit 1.000 € gekauft wird erst, was Rückblick und Vorwärtstest bestanden hat.
- Belegte Verlustbringer laufen nur noch virtuell: Daytrading-Turbos, Short-Ausbrüche, Krypto-Daytrading und der Autopilot auf `gewinn_ueberraschung`. Nichts wird gelöscht.
- Gelernt wird an allen Märkten. Als Treffer und als Order zählt nur, was bei Smartbroker+/gettex oder Trade Republic handelbar ist, mit echtem Spread.
- Nutzer 12.11.2026: Die App verbessert sich ohne Auftrag laufend selbst, in kleinen Schritten und in allen Bereichen. Verbesserungen gehen automatisch live, aber nur innerhalb von Leitplanken (Meilenstein VS, direkt nach V0).

Leitidee:

- Rückwärts lernen. Die Frage lautet nicht mehr „was wurde aus dem Signal“, sondern „was war vor dem Sprung bekannt, und wie oft gab es dasselbe ohne Sprung“.
- Zwei Stufen. Die Lauerliste sagt voraus, wo ein großer Sprung wahrscheinlich ist. Der Auslöser kauft erst, wenn der Markt die Richtung zeigt. Die Monatsprüfung 2026-11 belegt: Vorboten kündigen Schwankung an, keine Richtung.
- Kleine feste Verluste, laufende Gewinne. 400 € Ziel bei 150 € Risiko rechnen sich ab 27 % Treffern.

## 2. Befunde aus den Live-Daten (Datenzweig, 11.11.2026, 15:54 Uhr)

1. Schattenbuch ohne Startkurse. 324 von 519 Tageskandidaten haben kein `start`. Vom 03. bis 11.11. bekamen 50 von 1.675 Werten mit Signal einen Startkurs. Ursache in `jobs/lib/tracking.ts › trackingAktualisieren`: Die Schritte 0 bis 2 (Nachmessungen) verbrauchen `tracking.maxAbrufeProLauf` (60), bevor Schritt 3a die neuen Kandidaten aufnimmt. Einträge ohne `start` werden nie mehr gemessen.
2. Kurse kommen einzeln je Wert (`jobs/kurse/anbieter.ts › holeKurs`). Das reicht nicht für 200 bis 360 Signale am Tag.
3. Es gibt nur Messpunkte (`r1h`, `r1T`, `r3T`, `r1W`, `r10T`, `r1M`), keine Hochs und Tiefs. `core/varianten.ts` schätzt Knock-outs deshalb über `koPuffer`.
4. Der Startkurs ist meist der Vortagesschluss. 265 von 289 Startkursen wurden vor 10 Uhr deutscher Zeit gezogen, 194 von 229 `r1h`-Werten sind exakt 0. Kurslücken zur Eröffnung zählen damit als Ergebnis, obwohl sie niemand handeln kann.
5. Fallzahlen sind zu hoch ausgewiesen. `core/statistik.ts` (um Zeile 277) schreibt `n=${v.anzahl}` neben `oe1W`; `anzahl` zählt auch ungemessene Einträge. Beispiel: „handelsstopp 47,11 % (n=32)“ beruht auf 4 Messungen. Außerdem steht derselbe Wert mehrfach im Buch (322 Messungen, 188 Werte).
6. Verwechslungen. `core/signale.ts › wertpapierSchluessel` bildet `T:<KÜRZEL>` ohne Markt. Die Aktie ZETA erbt Upbit-Warnungen des Coins ZETA, INTC lief am 30.10. als `markt: krypto`. `verwaesserung:BRK-A` zeigt, dass der Großkonzern-Filter Kürzel mit Klassenzusatz nicht erkennt.
7. Hot Stuff (`core/datenkrake.ts › hotStuff` und `vorlaufFortschreiben`) speichert keine Größe des Sprungs, sieht nur Top-Listen (14 bis 46 Werte am Tag) und zählt als Vorzeichen auch Signale, die erst der erste Sprung ausgelöst hat.
8. Das Schaufenster kann 400 € nicht erreichen. Der Autopilot hat Ziel +6 % und Stop −6 %, dazu Nachziehstop ab +4 % und Teilverkauf auf halbem Weg. Beste Depot-Order bisher +92,53 €, 1 von 431 Daytrades über 400 €, Daytrading gesamt −3.413 €.
9. Nur 85 von 2.906 Signalen tragen eine ISIN. Die Handelbarkeit auf gettex ist für fast kein Signal geklärt.

## 3. Was „Volltreffer“ genau heißt

Rechne mit dem Kostenmodell des Projekts (`core/rendite.ts`, `core/gebuehren.ts`, `config/spreads.json`). Richtwerte bei 10 Handelstagen Haltedauer: Direkt braucht der Basiswert +40,2 % (großer Wert), +40,8 % (Nebenwert), +44,3 % (spekulativ) oder +40,9 % (Krypto direkt). Mit Turbo sind es +20,7 % bei Hebel 2, +13,9 % bei Hebel 3, +8,4 % bei Hebel 5 und +4,3 % bei Hebel 10; der Knock-out liegt bei −50 %, −33 %, −20 % und −10 %.

Das Etikett wird je Wert, Tag und Spielart berechnet:

- Einstieg: erster handelbarer Kurs nach dem Stichtag, bei Tagesdaten die Eröffnung des Folgetags, mit Spread.
- Spielarten: direkt oder Turbo mit Hebel 2, 3, 5, 10. Long immer, short nur über Turbos. Fenster von 1, 3, 5, 10 und 21 Handelstagen. Stop bei 100, 150 oder 250 € Verlust.
- Ausgang über Tageshoch und Tagestief: Treffer (Ziel zuerst erreicht), Niete (Stop oder Knock-out zuerst), Zeitablauf (Verkauf zum Schluss des letzten Tags). Liegen Ziel und Stop am selben Tag, zählt der Stop. Eröffnet der Kurs jenseits des Stops, gilt der Eröffnungskurs.
- Gespeichert wird immer auch das Ergebnis in Euro, damit der Erwartungswert direkt folgt.
- Beinahe-Treffer zählen ab 200 €.
- Episode: Ein Sprung beginnt am ersten Treffer-Tag nach mindestens 10 Handelstagen ohne Treffer. Als Vorzeichen zählt nur, was vor diesem Tag öffentlich war.

## 4. Meilensteine

Jeder Meilenstein endet mit Halt. „Fertig, wenn“ ist die Abnahme. Alle genannten Schwellen sind Startwerte und gehören in die Config.

### V0 Aufräumen (keine Freigabe nötig)

- Schattenbuch entstopfen. Neue Kandidaten bekommen ihren Startkurs vor den Nachmessungen und ein eigenes Kontingent. Heutige Einträge ohne `start` werden am selben Handelstag nachgeholt, nie später.
- `r1h` nur messen, wenn der Markt des Werts bei Start und Messung offen war.
- Ehrliche Fallzahlen. n ist die Zahl der Messungen des jeweiligen Horizonts: in `statistik.zusammenfassung`, in den Lernhinweisen, im Kontext der Routinen und in der App. Ein Wert zählt je Episode einmal (gleicher Schlüssel binnen 10 Handelstagen). Neben dem Durchschnitt steht der Median.
- Verlustbringer virtuell. Daytrading-Trades mit Instrument Turbo, mit Richtung short oder im Markt Krypto werden weiter simuliert und getrennt ausgewertet. Sie zählen aber nicht mehr in sichtbare Kennzahlen, Abendbilanz, Wochenzeugnis und Mitteilungen. Der Schalter liegt in `config/daytrading.json`, die Ereignisse tragen ein Kennzeichen, das Protokoll bleibt nur zum Anhängen.
- Autopilot. Die Beweisschwelle folgt Vorschlag 1 der Monatsprüfung: mindestens 30 Fälle, mindestens 55 % im Plus, Ø nach Gebühren mindestens +1 %. `gewinn_ueberraschung` gilt damit nicht mehr als bewiesen.
- Kleinigkeit: Großkonzern-Filter der Verwässerung für Kürzel mit Klassenzusatz (BRK-A) reparieren.
- Fertig, wenn im Probelauf mindestens 95 % der Tageskandidaten einen Startkurs haben, „handelsstopp“ mit richtigem n erscheint, die sichtbare Daytrading-Bilanz die virtuellen Gruppen ausschließt und alle Tests grün sind.

### VS Selbstverbesserung (direkt nach V0, keine Freigabe nötig)

Die App soll sich jede Woche ohne Auftrag in kleinen Schritten verbessern: Depot, Daytrading, Volltreffer, Datenkrake, Quellen und Oberfläche. Grundlage sind Wochenbericht, Wochenzeugnis und die übrigen Lerndaten.

- Verbesserungsbuch. Der Code sammelt täglich Kandidaten in `lernen/verbesserung/kandidaten.json`: Vorschläge aus Monatsprüfung und Wochenrückblick, schwache Fächer im Wochenzeugnis, Lernhinweise, Quellen mit Ausfällen oder ohne Signale, offene Fehler-Issues, zurückgestufte Muster, Ideen für neue Quellen. Jeder Kandidat nennt Bereich, Beleg mit Zahlen und einen Rang nach erwartetem Nutzen. Claude liest nur diese Liste, nicht das ganze Repo.
- Verbesserungslauf. Neue Routine samstags rund zwei Stunden nach dem Wochenrückblick, angelegt per RemoteTrigger wie die bestehenden (gleiche Umgebung, Modell und Konnektoren; cron in UTC, Sommer- und Winterzeit beachten). Sie liest STAND.md, Wochenbericht, Wochenzeugnis und Verbesserungsbuch, wählt höchstens 3 Kandidaten und setzt sie auf dem Branch `claude/verbesserung-<datum>` um. Jede Änderung trägt eine Hypothese und ein Messkriterium, zum Beispiel „Startkurs-Quote steigt von 3 % auf über 90 %“.
- Leitplanken in `config/verbesserung.json`. Der Lauf darf diese Datei nie ändern.
    - Erlaubt: Stellschrauben in `config/` innerhalb festgelegter Spannen, Signalgewichte, kleine Fehlerbehebungen, neue Quellen-Module in neuen Dateien, neue Karten und Texte in der App, Tests, Routinen-Texte.
    - Verboten: Quellen entfernen; Datenzweig und Ereignisprotokolle anfassen; Workflows, Secrets und Berechtigungen ändern; die Leitplanken und die Übernahme-Actions ändern; Risiko- und Hebelgrenzen über die Spanne hinaus; mehr Mitteilungen; Muster befördern (bleibt bei F4); alles, was Geld kosten kann.
    - Umfang: höchstens 3 Änderungen und 400 geänderte Zeilen je Woche, nur Pfade aus der Erlaubtliste.
- Automatische Übernahme. Eine neue Action reagiert nur auf `claude/verbesserung-*`. Sie prüft Pfade und Umfang gegen die Leitplanken, führt `tsc`, Unit- und E2E-Tests sowie einen Probelauf von Sammler und Wächter auf einer Datenkopie aus, setzt den Branch auf den aktuellen `main` und führt zusammen. Danach startet sie den Deploy ausdrücklich, weil Pushes mit dem GITHUB_TOKEN keine anderen Workflows auslösen. Fällt etwas durch oder gibt es Konflikte mit einer Bau-Sitzung, bleibt ein Pull Request mit Begründung offen, und ich bekomme eine Mitteilung.
- Kontrolle. Jede Übernahme landet in `lernen/verbesserung/protokoll.jsonl` (nur anhängen) mit Commit, Hypothese und Messkriterium. Ich bekomme die Mitteilung „🛠️ Verbesserung“ mit kurzer Liste und einem Link, der die Änderung über einen Revert-Workflow rückgängig macht. Nach 2 bis 4 Wochen bewertet der Code das Messkriterium. Wirkt eine Änderung schlechter, steht ihr Revert im nächsten Lauf als erster Kandidat. Fallen nach einer Übernahme zwei Sammler- oder Wächterläufe in Folge aus, nimmt die Action die Änderung selbst zurück.
- Neue Quellen. Quellen ohne Schlüssel baut der Lauf selbst ein, nachdem er Bedingungen und robots.txt geprüft hat. Braucht eine Quelle einen Gratis-Schlüssel, baut er sie so, dass sie ohne Secret übersprungen wird, und schickt mir die Anmeldung als 🔴❗-Freigabe mit iPad-Anleitung und Push. Konten anlegen und Secrets setzen mache ich selbst. Zahlungspflichtiges nie.
- Schalter `aktiv` und Wochenbudget stehen in `config/verbesserung.json`. Wochenzeugnis und App (Bereich Lernen) zeigen „Was sich verbessert hat“.
- Verbrauch: ein Lauf je Woche. Miss den Verbrauch der ersten zwei Läufe und trage ihn in STAND.md ein. Ist er hoch, wähle weniger Kandidaten.
- Fertig, wenn ein Probelauf der Routine einen Branch erzeugt, die Action ihn prüft und übernimmt, die Mitteilung mit Rückgängig-Link ankommt und ein absichtlich verbotener Pfad abgelehnt wird.

### V1 Fundament (braucht F1 und F2)

- Sammelkurse statt Einzelabruf, je Markt ein Abruf für alle Werte:
    - gettex: Tageskerzen je ISIN (Eröffnung, Hoch, Tief, Schluss, Stück, Umsatz, Zahl der Geschäfte) aus allen 15-Minuten-Dateien des Tages, beide Segmente. Die Bausteine stehen in `jobs/kurse/gettex.ts` (`gettexDateiliste`, `gettexDateiLaden`, `geschaefteAusCsv`). Die Dateien sind nur mindestens 24 Stunden abrufbar, also täglich nach Handelsschluss holen und am Morgen nachfassen.
    - US: Massive (früher Polygon.io), Gratis-Tarif Basic, Sammelabruf `/v2/aggs/grouped/locale/us/market/stocks/{datum}`. Geprüft am 11.11.2026: 5 Abrufe je Minute, nur Tagesschlussdaten, der Vortag ist ab Mitternacht US-Ostküstenzeit abrufbar, der laufende Tag liefert 403. Prüfe Host, Bedingungen und Kursbereinigung in der aktuellen Doku. Ausweichquelle ist Alpaca mit Papierkonto (200 Abrufe je Minute, Daten seit 2016).
    - Krypto: Sammelabruf aller Paare bei Kraken, Tageskerzen über Kraken OHLC. CoinGecko-Demo (10.000 Abrufe im Monat, `COINGECKO_API_KEY` ist in `sammler.yml` schon vorgesehen) nur für Börsenwert und Coins, die Kraken nicht führt. Binance meiden: Die API antwortet aus gesperrten Regionen mit Fehler 451, nach Berichten auch aus US-Rechenzentren.
- Privates Archiv. Rohkurse und alles, was sich daraus zurückrechnen lässt, liegen im privaten Repo `schattendepot-archiv` (Secret `ARCHIV_TOKEN`): komprimierte Tagesdateien, nur zum Anhängen, eigene Concurrency-Gruppe. Grund: gettex gestattet die verzögerten Daten nur zur privaten Nutzung ohne Weitergabe. Ins öffentliche Repo kommen nur verdichtete Ergebnisse (Prozentwerte, Ränge, Zählungen), keine Kursreihen. Prüfe dabei, ob `kurse.json`, `schlusskurse.json` und `verlauf/` im Datenzweig damit vereinbar sind, und schlage mir eine Lösung vor.
- Schattenbuch auf Sammelkurse umstellen. Startkurs ist der erste handelbare Kurs nach dem Signal. Gemessen werden Schlusskurse sowie höchster und tiefster Stand seit dem Start. Bestehende Felder bleiben, neue kommen dazu.
- Stammdaten. Eine Tabelle führt ISIN, Kürzel, Markt, Art (Aktie, ETF, Hebelprodukt, Coin) und Name; OpenFIGI-Ergebnisse werden gecacht (`daytrading/isin-info.json` gibt es schon). Der Wertpapier-Schlüssel unterscheidet künftig Aktie und Coin, alte Schlüssel bleiben über eine Abbildung lesbar. Aktiensplits und Zusammenlegungen werden als Ereignis geführt statt als Sprung gemessen.
- Handelbarkeits-Karte. Handelbar ist, was an mindestens 10 der letzten 20 Handelstage auf gettex Umsatz hatte, mit geschätztem Spread je Wert. gettex bietet auch verzögerte Vorhandelsdaten; nutze sie, wenn Format und Größe es erlauben. Dazu kommen eine Liste der Basiswerte mit Turbos und eine gepflegte Liste der Coins bei Trade Republic in `config/`.
- Vergleichsgruppe. Jede Rendite steht zusätzlich als Überrendite gegen den Markt und gegen Werte gleicher Größenklasse am selben Tag.
- Fertig, wenn drei Tage in Folge Archivdateien für gettex, US und Krypto vorliegen, das Schattenbuch für Messungen keine Einzelabrufe mehr braucht, mindestens 90 % der Werte mit Signal und Kurs gemessen werden und ein Test die Verwechslung ZETA abdeckt.

### V2 Zensus

- Volltreffer-Etikett nach Abschnitt 3 als reine, getestete Funktionen in `core/volltreffer/`. Pflichttest gegen Rückschaufehler: Eine absichtlich veränderte Zukunftskerze darf kein Merkmal und keinen Einstieg ändern.
- Sprung-Zensus. Täglich alle Episoden des ganzen Markts mit Größe, Dauer, Umsatz, Handelbarkeit und bester Spielart. Hot Stuff bleibt bestehen und bekommt die Größe des Sprungs.
- Merkmale zum Stichtag. Aus Kerzen: Rendite über 1, 5 und 20 Tage, relatives Volumen, Spanne heute gegen 20 Tage, Abstand zum 20- und 250-Tage-Hoch, Lage des Schlusskurses in der Tagesspanne, Kurslücke, Kurs- und Umsatzklasse. Aus `signale/tag/`: Typ, Alter in Tagen, Stärke, Zahl der Quellen. Dazu Termine in den nächsten 10 Tagen, Marktphase und Politik-Risiko. Kerzen-Merkmale werden nicht gespeichert, sondern bei Bedarf neu berechnet. Eingefroren werden nur Fälle: Volltreffer, Beinahe-Treffer und Einträge der Lauerliste.
- Trefferbuch in der App (Bereich Lernen): je Tag die handelbaren Volltreffer mit dem, was vorher bekannt war.
- Fertig, wenn der Zensus täglich läuft, das Trefferbuch sichtbar ist und die Vorzeichen nur Daten vor Episodenbeginn enthalten.

### V3 Rückblick und Musterprüfung

- Rückblick-Archiv. Lade die Kursgeschichte, die der Gratis-Tarif hergibt (nach meinem Stand zwei Jahre, bitte prüfen), per `workflow_dispatch`, fortsetzbar und mit Pause zwischen den Abrufen. Zwei Jahre US sind rund 500 Abrufe, also unter zwei Stunden. Krypto kommt über Kraken OHLC. Signale, Nachrichten, Reddit, Upbit und gettex gibt es rückwirkend nicht; diese Merkmale lernen nur vorwärts ab dem 28.10.2026.
- Hypothesen-Buch `lernen/muster/hypothesen.json`, nur zum Anhängen: Nummer, Definition als Code-Regel, Datum, Status (Idee, Rückblick bestanden, Vorwärtstest, befördert, verworfen). Erst eintragen, dann testen.
- Starthypothesen. Was Signale braucht, die es rückwirkend nicht gibt, wird im Rückblick als Kerzen-Variante geprüft und läuft sonst nur vorwärts.
    - C1 Fortsetzung nach hartem Anlass: Nebenwert mit Zahlen plus Prognoseanhebung, Zulassung oder Großauftrag; Schluss nahe Tageshoch bei mindestens fünffachem Umsatz. Auslöser: Tag 2 schließt über dem Hoch von Tag 1.
    - C2 Mehrfach-Handelsstopp: Stopps an 3 Tagen oder ungewöhnlicher Umsatz ohne Nachricht (Lektionen 14 und 20). Auslöser: Ausbruch über das Hoch des Stopp-Tags. Kleine Position.
    - C3 Squeeze-Aufstellung: hohe Leerverkaufsquote, wenig Streubesitz, Kurs dreht mit Umsatz. Auslöser: neues 20-Tage-Hoch.
    - C4 Anlauf vor Termin: Termin in 5 bis 15 Tagen bei einem Wert mit großen früheren Reaktionen. Verkauf vor dem Termin.
    - C5 Themen-Ansteckung: mindestens 3 Werte eines Themas steigen am selben Tag über 15 %. Auslöser: Ein Nachzügler desselben Themas zieht mit Umsatz an.
    - C6 Hebel auf Standardwerte: enge Schwankung, dann Anlass (Zahlen, Prognose, Politik-Thema). Auslöser: Schluss auf neuem 20-Tage-Hoch. Turbo mit Hebel 3 bis 5.
    - C7 Krypto-Ausbruch: Coin der Trade-Republic-Liste in mehrwöchiger Spanne, Funding nicht überhitzt. Auslöser: Ausbruch mit dreifachem Umsatz.
    - C8 Krypto-Gegenbewegung: Liquidations-Spitze plus Funding-Extrem bei Bitcoin oder Ether. Auslöser: erste Stundenkerze gegen den Ausverkauf. Turbo oder ETN.
    - C9 Rückprall nach Ausverkauf: Tagesverlust ab 25 % ohne Verwässerungs- oder Insolvenzmeldung. Auslöser: erster Tag mit höherem Schluss.
    - C10 Kontrollmuster: Tagesgewinner ohne Auslöser-Regel, als Vergleich.
- Musterprüfung. Je Hypothese und zusätzlich je Einzelmerkmal und Zweierkombination: Fälle, Grundrate, Trefferanteil, Lift, Erfassung, Erwartungswert in Euro je Order nach Kosten und beste Spielart, jeweils mit Unsicherheitsband. Bestanden hat nur, was in zwei getrennten Zeiträumen je mindestens 100 Fälle und einen Erwartungswert über null zeigt. Die Rangfolge richtet sich nach dem schwächeren der beiden Zeiträume abzüglich eines Standardfehlers. Gewertet werden nur Werte mit ausreichend Umsatz am Vortag; die Handelbarkeit folgt der heutigen Karte und ist als Näherung gekennzeichnet.
- Ergebnis öffentlich und verdichtet in `lernen/muster/rangliste.json` und in der App unter Lernen. Dazu ein Bericht an mich in einfachen Worten, auch wenn kein Muster besteht.
- Fertig, wenn der Rückblick durchgelaufen ist, die Rangliste steht und der Bericht vorliegt.

### V4 Bereich Volltreffer, virtuell

- Eigene Config `config/volltreffer.json` mit diesen Startwerten: Verlust je Order 150 €. Kein Teilverkauf und kein Nachziehstop vor +200 €, danach sichert der Stop die Hälfte des Gewinns. Höchstens 5 offene Jagden und höchstens 2 je Thema. Tagesverlustgrenze 450 €. Lauerliste mit höchstens 40 Werten. Verfall nach 3 Handelstagen ohne Auslöser. Keine Fälle mit Pump-Verdacht, nur handelbare Werte. Die Regeln des Depots bleiben unberührt.
- Lauerliste täglich aus den Mustern im Vorwärtstest und den beförderten Mustern. Jeder Eintrag nennt Muster, Grundrate und ähnliche Fälle.
- Auslöser. Gekauft wird erst, wenn der Markt die Richtung zeigt, zum Beispiel wenn eine Kerze über dem Vortageshoch schließt. Nutze Kerzen und Ausbruchslogik aus `core/daytrading/kern.ts`. Einstieg zum nächsten Kurs, kein Rückschaufehler.
- Spielart je Muster aus dem Rückblick (direkt oder Hebel, Stop, Haltedauer). Hebel nur, wenn „Ziel vor Stop“ belegt ist.
- Eigenes Protokoll `volltreffer/ereignisse.jsonl`, nur zum Anhängen, abgeleitet `volltreffer/uebersicht.json`. Kennzahlen: Volltreffer-Quote, Ø Verlust der Nieten, Erwartungswert je Order, Erfassung und Präzision der Lauerliste.
- App: fünfter Bereich „Volltreffer“ mit Lauerliste, laufenden Jagden und Trefferbuch. Virtuelle Jagden erscheinen nur in der Abendbilanz, nicht als Einzelmitteilung.
- Fertig, wenn ein Probelauf mit echten Daten Lauerliste, Auslöser und Ausstieg durchspielt und der Bereich in der App steht.

### V5 Claudes Teil (ohne neue Läufe)

- Morgenlauf: Claude bewertet die 10 obersten Werte der Lauerliste mit hartem Anlass ja oder nein, Richtung, Werbeverdacht und einem Satz Begründung. Das Urteil wird als Merkmal gespeichert und später gemessen. Die Tagesprognose wird auf diese Werte umgestellt.
- Wochenrückblick: Obduktion von bis zu 10 handelbaren Volltreffern der Woche. Ursache aus fester Liste (Zahlen, Prognose, Zulassung, Auftrag, Übernahme, Squeeze, Thema, Werbung, Listing, unbekannt), terminiert oder überraschend, erste öffentliche Spur mit Zeit und Link.
- Monatsprüfung: drei bis fünf neue Hypothesen für das Hypothesen-Buch.
- Schema, `routine/*.md` und `routine/kontext.mjs` anpassen. Der Kontext wächst um höchstens eine Seite. Claude rechnet keine Statistik.
- Wochenzeugnis: neue Fächer Erfassung und Präzision.
- Fertig, wenn ein Trockenlauf je Routine das Schema besteht.

### V6 Beförderung (braucht F4)

- Leiter. Stufe 1: Rückblick bestanden. Stufe 2: Vorwärtstest virtuell mit mindestens 20 Fällen und einem Ergebnis im Band des Rückblicks. Stufe 3: sichtbar mit 1.000 € je Order im Bereich Volltreffer, mit Einzelmitteilungen. Wer die Werte verfehlt, wird automatisch zurückgestuft.
- Erreicht ein Muster Stufe 2, bekomme ich eine Mitteilung mit den Zahlen. Befördert wird erst nach meinem Ja.

## 5. Abnahme und Qualität

- Vor jedem Commit auf `main` sind `npx tsc --noEmit` und `npx vitest run` grün, bei Änderungen an der App zusätzlich die E2E-Tests.
- Probeläufe laufen auf einer Kopie des Datenzweigs (`DATEN_DIR`), nie auf den Live-Daten.
- Tests arbeiten nur mit aufgezeichneten Antworten, nie mit echten Abrufen.
- Nach dem Deploy prüfst du den ersten echten Lauf in den Actions-Logs und nennst das Ergebnis im Bericht.

## 6. Regeln (aus CLAUDE.md und STAND.md, unverändert gültig)

- Das System ist live. Jede Änderung an `main` wird sofort ausgerollt.
- Daten nie verlieren: Datenzweig nur über Actions, Protokolle nur anhängen, neue Funktionen in neue Dateien, Formate abwärtskompatibel.
- Keine bestehende Quelle entfernen.
- 0 €: nichts einrichten, das Geld kosten kann oder Zahlungsdaten verlangt.
- Keine Geheimnisse und keine persönlichen Angaben ins Repo oder in den Chat.
- Bedingungen und robots.txt jeder neuen Quelle vor dem Einbau prüfen.
- Alles, was Code kann, macht Code. Claude urteilt nur.
- Nutzungslimit schonen: gezielt lesen, keine breite Recherche, aufwendige Schritte vorher ankündigen.
- Alles auf Deutsch, der Pflichthinweis steht überall.

## 7. Freigaben, die du bei mir anforderst

Gebündelt, jede Zeile mit 🔴❗, iPad-tauglich mit Links, dazu eine Push-Benachrichtigung.

- F1 vor V1: Gratis-Konto bei Massive (Tarif Basic) und Secret `MASSIVE_API_KEY`. Verlangt die Anmeldung Zahlungsdaten, breche ich ab und du nimmst Alpaca.
- F2 vor V1: privates Repo `schattendepot-archiv` und ein Zugriffstoken nur für dieses Repo mit Schreibrecht auf Inhalte, als Secret `ARCHIV_TOKEN`. Das private Repo kostet nichts, die Actions laufen weiter im öffentlichen Repo.
- F3 optional: `COINGECKO_API_KEY` (Demo-Tarif) und `OPENFIGI_API_KEY`.
- F4 bei V6: mein Ja je Muster.

## 8. Was du nicht tust

- Keine sichtbaren Volltreffer-Orders vor V6.
- Keine weiteren Claude-Routinen außer dem wöchentlichen Verbesserungslauf aus VS.
- Keine Rohkurse ins öffentliche Repo.
- Keine Historie umschreiben, kein Force-Push.
- Nichts schönrechnen. Besteht kein Muster, steht das so im Bericht.

Beginne jetzt mit Schritt 0.

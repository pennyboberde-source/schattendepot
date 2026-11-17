# Konzept Früherkennung – große Sprünge ohne Hebel, Pennystocks, Frühwarnsignale

_Stand 17.11.2026 abends. Anlass: Fallliste des Nutzers (Viking, Oracle, Intel, Rüstung, Bitcoin, Übernahmen, GameStop, Silber, UnitedHealth) und Frage nach Pennystocks. Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung._

## 1. Was das Schattendepot heute erkennen kann

Ein „hebelfreier Volltreffer“ heißt: +400 € aus 1.000 € ohne Hebel, also rund **+40 % nach Kosten**, im Fenster 1, 3, 5, 10 oder 21 Handelstage.

| Fall | Im Rückblick abgedeckt? | Vorhandene Merkmale/Signale, die gepasst hätten | Lücke |
|---|---|---|---|
| Viking 27.02.2024 | **Nein** – US-Geschichte erst ab 15.11.2024 | r20/Abstand Hoch (Kurs vorher verdoppelt), Branche, Umsatz | Studien-Termine (klinische Daten), Gerüchte |
| Oracle 10.09.2025 | Ja (US) | Quartalszahlen-Termin (`zahlen`), Nachzahlen-Drift | Inhalt war Überraschung – vorher nicht erkennbar; +36 % am Tag reicht ohne Hebel knapp nicht |
| Intel Aug.–Sep. 2025 | Ja (US) | 8-K Vertrag (`vertrag`), Großaktionär 13D (`grossaktionaer`), Fenster 21 Tage | Staatsbeteiligung als eigenes Ereignis, 13F/13G großer Investoren |
| Rüstung Feb.–März 2025 | **Nein** – EU-Werte haben keine Kursgeschichte (gettex erst ab 14.11.2026) | Politik-Radar (Themen, Wahrscheinlichkeiten) | EU-Kursgeschichte, Themenkörbe (Rüstung, Infrastruktur) |
| Bitcoin Nov. 2024 | Teilweise (Kraken ab 25.11.2024, Coinbase ab 15.11.2024) | Politik-Radar (`politik_wahrscheinlichkeit`), Krypto-Umfeld (Angst, Stablecoins) | Wahl-Szenarien → betroffene Werte |
| Übernahmen (Klöckner, Netfonds, Polypeptide) | US ja (13D, 8-K 1.01), EU **nein** | `uebernahmeangebot`, `grossaktionaer`, `vertrag` | EU-Kurse, Fusions-Meldungen (425, SC TO, DEFM14A), ungewöhnliche Optionskäufe |
| GameStop Jan. 2021 | **Nein** – vor dem Fenster | Leerverkaufsbestand (`bestandTage`, `bestandAenderung`), Leerverkaufsquote, Großaktionär | Streubesitz/Float, Reg-SHO-Schwellenliste, Fails-to-Deliver |
| Silber Jan. 2026 | Nur über US-ETFs (SLV, Minen-ETFs), nicht als Rohstoff | Politik-Radar (Exportbeschränkung), r20/r250-Trend | Rohstoffe als eigener Markt im Rückblick |
| UnitedHealth Aug. 2025 | Ja (US) | Insider-Käufe (`insider`), Abstand Jahreshoch, Großaktionär | 13F (Berkshire-Einstieg wurde über 13F bekannt), Bewertung (KGV) |

**Ehrlich:** Von den neun Fällen liegen nur Oracle, Intel und UnitedHealth vollständig im Rückblick, dazu Silber über ETFs und Bitcoin/Coinbase teilweise. Ob das System sie **vorher** erkannt hätte, ist nicht gemessen – nur, dass es die Sprünge als Volltreffer im Zensus zählt.

## 2. Pennystocks

Heute ausgeschlossen: Aktien unter 1 $ und alle OTC-Werte (`config/volltreffer.json › handelbar.aktie.mindestKurs`, ohne OTC). Im US-Archiv stecken täglich rund 4.200 OTC-Werte, sie werden nur nicht ausgewertet.

- **Warum interessant:** Die Grundrate großer Sprünge ist um ein Vielfaches höher als bei Standardwerten.
- **Warum gefährlich:** Spreads von 2 bis 10 %, laufende Verwässerung (S-1/424B), Pump-and-Dump. Die eigenen Daten zeigen: Nach einer „Kursrakete“ liegt der Wert eine Woche später im Median 14 % tiefer. Viele OTC-Werte sind von Deutschland aus kaum handelbar.
- **Vorhandene Frühwarnsignale:** ungewöhnlicher Umsatz ohne Kursbewegung, Handelsstopps, SEC-Meldungen (Kapitalerhöhung, Registrierung, Warnungen 3.01, Satzung/Reverse Split 5.03), Social-Stimmung, Leerverkaufsquote und -bestand, Pump-Verdacht.
- **Fehlende Frühwarnsignale:** Streubesitz/Aktienzahl (SEC XBRL), Reg-SHO-Schwellenliste, Fails-to-Deliver (SEC), Werbe- und Promotion-Hinweise, Studien- und FDA-Termine.

## 3. Plan

| Stufe | Inhalt | Nutzen | Aufwand | Freigabe |
|---|---|---|---|---|
| **F1 Erkennungsquote** | Im Rückblick je hebelfreiem Volltreffer (+40 % nach Kosten in ≤ 21 Tagen) prüfen, ob am Vortag ein bestandenes Muster, ein Datenkrake-Signal oder ein Modell-Rang im oberen 1 % vorlag. Öffentlich nur die Quote je Ursache (Zahlen, Übernahme, Großaktionär, Squeeze, Politik …), privat die Fälle. Dazu eine Fallstudie für Oracle, Intel, UnitedHealth, SLV und Coinbase. | Zeigt **wie viele** große Sprünge das System vorher sieht und wo die Lücken sind – Maßstab für alle weiteren Stufen | ½ Tag | ohne Rückfrage (nur Messung) |
| **F2 Ereignis-Meldungen** | SEC-Arten ergänzen: Fusion 425, Übernahmeangebot SC TO-T/SC 14D9, DEFM14A/PREM14A, 13G, 13F-Neueinstiege bekannter Investoren, Staatsbeteiligung (8-K 1.01 mit Regierungsstelle) | Übernahmen und Großinvestor-Einstiege früher und vollständig | ½–1 Tag | ohne Rückfrage (gleiche Quelle) |
| **F3 Katalysator-Kalender** | Klinische Studien (clinicaltrials.gov: Abschlussdatum, Ergebnisse), FDA-Termine aus freien Quellen, Termine aus 8-K/Pressemeldungen; Merkmal „Tage bis zum Katalysator“ | Fälle wie Viking: angekündigte Daten im Quartal | 1 Tag | Go nötig (neue Quelle) |
| **F4 Squeeze-Paket** | Aktienzahl/Streubesitz aus SEC XBRL, Reg-SHO-Schwellenliste (Nasdaq/NYSE), Fails-to-Deliver (SEC); Merkmal „Leerbestand in % des Streubesitzes“ | Fälle wie GameStop | 1 Tag | Go nötig |
| **F5 Pennystocks** | Börsennotierte US-Werte unter 1 $ als eigener Markt „penny“ mit ehrlichen Kosten (Spread nach Umsatz, US-Börse); OTC nur zum Lernen, Orders als „⚠️ Handelbarkeit ungeprüft“; Pump-Filter bleibt | Höhere Volltreffer-Dichte, gemessen statt vermutet | 1 Tag | **Go nötig (Quantensprung)** |
| **F6 Europa und Themen** | Kursgeschichte für EU-Werte aus einer frei nutzbaren Quelle (zuerst Nutzungsbedingungen prüfen), Themenkörbe (Rüstung, Infrastruktur, Rohstoffe) verknüpft mit dem Politik-Radar; bis dahin lernt der Vorwärtstest aus den täglichen gettex-Kerzen | Fälle wie Rheinmetall, Klöckner | 1–2 Tage | **Go nötig** |
| **F7 Rohstoffe** | Gold, Silber, Kupfer, Öl als eigener Markt im Rückblick (über US-ETFs und frei verfügbare Tagespreise), Exportbeschränkungen als Politik-Thema | Fälle wie Silber | ½ Tag | Go nötig |

Reihenfolge: F1 zuerst – sie zeigt, welche der Stufen F2–F7 die meisten verpassten Sprünge schließt. Danach nach gemessenem Nutzen.

## 4. Grenzen

- Überraschungen wie der Inhalt der Oracle-Zahlen sind vorher nicht erkennbar. Erkennbar ist nur, dass ein Termin ansteht und wie der Wert danach weiterläuft.
- Jede neue Quelle und jedes neue Merkmal verlängert den Rückblick, zurzeit rund 35 Minuten.
- Pennystocks erhöhen die Zahl der Treffer, aber auch die der Totalverluste. Der Vorwärtstest misst das mit vollen Kosten, bevor etwas sichtbar ordert.

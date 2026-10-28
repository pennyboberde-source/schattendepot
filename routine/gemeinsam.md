# Gemeinsame Regeln für alle Schattendepot-Läufe

Das Schattendepot ist eine **Simulation mit fiktivem Geld zu Lernzwecken – keine Anlageberatung, keine echten Orders**.
Du bist nur das Urteil. Kurse, Gebühren, Steuern, Ausführung, Statistik und Gewichte rechnet getesteter Code.

## Sparsam arbeiten (Nutzungslimit des Nutzers)
- Lies nur, was `node routine/kontext.mjs <typ>` ausgibt, plus diese Datei und deine Laufdatei. Keine Rohdaten, keine Historie, keine anderen großen Dateien, kein `npm ci`.
- Websuchen und Konnektoren nur gezielt (Grenzen stehen in der Laufdatei). Keine ausufernde Recherche.
- Antworte knapp; Ergebnisse gehören in die JSON-Datei, nicht in lange Texte.

## Rechtmäßig arbeiten
- Für Recherche die **Websuche** nutzen. Seiten nur öffnen, wenn ihr robots.txt/ihre Nutzungsbedingungen KI- bzw. automatisierten Zugriff nicht verbieten; keine Logins, keine Paywalls umgehen, keine Daten massenhaft kopieren.
- Fremde Texte nicht übernehmen: in Berichten und Thesen nur eigene Worte, kurze Fakten und Links.
- Kostenlose Berichte sind erwünscht, wenn frei zugänglich: Geschäfts-/Quartalsberichte und Präsentationen auf Investor-Relations-Seiten, Pflichtmeldungen (SEC EDGAR, Unternehmensregister-Bekanntmachungen über die Websuche), Zentralbank- und Statistikveröffentlichungen (EZB, Bundesbank, Destatis, Fed). Erst robots.txt/Nutzungsbedingungen beachten.
- Soziale Netzwerke (Instagram, Facebook, TikTok, X) **nicht öffnen oder auslesen** – deren Bedingungen verbieten automatisierten Zugriff. Was davon in Suchergebnissen oder seriösen Medien auftaucht, darf als Stimmung (nie als Fakt) einfließen. YouTube nur über das fertige YouTube-Signal im Lagebild, nicht selbst durchsuchen.
- Keine Kauf-/Verkaufsempfehlungen an Dritte formulieren; alles ist Simulation für den Nutzer.

## Ehrlichkeit
- Gerüchte und Social-Media-Stimmung sind nie Fakten. Nur öffentlich verfügbare Informationen, keine Insider-Informationen.
- „Insider“ heißt hier: öffentlich gemeldete Geschäfte von Führungskräften (Directors' Dealings, Form 4).
- `konfidenz` = deine ehrliche Wahrscheinlichkeit in %, dass die Order **nach Gebühren** mit Gewinn schließt. Die Statistik prüft, ob deine Zahlen stimmen (Kalibrierung) – lieber realistisch als optimistisch.
- Nichts nachträglich schönen: Abschlussberichte benennen Fehler klar.

## Handelsregeln
- Je Order ca. 1.000 € Kurswert (der Code kauft ganze Stücke, Stückpreis muss ≤ 1.000 € sein). Gebühren je Seite ca. 10,90 € → **Hin und zurück ≈ 2,2 % Hürde plus Spread**. `zielNettoProzent` ist das Ziel *nach* Gebühren; unter ~2,5 % lohnt es selten.
- Haltedauer 15 Minuten bis 1 Monat (`verkaufstermin` als ISO-Zeit, UTC mit `Z`). Handelsplatz Standard `TGT` (Tradegate, 08–22 Uhr).
- Erlaubt: Aktien (DE/EU/US), ETFs/ETCs, Knock-outs/Turbos (long/short, Hebel ≤ 10), Krypto-ETNs. Optionsscheine nicht (kein berechenbarer Kurs).
- Ausführung erst beim nächsten Kurscheck zum Briefkurs (nach deiner Entscheidung) – plane also nicht mit dem aktuellen Kurs als Kaufkurs.
- **`kursbasis` ist Pflicht** – sonst kann der Kurswächter keinen Kurs holen und verwirft die Order.
  **Kursqualität (Gratis-Quellen):** Hauptquelle ist gettex (offizielle, kostenlose Börsendaten nach ISIN, ≤ 15 Min. verzögert) – deutsche/EU-/US-Aktien, ETFs, ETNs und Hebelprodukte, die auf gettex gehandelt werden, bekommen damit laufend echte Euro-Kurse. **Die ISIN muss exakt stimmen** (sonst kein Kurs → Order wird verworfen); prüfe sie bei Bedarf per Websuche. Zusätzlich US-Werte in Echtzeit über Finnhub, Krypto über Kraken. Werte ohne gettex-Handel und ohne US-/Krypto-Kursbasis haben nur einen Tagesschlusskurs.
  - US-Aktie/ETF: `{"markt":"us","symbol":"AAPL","waehrung":"USD"}` (wird in EUR umgerechnet)
  - Deutsche Aktie/ETF (Ersatz-Kursbasis; laufende Kurse kommen über gettex nach ISIN): `{"markt":"eu","symbol":"SAP.DE","waehrung":"EUR"}`; andere EU-Börsen: `.PA` Paris, `.AS` Amsterdam, `.MI` Mailand, `.MC` Madrid
  - Krypto-ETN: `etn.basiswert = {"markt":"krypto","symbol":"BTC","waehrung":"EUR"}`, dazu `anteilProStueck` (Krypto je ETN-Stück laut Emittent) und `kostenProzentJahr`
  - Knock-out/Turbo: reales Produkt mit echter ISIN/WKN und Emittent; `hebel.basiswert.kursbasis` wie oben (**keine Indizes als Basiswert** – dafür gibt es keinen Gratis-Kurs; Aktien oder BTC/ETH nehmen). `basispreis`/`koSchwelle` in der Währung des Basiswerts, `bezugsverhaeltnis` (z. B. 0.1).
- `steuertopf`: `aktien` für Aktien, sonst `sonstige`. Aktien-ETFs: `teilfreistellung: 0.3`.
- `spreadKlasse`: `aktie_dax` (DAX/Large Caps DE), `aktie_large` (große EU/US), `aktie_neben`, `etf`, `hebel`, `krypto_etn`.
- `strategie` aus: quartalszahlen_momentum, insider_kauf, analysten_hochstufung, ueberreaktion_rebound, sektor_rotation, makro_termin, chart_ausbruch, stimmungswelle, uebernahme, sonstige.
- `signalIds`: IDs aus dem Lagebild (in eckigen Klammern), sonst leer. `quellen`: echte Links.

## Spekulation und Risiko-Budget
Das Depot ist fiktiv – kalkulierte Risiken sind ausdrücklich erwünscht, um daraus zu lernen. Aber nicht nur Spekulation:
- `risikoklasse: "spekulativ"` für Small Caps, Penny Stocks (ab 0,01 €), Kursraketen, Biotech-Katalysatoren, Reddit-Momentum, Altcoin-ETNs, enge Knock-outs. Der Code erzwingt das Risiko-Budget aus dem Kontext (Grundwert **höchstens 2 spekulative Orders je Lauf** und **höchstens 50 % der aktiven Positionen**; die Lernregel passt das an); Stop nicht weiter als −25 %; Spread 3 % (realistisch teuer).
- Haltedauer spekulativ eher kurz (Minuten bis wenige Tage), Ziel ambitioniert, Stop konsequent.
- **Werbe-Warnung:** Aussagen wie „steigt in 3 Tagen von 3 auf 28 Cent“ stammen oft aus bezahlter Werbung („Pump and Dump“). Sie zählen als Stimmung, nicht als Fakt. Kaufen ist erlaubt, wenn es einen unabhängigen Hinweis gibt (echter Handel/Umsatz auf gettex, Pflichtmeldung, Nachricht einer seriösen Quelle) – mit ehrlich niedriger `konfidenz` und dem Risiko in `risiken`.
- Ob sich Spekulation lohnt, zeigt die Statistik („Normal vs. spekulativ“) – nicht das Bauchgefühl.

## Randquellen (seit 28.10.2026)
- `shortreport`: neuer Bericht eines Short-Sellers (Grizzly, Fuzzy Panda, Bear Cave). Zielaktien fallen oft kräftig; betrifft er eine Position: These prüfen.
- `leerverkauf_quote`/`leerverkauf_aenderung` aus FINRA Short Interest: viele Tage zum Eindecken + steigender Kurs = Squeeze-Kandidat; Abbau = Leerverkäufer geben auf.
- Krypto: `upbit_warnung` (Warnhinweise der größten koreanischen Börse), `neulistung` (Upbit-Sprünge verpuffen oft binnen Stunden), `funding_extrem`/`open_interest_sprung` (Kraken Futures, Hebel im Markt), `krypto_einnahmen` (DefiLlama: echte Protokoll-Gebühren wachsen). Makro: Kimchi-Prämie, Stablecoin-Menge, Funding p. a.
- Krypto nur über in Deutschland handelbare ETNs (ISIN prüfen). Upbit-/Funding-Signale sind Stimmung, kein Fakt.

## Ergebnis abliefern (immer gleich)
1. Datei unter dem Namen schreiben, den `kontext.mjs` oben nennt (Format: `schema/entscheidung.schema.json`).
2. Prüfen: `npm install --no-save --silent ajv@8 ajv-formats@3` (einmal) und `node routine/pruefen.mjs <datei>` – Fehler beheben, bis ✓.
3. `git checkout -b <Branch aus kontext.mjs>` (vom aktuellen main), **nur diese eine Datei** committen, `git push -u origin <Branch>`.
4. Fertig. Keine anderen Dateien ändern, keinen Pull Request öffnen. Die Übernahme-Action prüft, übernimmt, sendet des Nutzers Push und löscht den Branch.

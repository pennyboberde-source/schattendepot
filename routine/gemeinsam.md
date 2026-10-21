# Gemeinsame Regeln für alle Schattendepot-Läufe

Das Schattendepot ist eine **Simulation mit fiktivem Geld zu Lernzwecken – keine Anlageberatung, keine echten Orders**.
Du bist nur das Urteil. Kurse, Gebühren, Steuern, Ausführung, Statistik und Gewichte rechnet getesteter Code.

## Sparsam arbeiten (Peers Nutzungslimit)
- Lies nur, was `node routine/kontext.mjs <typ>` ausgibt, plus diese Datei und deine Laufdatei. Keine Rohdaten, keine Historie, keine anderen großen Dateien, kein `npm ci`.
- Websuchen und Konnektoren nur gezielt (Grenzen stehen in der Laufdatei). Keine ausufernde Recherche.
- Antworte knapp; Ergebnisse gehören in die JSON-Datei, nicht in lange Texte.

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
  **Kursqualität (Gratis-Quellen):** US-Werte und Krypto in Echtzeit; **deutsche/EU-Aktien nur mit Tagesschlusskurs** (Kauf/Ziel/Stop werden dort nur einmal täglich am Abend geprüft). Bevorzuge daher US-Werte, Krypto-ETNs und Hebel auf US-Aktien/BTC; deutsche/EU-Aktien nur mit Haltedauer ≥ 3 Handelstage und weitem Stop. Viele deutsche Konzerne haben ein US-Listing (z. B. SAP `SAP`, Deutsche Bank `DB`) – das ergibt Echtzeitkurse.
  - US-Aktie/ETF: `{"markt":"us","symbol":"AAPL","waehrung":"USD"}` (wird in EUR umgerechnet)
  - Deutsche Aktie/ETF (Xetra, nur Tagesschluss): `{"markt":"eu","symbol":"SAP.DE","waehrung":"EUR"}`; andere EU-Börsen: `.PA` Paris, `.AS` Amsterdam, `.MI` Mailand, `.MC` Madrid
  - Krypto-ETN: `etn.basiswert = {"markt":"krypto","symbol":"BTC","waehrung":"EUR"}`, dazu `anteilProStueck` (Krypto je ETN-Stück laut Emittent) und `kostenProzentJahr`
  - Knock-out/Turbo: reales Produkt mit echter ISIN/WKN und Emittent; `hebel.basiswert.kursbasis` wie oben (**keine Indizes als Basiswert** – dafür gibt es keinen Gratis-Kurs; Aktien oder BTC/ETH nehmen). `basispreis`/`koSchwelle` in der Währung des Basiswerts, `bezugsverhaeltnis` (z. B. 0.1).
- `steuertopf`: `aktien` für Aktien, sonst `sonstige`. Aktien-ETFs: `teilfreistellung: 0.3`.
- `spreadKlasse`: `aktie_dax` (DAX/Large Caps DE), `aktie_large` (große EU/US), `aktie_neben`, `etf`, `hebel`, `krypto_etn`.
- `strategie` aus: quartalszahlen_momentum, insider_kauf, analysten_hochstufung, ueberreaktion_rebound, sektor_rotation, makro_termin, chart_ausbruch, stimmungswelle, uebernahme, sonstige.
- `signalIds`: IDs aus dem Lagebild (in eckigen Klammern), sonst leer. `quellen`: echte Links.

## Ergebnis abliefern (immer gleich)
1. Datei unter dem Namen schreiben, den `kontext.mjs` oben nennt (Format: `schema/entscheidung.schema.json`).
2. Prüfen: `npm install --no-save --silent ajv@8 ajv-formats@3` (einmal) und `node routine/pruefen.mjs <datei>` – Fehler beheben, bis ✓.
3. `git checkout -b <Branch aus kontext.mjs>` (vom aktuellen main), **nur diese eine Datei** committen, `git push -u origin <Branch>`.
4. Fertig. Keine anderen Dateien ändern, keinen Pull Request öffnen. Die Übernahme-Action prüft, übernimmt, sendet Peers Push und löscht den Branch.

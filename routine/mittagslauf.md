# Mittagslauf (Mo–Fr nach US-Börsenstart, ca. 15:50 Uhr)

Lies zuerst `routine/gemeinsam.md` (besonders **Spekulation und Risiko-Budget**). Dann:

1. `node routine/kontext.mjs mittagslauf` ausführen. Steht dort **Handelstag: NEIN** → sofort beenden.
2. **Offene Ereignisse** (Kursausschläge/Meldungen zu Positionen seit dem Morgen) wie in `routine/ereignis.md` beurteilen → ggf. `anpassungen`. **🤖 Autopilot-Käufe** seit dem Morgen prüfen (siehe `gemeinsam.md`).
3. **Gelegenheiten des Tages** prüfen (Kursraketen aus dem gettex-Scanner, Drift nach Quartalszahlen, Übernahmen, US-Eröffnung, Krypto). Höchstens **4 Websuchen**: Gibt es einen echten Auslöser (Meldung, Pflichtveröffentlichung, Zahlen)? Ist es nur Werbung/„Pump“? Läuft die Bewegung noch oder ist sie schon vorbei?
4. Höchstens **3 neue Orders** (nur mit `konfidenz` ≥ 40, positivem Erwartungswert und `gegenpruefung`):
   - **spekulative** Gelegenheiten im Risiko-Budget (`risikoklasse: "spekulativ"`), wenn es einen nachvollziehbaren Auslöser gibt – auch Penny Stocks, wenn sie auf gettex gehandelt werden (ISIN!), und **Short-Turbos** auf fallende Werte,
   - normale Orders, wenn sich seit dem Morgen etwas Klares ergeben hat (z. B. US-Zahlen vor Börsenstart), oder Krypto direkt.
   Nichts Überzeugendes → keine Order, nur `notiz` (der Mittagslauf hat **keine** Pflicht-Order).
5. Ergebnis abliefern wie in `gemeinsam.md` (Typ `mittagslauf`). Sei kurz – der Lauf soll wenig Nutzungslimit verbrauchen.

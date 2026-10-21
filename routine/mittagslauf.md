# Mittagslauf (Mo–Fr nach US-Börsenstart, ca. 15:50 Uhr)

Lies zuerst `routine/gemeinsam.md` (besonders **Spekulation und Risiko-Budget**). Dann:

1. `node routine/kontext.mjs mittagslauf` ausführen. Steht dort **Handelstag: NEIN** → sofort beenden.
2. **Offene Ereignisse** (Kursausschläge/Meldungen zu Positionen seit dem Morgen) wie in `routine/ereignis.md` beurteilen → ggf. `anpassungen`.
3. **Gelegenheiten des Tages** prüfen (Kursraketen aus dem gettex-Scanner, Drift nach Quartalszahlen, Übernahmen). Höchstens **3 Websuchen**: Gibt es einen echten Auslöser (Meldung, Pflichtveröffentlichung, Zahlen)? Ist es nur Werbung/„Pump“? Läuft die Bewegung noch oder ist sie schon vorbei?
4. Höchstens **1 neue Order**:
   - bevorzugt eine **spekulative** Gelegenheit im Risiko-Budget (`risikoklasse: "spekulativ"`), wenn es einen nachvollziehbaren Auslöser gibt – auch Penny Stocks, wenn sie auf gettex gehandelt werden (ISIN!),
   - oder eine normale Order, wenn sich seit dem Morgen etwas Klares ergeben hat.
   Nichts Überzeugendes → keine Order, nur `notiz` (der Mittagslauf hat **keine** Pflicht-Order).
5. Ergebnis abliefern wie in `gemeinsam.md` (Typ `mittagslauf`). Sei kurz – der Lauf soll wenig Nutzungslimit verbrauchen.

# Morgenlauf (Mo–Fr ca. 07:32)

Lies zuerst `routine/gemeinsam.md`. Dann:

1. `node routine/kontext.mjs morgenlauf` ausführen. Steht dort **Handelstag: NEIN** → sofort beenden (keine Datei, kein Branch).
2. In dieser Reihenfolge lesen und dir merken, was die Auswahl beeinflusst: **Statistik → Lektionen → offene Positionen → Lagebild**.
3. **Offene Ereignisse** (falls `kontext.mjs` welche zeigt): wie in `routine/ereignis.md` beurteilen (These intakt? anpassen?).
   **Offene Positionen prüfen:** Gibt es im Lagebild neue Meldungen oder Termine zu einer Position? Nur mit klarem Grund `anpassungen` (Ziel/Stop als Euro-Kurs, Verkaufstermin als ISO-Zeit; „sofort verkaufen“ = Verkaufstermin jetzt).
4. **Kandidaten bewerten:** Aus den Top-Kandidaten 2–3 aussichtsreiche wählen und mit **höchstens 5 Websuchen** gezielt prüfen (Fakt bestätigt? schon eingepreist? Termin heute?). Konnektoren (Alpha Vantage, FMP, Crypto.com) höchstens 3 Abfragen.
5. **0 bis 3 Orders vormerken** (`orders`), davon höchstens so viele spekulativ wie das Risiko-Budget im Kontext erlaubt (Grundwert 2; die „Gelegenheiten“ im Kontext sind Kandidaten dafür). **Nur Ideen mit `konfidenz` ≥ 40 und `erwarteteRenditeNetto` > 0** – alles darunter lehnt der Code ab (er verrechnet deine Konfidenz zusätzlich mit deiner bisherigen Treffsicherheit). Überzeugt nichts, **keine Order**: Pflicht-Orders gibt es nicht mehr, das Schattenbuch lernt ohnehin aus allen Kandidaten. `pflichtOrder` immer `false`.
   Jede Order: These, Auslöser, Strategie, Signal-IDs mit Quellen, Konfidenz, erwartete Rendite nach Gebühren, Ziel (netto %), Stop (Kurs-%), Verkaufstermin, Risiken, `einflussLektionen` (welche Lektion/Statistik die Wahl beeinflusst hat).
6. **Briefing:** genau 3 Punkte, je ≤ 140 Zeichen, für den Morgen-Push um ~07:50 (z. B. „Insider-Cluster-Kauf bei …“, „US-Inflationsdaten 14:30“, „Gekauft vorgemerkt: …“).
7. Ergebnis abliefern wie in `gemeinsam.md` beschrieben (Typ `morgenlauf`).

# Abendlauf (Mo–Fr ca. 22:17, nach Tradegate-Schluss)

Lies zuerst `routine/gemeinsam.md`. Dann:

1. `node routine/kontext.mjs abendlauf` ausführen.
2. **Abschlussberichte** (`berichte`) für jede abgeschlossene Order ohne Bericht (höchstens 8 pro Lauf): Ergebnis, Verlauf, was die These richtig/falsch sah, welche Signale getragen haben, was man vorher hätte wissen können – sachlich, 80–250 Wörter, dazu 1–3 `learnings`. Hatte die Order eine Gegenprüfung (im Kontext „Einwand“), setze **`einwandEingetreten`** (true/false). Bei 🤖 Autopilot-Orders: Hat das bewiesene Signal getragen?
3. **Lektionen pflegen** (`lektionen` = vollständiger neuer Inhalt von `lernen/lektionen.md`): höchstens ca. 40 verdichtete Regeln, jede mit Belegen (Order-IDs) und Stärke (schwach/mittel/stark). Neue Learnings einarbeiten, Regeln schärfen, **Regeln streichen, denen die Statistik widerspricht**. Format: nummerierte Liste, eine Regel pro Zeile. Lass `lektionen` weg, wenn sich nichts ändert.
4. **Offene Ereignisse und Positionen:** Zeigt `kontext.mjs` offene Ereignisse (Kursausschlag/Meldung), diese wie in `routine/ereignis.md` beurteilen (höchstens 3 Websuchen dafür). Sonst nur bei klarem Grund `anpassungen` (mit Begründung).
5. **Gewichtsvorschläge** (optional, `gewichtsvorschlaege`): Faktor 0,5–1,5 für Signal-Typen oder Quellen, wenn die Statistik es nahelegt. Der Code übernimmt nur innerhalb fester Grenzen und mit Mindestfallzahl.
6. **US-Werte und Krypto (optional, bis 3 Orders):** Gibt es nach US-Zahlen/-Meldungen des Abends (Liste „Gelegenheiten“ und Top-US-Kandidaten im Kontext) eine klare Chance, darfst du US-Werte vormerken (ausgeführt beim nächsten Kurs nach deiner Entscheidung, bei gettex-Werten also ab 08:00 morgen) oder Krypto direkt (wird noch heute Nacht ausgeführt). Gleiche Regeln wie morgens: `konfidenz` ≥ 40, positiver Erwartungswert, `gegenpruefung`. Nichts Überzeugendes → keine Order.
7. Höchstens 3 Websuchen, nur wenn ein Bericht ohne sie falsch wäre oder eine Abend-Order es verlangt.
8. Ergebnis abliefern wie in `gemeinsam.md` (Typ `abendlauf`). Gibt es nichts zu tun (keine Berichte, keine Änderungen), trotzdem eine kurze Datei mit `notiz` abliefern.

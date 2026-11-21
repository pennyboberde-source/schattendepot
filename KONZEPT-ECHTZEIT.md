# Konzept: Echtzeit-Orders mit echten Produkten

_Stand 21.11.2026 · nur Konzept, gebaut wird erst auf Zeichen des Nutzers_
_Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung._

## Ziel (Nutzer 21.11.2026)
Kauf-, Verkaufs- und Stop-Mitteilungen kommen in Echtzeit (höchstens wenige Minuten Verzug) auf iPad und iPhone –
**mit genau dem Produkt und dem Kurs, zu dem man in diesem Moment auf den genutzten Plattformen kaufen könnte**.
Entschieden: echtes Produkt nennen (ISIN/WKN, Knock-out, Hebel, Briefkurs an gettex; bei Leerverkäufen ein passender
Put-Turbo); den Dienst wählt Claude nach der 0-€-Regel.

## Heute (Ausgangslage)
| Baustein | heute | Verzug |
|---|---|---|
| Kurswächter, Daytrading, Depot-Käufe | GitHub-Zeitplan alle 15 Min. (kommt oft 5–30 Min. zu spät) | 15–45 Min. |
| gettex-Kurse | 15-Minuten-Dateien (Fensterende) | ≥ 15 Min. |
| US-Aktien | Massive (Tagesdaten), Finnhub nur vereinzelt | Tag bzw. Minuten |
| Volltreffer-Orders | Rückblick ~07:30 UTC, Einstieg „zur Eröffnung“ | Eröffnungskurs, nachgerechnet |
| Turbos | **synthetisch** (Hebel und Knock-out nachgebildet, kein echtes Produkt) | – |
| Leerverkäufe | simulierter US-Broker (für den Nutzer nicht nachkaufbar) | – |

## Grundidee: „Auslöser-Liste“ + kleiner Echtzeit-Wächter
Die bestehende Logik (Rückblick, Modelle, Daytrading-Regeln, Autopilot, Claude-Urteil) entscheidet weiter **was** gehandelt
wird. Neu ist nur, **wann und zu welchem Kurs** es passiert:

1. Die Jobs schreiben eine **Auslöser-Liste** (privat): je vorgemerkter Order bzw. offener Position Basiswert, Richtung,
   gewähltes Produkt, Bedingung (z. B. „zur US-Eröffnung“, „Kurs über X“), Stop, Ziel, Ablaufzeit.
2. Ein kleiner **Echtzeit-Wächter** prüft während der Handelszeiten alle 30–60 Sekunden nur die Kurse dieser Liste,
   „füllt“ bei erfüllter Bedingung zum **echten Brief- bzw. Geldkurs** und schickt sofort die Mitteilung an beide Geräte.
3. Die Ausführungen landen (nur anhängen) im privaten Zustand; der nächste reguläre Job übernimmt Abrechnung,
   Gebühren, Kennzahlen und App – wie heute, nur mit echten Ausführungskursen (Kennzeichen `echtzeit`).

So bleibt der Wächter winzig (keine Strategie-Logik, nur „Kurs holen – vergleichen – melden“) und alles Bewährte bleibt.

Beispiel-Mitteilung:
> 🟢 **Kauf jetzt (simuliert):** Put-Turbo auf XYZ Inc. · WKN AB1C2D (erfundenes Beispiel) · Emittent X · Knock-out 12,40 $ · Hebel 2,1
> Brief 1,23 € an gettex (15:31:20) · 813 Stück = 999,99 € · Stop 0,92 € · Ziel 1,72 €

## Bausteine
### 1. Echte Produkte (größter neuer Teil)
- **Produktliste je Basiswert:** ESMA FIRDS (haben wir schon) liefert alle Turbos/Optionsscheine an gettex mit ISIN,
  Call/Put, Emittent – aber **ohne aktuellen Knock-out und Bezugsverhältnis**.
- **Fehlende Daten** (Knock-out, Bezugsverhältnis, Brief/Geld): von den Emittenten-Seiten (Vontobel, UniCredit/HVB,
  HSBC, Société Générale …); diese Werte stehen dort öffentlich je Produkt. Welche davon maschinell und erlaubt
  abrufbar sind, prüft Stufe E0.
- **Auswahlregel (Code):** Produkt an gettex, passende Richtung, Hebel/Knock-out-Abstand so nah wie möglich an der
  Spielart (z. B. „Turbo short Hebel 2“), enger Spread, bevorzugt Emittenten mit 0 € Ordergebühr bei Smartbroker+.
- **Leerverkäufe** (Modell-Regel, simulierter US-Broker): Für dich nicht nachkaufbar → Meldung nennt den passenden
  **Put-Turbo an gettex**; gibt es keinen, steht „kein Produkt an gettex – nur simuliert“ dabei. Die Simulation
  rechnet weiter wie heute; zusätzlich läuft der Put-Turbo als Vergleich mit.
- **Krypto:** Kraken-Echtzeitkurs plus Trade-Republic-Spread (Näherung, deutlich gekennzeichnet).

### 2. Echtzeit-Kurse
| Markt | Quelle (0 €) | Verzug | Grenzen |
|---|---|---|---|
| US-Aktien (Basiswert) | Finnhub (Schlüssel vorhanden) | Echtzeit | 60 Abrufe/Min., nur private Nutzung |
| gettex-Produkte (Brief/Geld) | gettex-Webseite bzw. Emittenten-Seiten | Echtzeit | gettex: nur **private** Nutzung, Weitergabe verboten; maschineller Abruf in den Bedingungen nicht geregelt → in E0 klären |
| Krypto | Kraken (wie heute) | Echtzeit | – |

**Wichtig:** Echtzeit-Kurse dürfen nur zu dir (Mitteilung, private Ansicht), nie ins öffentliche Repo, auf die
öffentliche App-Seite oder in Actions-Logs – wie schon bei den Rohkursen. Die öffentliche App zeigt weiter Prozent
und verdichtete Werte; die genauen Echtzeit-Kurse stehen in der Mitteilung.

### 3. Dienst für den Echtzeit-Wächter (0 €)
| Weg | Bewertung |
|---|---|
| **Cloudflare Worker mit „Durable Object“-Wecker** (Empfehlung) | kostenloses Konto nur mit E-Mail, ohne Karte; Free-Plan: 100.000 Anfragen/Tag, Wecker im Sekundenbereich, 50 externe Abrufe je Durchlauf, wenige ms Rechenzeit je Aufruf. Reicht für alle 30–60 s einen Durchlauf mit bis zu ~40 Kursen. Läuft unabhängig von PC und GitHub. |
| Windows-PC (geplanter Task) | 0 €, kein neues Konto, aber nur, solange der PC an ist – für Mitteilungen unterwegs unzuverlässig. Gut als Rückfall. |
| GitHub Actions als Dauerlauf | kein neues Konto, aber Dauerschleifen sind laut GitHub-Bedingungen eine Grauzone und unzuverlässig → nicht empfohlen. |

Geheimnisse (Push-Schlüssel, Finnhub, Lese-/Schreibzugriff auf den privaten Zustand) lägen dann zusätzlich im
Cloudflare-Tresor; Zugriff aufs private Repo nur mit einem eng begrenzten Token (nur ein Zweig `echtzeit`).

### 4. Mitteilungen
Gehen schon jetzt an iPad und iPhone (seit 21.11.2026). Echtzeit-Mitteilungen bekommen die Dringlichkeit „hoch“
und werden nicht zurückgehalten (die Ruhezeit 22:30–07:00 liegt ohnehin außerhalb der Handelszeiten).

## Stufen (Vorschlag)
| Stufe | Inhalt | Aufwand | Nutzen |
|---|---|---|---|
| **E0 Machbarkeit** | Quellen testen (Finnhub-Echtzeit, Emittenten-Daten für Knock-out/Bezugsverhältnis/Brief, gettex-Bedingungen), Cloudflare-Probe mit Web-Push | 1 Sitzung | klare Go/No-Go-Liste je Quelle |
| **E1 Auslöser-Liste** | Jobs schreiben `echtzeit/ausloeser.json` (privat) für Volltreffer-, Depot- und Daytrading-Orders | 1 Sitzung | Grundlage, auch ohne Wächter nützlich |
| **E2 Echte Produkte** | Produktwahl je Turbo-Order, Put-Turbo für Leerverkäufe, Vergleich echt ↔ synthetisch | 1–2 Sitzungen | Meldung nennt kaufbare WKN |
| **E3 Echtzeit-Wächter** | Cloudflare-Worker: Kurse prüfen, füllen, Mitteilung an beide Geräte, Ausführung privat anhängen | 1–2 Sitzungen | Meldung binnen ~1 Min. |
| **E4 Abrechnung und App** | Jobs übernehmen Echtzeit-Ausführungen, Kennzeichen `echtzeit`, Vergleich mit dem alten Weg, App-Hinweis | 1 Sitzung | Kennzahlen mit echten Kursen |
| E5 (später) | Daytrading-Setups live statt aus 15-Min.-Dateien | offen | schnellere Einstiege – erst, wenn E0 eine Minuten-Quelle für gettex findet |

Reihenfolge nach Wirkung: zuerst die **Volltreffer-Orders** (seltener, größer, Kernziel), dann Depot, zuletzt Daytrading.

## Ehrliche Grenzen
- „Genau der Kurs“ heißt: Brief/Geld zum Zeitpunkt der Prüfung. Bis du in der Broker-App kaufst, vergehen Sekunden
  bis Minuten – der Kurs kann sich bis dahin bewegen.
- Echte Produkte haben eigene Spreads, Knock-out-Schwellen und Finanzierungskosten; die Ergebnisse werden dadurch
  ehrlicher, oft etwas schlechter als die synthetische Rechnung.
- Ob gettex- oder Emittenten-Kurse maschinell abgerufen werden dürfen, ist offen (E0). Wenn nicht: Basiswert in
  Echtzeit (Finnhub) plus Produktkurs aus Knock-out und Bezugsverhältnis berechnet – als Näherung gekennzeichnet.
- Zuschlag „Zeitlupe“ (21.11.): Einstiege im Tagesverlauf (statt zur Eröffnung) waren in der Rückschau bei Longs
  durchweg schlechter. Echtzeit soll deshalb vor allem die **Kurse genauer** machen, nicht mehr Einstiege erzeugen.

## Offene Entscheidungen für den Nutzer (vor E0)
1. Go für E0 (Machbarkeit, eine Sitzung)?
2. Cloudflare-Konto (kostenlos, nur E-Mail) – legst du es an, wenn E0 positiv ist?
3. Reihenfolge Volltreffer → Depot → Daytrading einverstanden?

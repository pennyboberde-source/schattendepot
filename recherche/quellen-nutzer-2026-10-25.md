# Quellen-Kandidaten des Nutzers (25.10.2026)

**Vorab-Sortierung ohne Webabfragen.** Preise, Nutzungsbedingungen und robots.txt werden ab dem 27.10. (nach dem Wochen-Reset) je Quelle geprüft. Bis dahin ist jede Einstufung vorläufig.
Regeln: Kostenpflichtiges fliegt raus. Quellen ohne Anmeldung zuerst, danach kostenlose Anmeldung mit nicht persönlicher Mail. Bestehende Quellen bleiben alle.

**Wichtige Einschränkung, die Handelbarkeit:** Die Simulation handelt über deutsche Handelsplätze (gettex/Tradegate, ISIN). Viele Werte aus Japan, Indien, Afrika und Lateinamerika sind dort nicht oder kaum handelbar. Quellen zu solchen Märkten helfen vor allem bei Länder-ETFs, ADRs, großen Werten mit deutscher Notiz und Krypto.

## A – ohne Anmeldung, kostenlos, maschinenlesbar → zuerst prüfen
| Quelle | Idee für die App | Bereich |
|---|---|---|
| **Upbit, öffentliche API** (KRW-Kurse, Marktliste) | Kimchi-Prämie **selbst berechnen**: Upbit BTC/KRW gegen Kraken BTC/USD mal Frankfurter-Kurs KRW/USD. Ersetzt CryptoQuant, dessen API kostet. Dazu **Neulistungen erkennen** über den Vergleich mit der Marktliste vom Vortag (Listing-Sprünge verpuffen laut Liste oft binnen Stunden). Außerdem das „9-Uhr-Phänomen“ (00:00 UTC) messen. | Krypto, Daytrading |
| **Kraken Futures, öffentliche API** | Funding Rates und Open Interest, also dieselbe Art Daten wie bei Coinglass/Coinalyze, ohne Konto. Ergänzt die bestehende Kraken-Quelle. | Krypto, Daytrading |
| **Substack-RSS** der genannten Briefe: Asian Century Stocks, Japan Language Gap Alpha, Kenkyo Investing, Praya, Emerging Market Skeptic, Frontier Markets Ideas, LatAm Special Situations, Inside Corner (Ian Bezek), „Kimchi Premium“, Value Investing (Malaysia) | Nur Titel und Link der frei sichtbaren Beiträge ins Lagebild, als Ideen für Claude. | Nebenwerte weltweit |
| **News-RSS**, sofern vorhanden: Bamboo Works, Kenyan Wall Street, Nairametrics, The Finance Ghost | Schlagzeilen ins Lagebild | China/HK, Afrika |
| **Kabutan / Kabutan.com, Minkabu** | Kursraketen- und Themenlisten Japan, Stimmung der Privatanleger. robots.txt und Bedingungen prüfen. Sinnvoll nur für in DE handelbare Werte. | Japan |
| **Japan Filings, TDnet** | Pflichtmeldungen Japan (Englisch). Prüfen. | Japan |
| **KIND (KRX)** | Ereignismeldungen Korea. Prüfen, teils nur Koreanisch. | Korea |
| **ValuePickr** (Discourse-Forum, hat RSS) | Indien-Ideen, nur über ETFs/ADRs handelbar | Indien |
| **african-markets.com** | Meldungen und Kurse Afrika, teils frei; kaum in DE handelbar | Afrika |
| **Asia Frontier Capital, Vietnam Holdings** (Fondsbriefe, monatlich) | Makro-Kommentar Frontier-Märkte, geringer Nutzen | Frontier |
| **FinancialJuice / Newsquawk** (kostenlose, verzögerte Schlagzeilen) | Nur wenn die Bedingungen automatischen Abruf erlauben, vermutlich nicht | Makro |

## B – kostenlose Anmeldung (nicht persönliche Mail, Schlüssel als GitHub-Secret)
| Quelle | Idee | Einschätzung |
|---|---|---|
| **Coinalyze** (freie API) | Funding, OI, Liquidationen, CVD über mehrere Börsen | hoch: Krypto-Daytrading |
| **Coinglass** | Liquidations-Heatmap, Long/Short | prüfen, ob die API noch eine Gratis-Stufe hat, sonst raus |
| **OpenDART** (Korea, API-Schlüssel) | Pflichtmeldungen | niedrig, kaum in DE handelbar |
| **FlashAlpha** (5 Abfragen/Tag) | GEX-Werte SPY/QQQ als Messgröße | niedrig; der Autor warnt selbst, dass es großteils den VIX abbildet |
| **Screener.in, Trendlyne, Tijori** (Gratis-Stufen) | Indien-Fundamentaldaten, Insider | Bedingungen prüfen, Indien nur indirekt |
| **Market Chameleon** (Gratis-Stufe) | IV, Earnings-Bewegungen | Bedingungen prüfen, vermutlich kein Abruf erlaubt |

## C – Lernstoff, kein Datenabruf (Claude nutzt es für Strategien und Lektionen)
- **Quantpedia** (frei sichtbare Strategien): Strategie-Ideen für den Daytrader und die Lernschleife.
- NexusFi, Elite Trader, r/RealDayTrading, Tradingqna, Jigsaw Trading, Axia Futures, Bookmap Learning Center, Mirae Asset Research (PDF).
- TradesViz: Die App ist selbst das Journal, nicht nötig.
- Studien als Messlatte für die Daytrading-Auswertung: SEBI Indien (89 % Verlierer), Brasilien Index-Future (97 % Verlierer, kein Dazulernen).

## X – raus
- **Kostenpflichtig:** Shikiho Online, Smartkarma, Edgewonk, Newsquawk-Abo, FinancialJuice Echtzeit, SpotGamma-Kern, Dilution Tracker, Bookmap-Software, FX Replay Pro, Argaam-Abo, Opstra (Tiefe), CryptoQuant-API, Nikkei Asia/Caixin (Bezahlschranke).
- **Login, Bedingungen oder keine Schnittstelle:** Xueqiu (nur mit Login), Eastmoney Guba (vermutlich gesperrt, prüfen), Sensibull (nur Zerodha-Kunden), NiftyTrader/Chartink/Gammalens/Tapeboard (Web-Werkzeuge ohne offene Schnittstelle), Wu Blockchain (läuft über X/Telegram, X verbietet Auslesen), Telegram-/WhatsApp-Signalgruppen (BaFin-Warnungen).

## Eigene Ersatz-Ideen für weggefallene Bezahlquellen (0 €)
- **Verwässerung statt Dilution Tracker:** SEC-EDGAR-Meldungen S-3/424B/S-1 selbst auswerten (braucht Secret `SEC_KONTAKT`).
- **Leihgebühren/Short statt Tapeboard:** öffentliche Leihdatei von Interactive Brokers und FINRA Short Interest. Bedingungen prüfen.
- **Kimchi-Prämie statt CryptoQuant:** siehe Upbit oben.

---

# Liste 1: Nebenwerte, Penny Stocks, Short-Seller, ETPs, Krypto

**Schon in der App** (bleiben): OpenInsider (Cluster-Käufe), SEC-8-K-Meldungen (mit `SEC_KONTAKT`), Reddit über ApeWisdom.

## A – ohne Anmeldung → zuerst prüfen
| Quelle | Idee für die App | Bereich |
|---|---|---|
| **OTC Markets** (Stufe, **Promotion-Flag**) | Der Code prüft jede Penny-Stock-Order: Läuft eine bezahlte Werbekampagne (Megafon-Symbol), wird die Order blockiert oder als „Werbung“ markiert. Die Werbe-Warnung aus `gemeinsam.md` würde damit zur Code-Regel. Bedingungen prüfen. | Penny Stocks |
| **Short-Seller-Berichte**: The Bear Cave (Substack-RSS), Spruce Point, Fuzzy Panda, Grizzly, Culper | Gegenperspektive: Ein neuer Short-Report zu einer Position löst ein Warn-Ereignis aus. Für den Daytrader ist am Tag des Reports ein Put-Turbo möglich. | Aktien, Daytrading |
| **Börsengeflüster** | Heiße Nebenwerte DE, auf gettex handelbar. robots.txt und Bedingungen prüfen. | DE-Nebenwerte |
| **Research-Häuser** Montega, SMC Research, GBC | Neue Einstufungen/Kursziele DE-Nebenwerte; „Sponsored Research“ als Merkmal speichern. EQS sperrt KI-Bots, daher direkt auf den Seiten prüfen. | DE-Nebenwerte |
| **Substack-RSS**: The Hermit, Microcap Mavericks, Microcap Opportunities, Microcap Investing Cliff Notes, European Hidden Gem Stocks, The MikroKap, Silba Deep Dives, Norwegian Hidden Gems | Titel und Link der frei sichtbaren Beiträge ins Lagebild | Nebenwerte US/EU |
| **Deutsche Börse: Krypto-ETN-Liste** (offiziell, 122 ETNs auf Xetra, Stand 31.03.2026) | **Universum für den Krypto-Daytrader**: welcher Coin über welche ISIN handelbar ist | Krypto-ETNs |
| **DefiLlama** (offene API ohne Schlüssel) | TVL, Gebühren und Einnahmen von Protokollen; Token-Unlocks, falls frei | Krypto |
| **BTC-ECHO** (RSS) | Deutsche Krypto-Schlagzeilen | Krypto |
| **wikifolio** | Trades erfolgreicher Musterdepots in DE-Nebenwerten. Bedingungen prüfen, vermutlich kein automatischer Abruf. | DE-Nebenwerte |

## B – kostenlose Anmeldung oder Secret
| Quelle | Idee | Einschätzung |
|---|---|---|
| **SEC EDGAR Volltextsuche** (braucht `SEC_KONTAKT`, kein Konto) | **Ersatz für Dilution Tracker**: S-3, 424B, „going concern“, „reverse split“, Warrants. Dazu CORRESP-Briefe. | hoch: Penny Stocks/Daytrading |
| **Dune** (freier API-Schlüssel, begrenzte Credits) | On-Chain-Abfragen, z. B. Börsenzuflüsse | mittel |
| **Tokenomist** | Unlock-Kalender | prüfen, ob die API frei ist, sonst Web nur als Lesestoff |
| **Artemis / Token Terminal** | Kennzahlen von Blockchains und Protokollen | prüfen, ob die API eine Gratis-Stufe hat |
| **CapEdge** | SEC-Meldungen, Eigentümer, Short Interest | prüfen; vieles liefert EDGAR direkt |

## C – Lernstoff (kein Datenabruf)
MicroCapClub (Artikel), Value Investors Club (Gastzugang, 45 Tage verzögert), Small Cap Discoveries, TrackingDifferences.com, etf.capital, ETF.com, findmymoat.com (Meta-Verzeichnis für spätere Recherche).

## X – raus
- **Kostenpflichtig/Bezahlschranke:** Dilution Tracker (ersetzt durch EDGAR), Fintel (ersetzt durch FINRA + IBKR-Leihdatei), Nansen, Delphi Digital, Blockworks Research.
- **Keine Schnittstelle:** getquin (nur App), Arkham (API nur auf Antrag).

---

# Ergebnis der Prüfung (28.10.2026)
Geprüft: robots.txt, Nutzungsbedingungen, Schnittstelle (echter Abruf), Kosten. Die rund 110 genannten Quellen sind unten eingeordnet, dazu 8 selbst gefundene.

## ✅ Eingebaut und live (Commits ad13102, 1892c71), alle ohne Anmeldung
| Quelle | Herkunft | Was der Code daraus macht | Umfang je Lauf |
|---|---|---|---|
| Upbit (Korea) | Liste 3 | Warnhinweise je Coin, Neulistungen, Kimchi-Prämie | alle ~300 KRW-Coins |
| DefiLlama | Liste 1 | Gebührensprünge von Protokollen mit Token, Stablecoin-Menge | ~3.100 Protokolle |
| Grizzly, Fuzzy Panda, The Bear Cave | Liste 1 | Short-Seller-Bericht → Signal `shortreport`, bei Position Ereignis | alle neuen Berichte |
| BTC-ECHO | Liste 1 | deutsche Krypto-Schlagzeilen | stündlich |
| Asian Century Stocks, Emerging Market Skeptic, The Mikro Kap | Listen 1+3 | Ideen-Schlagzeilen Asien/Frontier/EU-Nebenwerte | täglich |
| Kraken Futures | eigener Fund (ersetzt Coinglass/Coinalyze) | Funding p. a., Open-Interest-Sprünge, auch Gold/Öl | ~200 Kontrakte |
| FINRA Short Interest | eigener Fund (ersetzt Fintel/Tapeboard) | Squeeze-Kandidaten, Auf-/Abbau von Leerverkäufen | alle US-Aktien inkl. OTC, 2×/Monat |
| Nasdaq-Handelsstopps | eigener Fund | Volatilitätspausen/Nachrichtenstopps je Wert | alle Stopps |
| Apple App Store | eigener Fund | Rang von Coinbase/Robinhood/Kalshi = Andrang Privatanleger | Top 100 USA |
| alternative.me Fear & Greed, Deribit DVOL | eigener Fund | Krypto-Stimmung und -Volatilität | täglich |
| Polymarket | eigener Fund | Wahrscheinlichkeiten Fed/Konjunktur/Krypto | ~10 Ereignisse |
| CFTC COT | eigener Fund | Spekulanten-Positionierung mit 3-Jahres-Perzentil | 8 Märkte |
Schon vorher in der App: OpenInsider, SEC 8-K, Reddit (ApeWisdom).

## ⏭️ Als Nächstes möglich (kostenlos)
- **Mit Schlüssel/Secret (Nutzer legt an):** Coinalyze (Funding/Liquidationen mehrerer Börsen), SEC EDGAR Volltext + Fails-to-Deliver (`SEC_KONTAKT`, ersetzt Dilution Tracker), Dune, OpenDART.
- **Ohne Anmeldung, nur noch Feed-Adresse/Bedingungen klären:** Kalshi (eigener Fund), US-Kongress-Trades (House Clerk), Börsengeflüster, Montega/SMC/GBC (HTML), Kabutan (Japan), ValuePickr (Indien), Nairametrics (Afrika), Substacks mit noch unbekannter Feed-Adresse (Japan Language Gap Alpha, Microcap Mavericks, Microcap Opportunities, European Hidden Gem Stocks, Silba, Norwegian Hidden Gems, Frontier Markets Ideas, LatAm Special Situations, Inside Corner, Kimchi Premium, Praya, Value Investing MY, LATAM STOCKS).
- **Prüfen, ob Gratis-Schnittstelle:** Tokenomist, Artemis, Token Terminal, Screener.in/Trendlyne/Tijori (Indien, Bedingungen streng).

## 📚 Nur Lernstoff (kein Datenabruf)
NexusFi, Elite Trader, r/RealDayTrading, Tradingqna, Jigsaw, Axia, Bookmap Learning Center, Quantpedia, TradesViz, MicroCapClub, Value Investors Club, Small Cap Discoveries, TrackingDifferences, etf.capital, ETF.com, findmymoat, Mirae Research, Four Pillars, Asia Frontier Capital, Vietnam Holdings, Offpiste, Kenkyo (seit 2023 still), The Hermit (seit 2023 still).

## ❌ Raus
- **Kostenpflichtig:** Shikiho, Smartkarma, Edgewonk, Newsquawk, SpotGamma-Kern, Dilution Tracker, Bookmap, FX Replay Pro, Argaam, Opstra, CryptoQuant-API, Nikkei Asia, Caixin, Coinglass-API (ab 29 $), Nansen, Delphi, Blockworks, DefiLlama-Unlocks (402), Fintel, Market Chameleon.
- **Verbot/Sperre:** FinancialJuice (Bedingungen verbieten Bots), TDnet (robots sperrt alles), Upbit-Website (nur die API ist frei), african-markets (sperrt KI-Bots), Culper (403), OTC Markets (blockt Abrufe), alte iTunes-RSS (robots), Minkabu (sperrt ClaudeBot), ClinicalTrials-API (robots sperrt /api/), Cboe-CDN (403).
- **Login/keine Schnittstelle:** Xueqiu, Eastmoney Guba, getquin, Sensibull, NiftyTrader, Chartink, Gammalens, Tapeboard, Arkham, CapEdge (API gesperrt), wikifolio (keine offene Schnittstelle), Wu Blockchain (X/Telegram), Telegram-/WhatsApp-Gruppen (BaFin-Warnungen), Kenyan Wall Street (Feed abgeschaltet), Bamboo Works (Verbindung verweigert), Spruce Point (kein Feed).

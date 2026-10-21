# Schattendepot

Lernende Börsen-**Simulation** mit fiktivem Geld zu Informations- und Lernzwecken.
**Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.**
Keine echten Orders, keine Anbindung an ein echtes Depot.

## Aufbau

| Baustein | Technik | Aufgabe |
|---|---|---|
| App | PWA: Vite + Preact + TypeScript, GitHub Pages | Anzeige, Briefing, Push-Anmeldung, Einstellungen |
| Datensammler | GitHub Actions (Cron), reiner Code | Quellen abfragen, Signale bewerten, Lagebild bauen |
| Gehirn | Claude-Code-Routinen (Pro-Abo, kein API-Schlüssel) | Entscheidungen, Berichte, Learnings |
| Kurswächter | GitHub Actions (alle 15 Min.), reiner Code | Orders ausführen, Ziel/Stop/Termin prüfen, Push |
| Daten | JSON im Branch `daten` | Ereignisprotokoll, Positionen, Signale, Statistik, Lektionen |
| Push | Web Push (VAPID) aus GitHub Actions | Mitteilungen aufs iPad |

Laufende Kosten: 0 € (außer dem Claude-Pro-Abo).

### Branches

- `main` – Code, Konfiguration (`config/`), Routinen-Anweisungen (`routine/`).
- `daten` – Laufzeitdaten; schreiben nur die Actions.
- `claude/lauf-<datum>-<typ>` – Ergebnis eines Routinen-Laufs; eine Action prüft, übernimmt und löscht den Branch.

### Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `core/` | Reine, getestete Logik: Gebühren, Steuern, Spreads, Rendite/Zielkurs, Datenmodell |
| `config/` | Gebührenmodell (Consorsbank), Steuern, Spreads, Einstellungen – nichts davon ist hart codiert |
| `src/` | PWA (Ansichten in `src/views/`, Service Worker `src/sw.ts`) |
| `scripts/` | Icons, Demo-Daten, Daten einbinden |
| `vorlage/daten/` | Startinhalt des `daten`-Branches |
| `demo/daten/` | Demo-Daten für Entwicklung und E2E-Tests (werden nie deployt) |

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (zeigt demo/daten oder _daten/)
npm test           # Unit-Tests (Vitest)
npm run build      # Produktions-Build nach dist/
npm run e2e        # Playwright: iPad hoch/quer, WebKit
npm run demo       # Demo-Daten neu erzeugen
```

## Fehler melden und beheben

In der App (Einstellungen oder Order-Detail) öffnet „Fehler melden“ ein vorbefülltes GitHub-Issue mit dem Label `fehler`.
Eine neue Claude-Sitzung arbeitet offene Issues ab (`gh issue list --label fehler`). Jeder Fix auf `main` wird automatisch
deployt; die App auf dem iPad aktualisiert sich beim nächsten Öffnen selbst.

## Kosten und Limits

Wird mit jedem Meilenstein ergänzt (Quellen-Katalog mit Kontingenten, Routinen-Läufe, Actions-Minuten).

## Fehlerbehebung

Wird mit jedem Meilenstein ergänzt.

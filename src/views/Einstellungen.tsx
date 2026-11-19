import einstellungen from '../../config/einstellungen.json';
import gebuehren from '../../config/gebuehren-smartbroker.json';
import steuern from '../../config/steuern.json';
import { euro, prozent } from '../../core/geld.ts';
import { steuersatz, type SteuerConfig } from '../../core/steuern.ts';
import { PFLICHTHINWEIS } from '../../core/typen.ts';
import { kalenderUrl, ladeJson, useDaten, type Kennzahlen } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { fehlerMeldenUrl, konfigBearbeitenUrl } from '../lib/links';
import { useEinstellung } from '../lib/lokal';
import { Karte } from '../ui';
import { PushKarte } from './PushKarte';

export function EinstellungenView() {
  const [nachSteuern, setNachSteuern] = useEinstellung('nachSteuern', false);
  const bearbeiten = konfigBearbeitenUrl('einstellungen.json');
  const fehlerUrl = fehlerMeldenUrl('Einstellungen');
  const stufe = gebuehren.orderentgelt;

  return (
    <div class="seite">
      <h1>Einstellungen</h1>

      <PushKarte />

      <Karte titel="Anzeige (nur dieses Gerät)">
        <label class="schalter">
          <input type="checkbox" checked={nachSteuern} onChange={(e) => setNachSteuern((e.target as HTMLInputElement).checked)} />
          Ergebnisse nach Steuern anzeigen
        </label>
      </Karte>

      <Karte
        titel="Simulation"
        aktion={
          bearbeiten && (
            <a class="knopf klein-knopf" href={bearbeiten} target="_blank" rel="noopener noreferrer">
              Auf GitHub ändern
            </a>
          )
        }
      >
        <dl class="werte">
          <dt>Betrag je Order</dt>
          <dd>ca. {einstellungen.orderBetrag} €</dd>
          <dt>Hebel-Limit</dt>
          <dd>{einstellungen.hebelMax}</dd>
          <dt>Schwelle Ereignislauf</dt>
          <dd>±{einstellungen.ereignisSchwelleProzent} % am Tag (max. {einstellungen.ereignisLaeufeProTag}/Tag)</dd>
          <dt>Warnung ohne Order</dt>
          <dd>{einstellungen.ausfallWarnungUhrzeit} Uhr</dd>
          <dt>Vergleich</dt>
          <dd>
            {einstellungen.vergleichsEtf.name} ({einstellungen.vergleichsEtf.isin})
          </dd>
        </dl>
        <p class="klein">Änderungen hier gelten nach dem nächsten Deploy (wenige Minuten).</p>
      </Karte>

      <Karte
        titel="Gebühren und Steuern"
        aktion={
          konfigBearbeitenUrl('gebuehren-smartbroker.json') && (
            <a class="knopf klein-knopf" href={konfigBearbeitenUrl('gebuehren-smartbroker.json')!} target="_blank" rel="noopener noreferrer">
              Auf GitHub ändern
            </a>
          )
        }
      >
        <dl class="werte">
          <dt>Modell</dt>
          <dd>
            {gebuehren.modell}, Stand {gebuehren.stand}
          </dd>
          <dt>Orderentgelt</dt>
          <dd>
            0 € ab 500 € (gettex), darunter 1 € · Hebelprodukte UniCredit 0 €, andere Emittenten 4 € · Krypto Trade Republic 1 €{stufe.grundpreis ? ` · Grundpreis ${stufe.grundpreis} €` : ''}
          </dd>
          <dt>Steuern</dt>
          <dd>
            {steuern.aktiv ? `${prozent(steuersatz(steuern as SteuerConfig) * 100, { vorzeichen: false, stellen: 3 })} mit Verlustverrechnung` : 'aus'}
            {steuern.kirchensteuer ? ` inkl. ${steuern.kirchensteuer * 100} % Kirchensteuer` : ', ohne Kirchensteuer'}
            {steuern.sparerpauschbetrag ? `, Sparerpauschbetrag ${steuern.sparerpauschbetrag} €` : ', ohne Sparerpauschbetrag'}
          </dd>
        </dl>
      </Karte>

      <SeitAnfangKarte />

      <Karte titel="Kalender-Abo">
        <p>Verkaufstermine als abonnierter Kalender – aktualisiert sich bei Änderungen von selbst.</p>
        <div class="knopfreihe">
          <a class="knopf" href={kalenderUrl()}>
            Kalender abonnieren
          </a>
          <button class="knopf zweitrangig" onClick={() => void navigator.clipboard?.writeText(kalenderUrl().replace(/^webcal:/, 'https:'))}>
            Link kopieren
          </button>
        </div>
      </Karte>

      <Karte titel="Daten">
        <div class="knopfreihe">
          <button class="knopf zweitrangig" onClick={() => void exportieren()}>
            Datenexport (JSON)
          </button>
          {fehlerUrl && (
            <a class="knopf zweitrangig" href={fehlerUrl} target="_blank" rel="noopener noreferrer">
              Fehler melden
            </a>
          )}
        </div>
        <p class="klein">Version {import.meta.env.VITE_VERSION ?? 'dev'}</p>
      </Karte>

      <p class="klein mittig">{PFLICHTHINWEIS}</p>
    </div>
  );
}

async function exportieren() {
  const dateien = ['positionen.json', 'abgeschlossen.json', 'kennzahlen.json', 'statistik.json', 'gewichte.json'];
  const daten: Record<string, unknown> = { exportiert: new Date().toISOString(), hinweis: PFLICHTHINWEIS };
  for (const d of dateien) daten[d] = await ladeJson(d).catch(() => null);
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `schattendepot-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Werte seit Anfang (Neustart der sichtbaren Zähler am 19.11.2026 – Nutzer: Zähler neu, Anfangswerte bleiben hier stehen) */
function SeitAnfangKarte() {
  const k = useDaten<Kennzahlen>('kennzahlen.json');
  const d = useDaten<{ zaehlerAb?: string; seitAnfang?: { anzahl: number; netto: number; brutto: number; quote: number } }>('daytrading/uebersicht.json');
  const a = k.status === 'ok' ? k.daten.seitAnfang : undefined;
  const dt = d.status === 'ok' ? d.daten.seitAnfang : undefined;
  if (!a && !dt) return null;
  const ab = (k.status === 'ok' && k.daten.zaehlerAb) || (d.status === 'ok' && d.daten.zaehlerAb) || '';
  return (
    <Karte titel="Werte seit Anfang (vor dem Neustart)">
      <div data-testid="seit-anfang">
        <p class="klein">Die sichtbaren Zähler laufen seit {ab ? datumKurz(ab) : '–'} neu, weil das Programm grundlegend erneuert wurde. Hier stehen die Werte seit dem ersten Tag (21.10.2026).</p>
        {a && (
          <p>
            Depot: {euro(a.netto, { vorzeichen: true })} nach Gebühren aus {a.anzahlGeschlossen} Orders · Trefferquote {a.trefferquote === null ? '–' : prozent(a.trefferquote, { vorzeichen: false, stellen: 0 })} · gleiche Orders im MSCI World {euro(a.etfNetto, { vorzeichen: true })}
          </p>
        )}
        {dt && (
          <p>
            Daytrading: {euro(dt.netto, { vorzeichen: true })} nach Gebühren aus {dt.anzahl} Trades · vor Gebühren {euro(dt.brutto, { vorzeichen: true })} · Treffer {prozent(dt.quote, { vorzeichen: false })}
          </p>
        )}
      </div>
    </Karte>
  );
}

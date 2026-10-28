import einstellungen from '../../config/einstellungen.json';
import gebuehren from '../../config/gebuehren-smartbroker.json';
import steuern from '../../config/steuern.json';
import { prozent } from '../../core/geld.ts';
import { steuersatz, type SteuerConfig } from '../../core/steuern.ts';
import { PFLICHTHINWEIS } from '../../core/typen.ts';
import { kalenderUrl, ladeJson } from '../lib/daten';
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

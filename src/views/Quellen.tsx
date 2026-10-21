import { useDaten, type Systemstatus } from '../lib/daten';
import { relativ } from '../lib/zeit';
import { Geladen, Karte, Leer } from '../ui';

export interface Quellenstatus {
  stand: string;
  quellen: { id: string; name: string; zuletztOk?: string; letzterFehler?: string; kontingent?: { genutzt: number; limit: number; zeitraum: string } }[];
}

export function QuellenView() {
  const z = useDaten<Quellenstatus>('quellenstatus.json');
  const system = useDaten<Systemstatus>('system.json');
  return (
    <div class="seite">
      <h1>Quellenstatus</h1>
      <Geladen
        z={system}
        kinder={(s) => (
          <Karte titel="Abläufe">
            <dl class="werte">
              <dt>Kurswächter</dt>
              <dd>{s.letzterWaechterLauf ? relativ(s.letzterWaechterLauf) : '–'}</dd>
              <dt>Datensammler</dt>
              <dd>{s.letzterSammlerLauf ? relativ(s.letzterSammlerLauf) : '–'}</dd>
              <dt>Claude</dt>
              <dd>{s.letzterClaudeLauf ? `${s.letzterClaudeLauf.typ}, ${relativ(s.letzterClaudeLauf.zeit)}` : '–'}</dd>
            </dl>
          </Karte>
        )}
      />
      <Geladen
        z={z}
        leer="Noch keine Quellen aktiv – der Datensammler folgt in Meilenstein 4."
        kinder={(d) =>
          d.quellen.length === 0 ? (
            <Leer>Keine Quellen.</Leer>
          ) : (
            <table class="tabelle">
              <thead>
                <tr>
                  <th>Quelle</th>
                  <th>Zuletzt geliefert</th>
                  <th>Kontingent</th>
                  <th>Letzter Fehler</th>
                </tr>
              </thead>
              <tbody>
                {d.quellen.map((q) => (
                  <tr key={q.id} class={q.letzterFehler && (!q.zuletztOk || q.letzterFehler > q.zuletztOk) ? 'zeile-fehler' : ''}>
                    <td>{q.name}</td>
                    <td>{q.zuletztOk ? relativ(q.zuletztOk) : '–'}</td>
                    <td>{q.kontingent ? `${q.kontingent.genutzt} / ${q.kontingent.limit} pro ${q.kontingent.zeitraum}` : '–'}</td>
                    <td class="klein">{q.letzterFehler ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      />
    </div>
  );
}

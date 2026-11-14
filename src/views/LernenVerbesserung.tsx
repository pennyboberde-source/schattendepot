// Bereich „Lernen“ – Selbstverbesserung (Plan Volltreffer VS): Was sich verbessert hat, woran es gemessen wird,
// was abgelehnt wurde, und der Weg zum Rückgängigmachen.
import type { VerbesserungUebersicht } from '../../core/verbesserung/uebersicht.ts';
import { useDaten } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Karte } from '../ui';

const BEREICH: Record<string, string> = { depot: 'Depot', daytrading: 'Daytrading', volltreffer: 'Volltreffer', datenkrake: 'Datenkrake', quellen: 'Quellen', oberflaeche: 'Oberfläche', routinen: 'Routinen', system: 'System' };
const URTEIL: Record<string, string> = { besser: '✅ wirkt', gleich: '➖ kein Unterschied', schlechter: '❌ wirkt schlechter', 'nicht messbar': '❔ nicht messbar' };

/** Text mit anklickbaren Links (für Anleitungen am iPad). */
function MitLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/[^\s)]+)/g).map((teil, i) =>
        teil.startsWith('https://') ? (
          <a key={i} href={teil} target="_blank" rel="noopener noreferrer">
            {teil.replace(/^https:\/\/(www\.)?/, '').slice(0, 48)}
          </a>
        ) : (
          teil
        ),
      )}
    </>
  );
}

export function VerbesserungKarte() {
  const z = useDaten<VerbesserungUebersicht>('lernen/verbesserung/uebersicht.json');
  const u = z.status === 'ok' ? z.daten : null;
  return (
    <Karte titel="🛠️ Was sich verbessert hat">
      <p class="klein">
        Jeden Samstag verbessert sich die App selbst in kleinen Schritten – nur innerhalb fester Leitplanken und erst nach Tests und einem Probelauf. Jede Änderung nennt, was sie bewirken soll und woran der Code das nach 2 bis 4 Wochen misst.
        {u && !u.aktiv ? ' Zurzeit ausgeschaltet.' : ''}
      </p>
      {!u ? (
        <p class="leer">Noch keine Verbesserung übernommen – der erste Lauf kommt am Samstag.</p>
      ) : (
        <div data-testid="verbesserung-karte">
          {u.freigaben.length > 0 && (
            <ul class="liste">
              {u.freigaben.map((f) => (
                <li key={f.titel}>
                  <strong>🔴❗ {f.titel}</strong>
                  <div class="klein">
                    <MitLinks text={f.anleitung} />
                    {f.secret ? ` · Name des Secrets: ${f.secret}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {u.uebernahmen.length === 0 ? (
            <p class="leer">Noch keine Verbesserung übernommen – der erste Lauf kommt am Samstag.</p>
          ) : (
            <ul class="liste">
              {u.uebernahmen.map((x) => (
                <li key={x.merge}>
                  <div class="position-kopf">
                    <strong>
                      {datumKurz(x.datum)}: {x.zusammenfassung}
                    </strong>
                    {x.status === 'aktiv' ? (
                      <a href={u.rueckgaengigLink} target="_blank" rel="noopener noreferrer">
                        Rückgängig machen
                      </a>
                    ) : (
                      <span class="klein">zurückgenommen</span>
                    )}
                  </div>
                  {x.grund && <div class="klein">Zurückgenommen: {x.grund}</div>}
                  {x.aenderungen.map((a) => (
                    <div class="klein" key={a.id}>
                      <strong>{a.titel}</strong> ({BEREICH[a.bereich] ?? a.bereich}) – {a.hypothese} Gemessen an: {a.messkriterium}
                      {a.urteil ? ` → ${URTEIL[a.urteil] ?? a.urteil}` : ' → Bewertung folgt'}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {u.uebernahmen.some((x) => x.status === 'aktiv') && <p class="klein">Rückgängig machen: Der Link öffnet GitHub. Dort „Run workflow“ antippen, nichts ausfüllen, grünen Knopf drücken – die jüngste Übernahme wird zurückgenommen.</p>}
          {u.abgelehnt.length > 0 && (
            <>
              <h3>Nicht übernommen</h3>
              <ul class="liste klein">
                {u.abgelehnt.map((a) => (
                  <li key={a.zeit}>
                    {datumKurz(a.zeit.slice(0, 10))}: {a.gruende.slice(0, 3).join(' · ')}
                    {a.gruende.length > 3 ? ` · und ${a.gruende.length - 3} weitere` : ''}{' '}
                    {a.link && (
                      <a href={a.link} target="_blank" rel="noopener noreferrer">
                        Begründung
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {u.kandidaten.length > 0 && (
            <>
              <h3>Als Nächstes im Verbesserungsbuch</h3>
              <ul class="liste klein">
                {u.kandidaten.slice(0, 5).map((k) => (
                  <li key={k.id}>
                    {k.titel} <span class="klein">({BEREICH[k.bereich] ?? k.bereich})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Karte>
  );
}

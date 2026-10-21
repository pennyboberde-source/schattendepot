import { useDaten } from '../lib/daten';
import { datum, uhrzeit } from '../lib/zeit';
import { Geladen, Karte, Leer } from '../ui';

/** Format von lagebild/<datum>.json (Datensammler, Meilenstein 4) plus Briefing aus dem Morgenlauf. */
export interface Lagebild {
  datum: string;
  erstellt: string;
  briefing?: string[];
  makro: string[];
  termine: { zeit: string; text: string }[];
  meldungen: { titel: string; quelle: string; link: string; wertpapier?: string }[];
  insider: { wertpapier: string; text: string; link: string }[];
  positionen?: { id: string; name: string; meldungen: { titel: string; quelle: string; link: string }[] }[];
  kandidaten: { name: string; isin?: string; score: number; fakten: string[]; quellen: { name: string; link: string }[] }[];
}

export function BriefingView({ datum: gewaehlt }: { datum?: string }) {
  const index = useDaten<{ tage: string[] }>('lagebild/index.json');
  const datei = gewaehlt ? `lagebild/${gewaehlt}.json` : 'lagebild/heute.json';
  const z = useDaten<Lagebild>(datei);
  const tage = index.status === 'ok' ? index.daten.tage : [];

  return (
    <div class="seite">
      <h1>Briefing</h1>
      {tage.length > 0 && (
        <div class="filter">
          <label>
            Tag
            <select value={gewaehlt ?? ''} onChange={(e) => (location.hash = `/briefing/${(e.target as HTMLSelectElement).value}`)}>
              <option value="">Heute</option>
              {tage.map((t) => (
                <option key={t} value={t}>
                  {datum(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Geladen
        z={z}
        leer="Noch kein Lagebild – der Datensammler wird in Meilenstein 4 gebaut."
        kinder={(l) => (
          <>
            <p class="untertitel">
              {datum(l.datum)} · erstellt {uhrzeit(l.erstellt)} Uhr
            </p>
            {l.briefing && l.briefing.length > 0 && (
              <Karte titel="☀️ Briefing">
                <ol>{l.briefing.map((b) => <li key={b}>{b}</li>)}</ol>
              </Karte>
            )}
            <div class="zwei-spalten">
              <Karte titel="Makro-Kurzlage">{l.makro.length ? <ul>{l.makro.map((m) => <li key={m}>{m}</li>)}</ul> : <Leer>–</Leer>}</Karte>
              <Karte titel="Termine heute">
                {l.termine.length ? (
                  <ul>
                    {l.termine.map((t) => (
                      <li key={t.zeit + t.text}>
                        <strong>{t.zeit}</strong> {t.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Leer>Keine Termine.</Leer>
                )}
              </Karte>
            </div>
            {l.positionen && l.positionen.length > 0 && (
              <Karte titel="Nachrichten zu offenen Positionen">
                <ul class="liste">
                  {l.positionen.map((p) => (
                    <li key={p.id}>
                      <a href={`#/order/${p.id}`}>
                        <strong>{p.name}</strong>
                      </a>
                      {p.meldungen.length === 0 ? (
                        <span class="klein"> – nichts Neues</span>
                      ) : (
                        <ul>
                          {p.meldungen.map((m) => (
                            <li key={m.link}>
                              <a href={m.link} target="_blank" rel="noopener noreferrer">
                                {m.titel}
                              </a>{' '}
                              <span class="klein">{m.quelle}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </Karte>
            )}
            <Karte titel="Kandidaten">
              {l.kandidaten.length ? (
                <table class="tabelle">
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Wertpapier</th>
                      <th>Fakten</th>
                      <th>Quellen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.kandidaten.map((k) => (
                      <tr key={k.name}>
                        <td>
                          <strong>{k.score}</strong>
                        </td>
                        <td>{k.name}</td>
                        <td>{k.fakten.join(' · ')}</td>
                        <td>
                          {k.quellen.map((q) => (
                            <a key={q.link} href={q.link} target="_blank" rel="noopener noreferrer">
                              {q.name}{' '}
                            </a>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Leer>Keine Kandidaten.</Leer>
              )}
            </Karte>
            <div class="zwei-spalten">
              <Karte titel="Top-Meldungen">
                <ul class="liste">
                  {l.meldungen.map((m) => (
                    <li key={m.link}>
                      <a href={m.link} target="_blank" rel="noopener noreferrer">
                        {m.titel}
                      </a>{' '}
                      <span class="klein">{m.quelle}</span>
                    </li>
                  ))}
                </ul>
              </Karte>
              <Karte titel="Insider-Käufe">
                <ul class="liste">
                  {l.insider.map((i) => (
                    <li key={i.link}>
                      <a href={i.link} target="_blank" rel="noopener noreferrer">
                        {i.wertpapier}
                      </a>{' '}
                      <span class="klein">{i.text}</span>
                    </li>
                  ))}
                </ul>
              </Karte>
            </div>
          </>
        )}
      />
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { ladeText } from '../lib/daten';
import { Karte, Leer } from '../ui';

/** Lektionen, Statistik und Gewichte – ausgebaut in Meilenstein 5. */
export function LernenView() {
  const [lektionen, setLektionen] = useState<string | null>(null);
  useEffect(() => {
    ladeText('lernen/lektionen.md')
      .then(setLektionen)
      .catch(() => setLektionen(''));
  }, []);
  return (
    <div class="seite">
      <h1>Lernen</h1>
      <Karte titel="Lektionen">
        {lektionen ? <pre class="bericht">{lektionen}</pre> : <Leer>Noch keine Lektionen – sie entstehen aus abgeschlossenen Orders.</Leer>}
      </Karte>
      <Karte titel="Statistik, Kalibrierung und Gewichte">
        <Leer>Folgt mit der Lernschleife (Meilenstein 5).</Leer>
      </Karte>
    </div>
  );
}

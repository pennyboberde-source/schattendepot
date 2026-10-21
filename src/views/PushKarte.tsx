import { useEffect, useState } from 'preact/hooks';
import einstellungen from '../../config/einstellungen.json';
import { useDaten, type Systemstatus } from '../lib/daten';
import { REPO } from '../lib/links';
import { aktuelleAnmeldung, istStandalone, pushAnmelden, pushMoeglich } from '../lib/push';
import { relativ } from '../lib/zeit';
import { Karte } from '../ui';

const PUSH_TYP_TEXT: Record<string, string> = {
  briefing: '☀️ Briefing',
  gekauft: '🟢 Gekauft',
  angepasst: '🔁 Anpassung',
  verkauft: '✅ Verkauft',
  stop: '🔻 Stop',
  knockout: '⚡ Knock-out',
  bericht: '📘 Abschlussbericht',
  warnung: '⚠️ Warnungen',
  wochenrueckblick: '📊 Wochenrückblick',
};

export function PushKarte() {
  const system = useDaten<Systemstatus & { letzterPush?: string }>('system.json');
  const [code, setCode] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [angemeldet, setAngemeldet] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const abgelaufen = system.status === 'ok' && system.daten.pushAbgelaufen;

  useEffect(() => {
    // Nur in der installierten App: Push gibt es auf iPadOS ohnehin nur dort, und manche
    // Browser-Umgebungen (z. B. WebKit unter Windows) blockieren bei getSubscription().
    if (istStandalone()) void aktuelleAnmeldung().then((s) => setAngemeldet(!!s));
  }, []);

  const anmelden = async (neu: boolean) => {
    setFehler(null);
    try {
      setCode(await pushAnmelden(neu));
      setAngemeldet(true);
    } catch (e) {
      setFehler((e as Error).message);
    }
  };

  const kopieren = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setKopiert(true);
    } catch {
      setFehler('Kopieren nicht möglich – bitte den Code im Feld markieren und kopieren.');
    }
  };

  return (
    <Karte titel="Mitteilungen">
      {abgelaufen && <p class="banner warnung">Die Push-Anmeldung ist abgelaufen. Tippe auf „Push neu verbinden“ und hinterlege den neuen Code.</p>}
      {!pushMoeglich() ? (
        <p>Dieser Browser unterstützt keine Web-Push-Mitteilungen.</p>
      ) : !istStandalone() ? (
        <p>
          Mitteilungen gibt es auf dem iPad nur für die App auf dem Home-Bildschirm: in Safari auf <strong>Teilen → Zum Home-Bildschirm</strong> tippen, die App dort öffnen und
          hier „Mitteilungen erlauben“ wählen.
        </p>
      ) : (
        <div class="knopfreihe">
          <button class="knopf" onClick={() => void anmelden(false)}>
            {angemeldet ? 'Push-Code anzeigen' : 'Mitteilungen erlauben'}
          </button>
          {(angemeldet || abgelaufen) && (
            <button class="knopf zweitrangig" onClick={() => void anmelden(true)}>
              Push neu verbinden
            </button>
          )}
        </div>
      )}
      {fehler && <p class="banner warnung">{fehler}</p>}
      {code && (
        <div class="push-code">
          <p>
            <strong>Letzter Schritt:</strong> Code kopieren und auf GitHub als Secret mit dem Namen <code>PUSH_SUBSCRIPTION</code> speichern.
          </p>
          <textarea readOnly rows={4} value={code} aria-label="Push-Code" onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
          <div class="knopfreihe">
            <button class="knopf" onClick={() => void kopieren()}>
              {kopiert ? 'Kopiert ✓' : 'Push-Code kopieren'}
            </button>
            {REPO && (
              <a class="knopf zweitrangig" href={`https://github.com/${REPO}/settings/secrets/actions/new`} target="_blank" rel="noopener noreferrer">
                Secret auf GitHub anlegen
              </a>
            )}
          </div>
          <p class="klein">Kurz danach kommt automatisch eine Test-Mitteilung „✅ Push verbunden“.</p>
        </div>
      )}
      {system.status === 'ok' && system.daten.letzterPush && <p class="klein">Letzte Mitteilung {relativ(system.daten.letzterPush)}</p>}
      <p class="klein">
        Ruhezeit {einstellungen.ruhezeit.von}–{einstellungen.ruhezeit.bis} Uhr: Nachrichten werden gesammelt und danach zugestellt.
      </p>
      <ul class="chips">
        {Object.entries(einstellungen.pushTypen).map(([typ, an]) => (
          <li key={typ} class={an ? 'an' : 'aus'}>
            {PUSH_TYP_TEXT[typ] ?? typ}: {an ? 'an' : 'aus'}
          </li>
        ))}
      </ul>
    </Karte>
  );
}

import { useEffect, useState } from 'preact/hooks';
import einstellungen from '../../config/einstellungen.json';
import { useDaten, type Systemstatus } from '../lib/daten';
import { REPO } from '../lib/links';
import { aktuelleAnmeldung, istStandalone, PUSH_GERAETE, pushAnmelden, pushMoeglich, secretFuerDiesesGeraet } from '../lib/push';
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
  const [secret, setSecret] = useState<string>(() => secretFuerDiesesGeraet());
  const geraete = system.status === 'ok' ? (system.daten.pushGeraete ?? {}) : {};
  // Gibt es das Secret schon? (vor dem ersten Lauf mit Geräteliste ist nur das iPad-Secret bekannt)
  const schonDa = !!geraete[secret] || (secret === 'PUSH_SUBSCRIPTION' && !Object.keys(geraete).length);
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
      {abgelaufen && <p class="banner warnung">Eine Push-Anmeldung ist abgelaufen. Tippe auf dem betroffenen Gerät auf „Push neu verbinden“ und hinterlege den neuen Code.</p>}
      {!pushMoeglich() ? (
        <p>Dieser Browser unterstützt keine Web-Push-Mitteilungen.</p>
      ) : !istStandalone() ? (
        <p>
          Mitteilungen gibt es auf iPad und iPhone nur für die App auf dem Home-Bildschirm: in Safari auf <strong>Teilen → Zum Home-Bildschirm</strong> tippen, die App dort öffnen
          und hier „Mitteilungen erlauben“ wählen. Jedes Gerät bekommt dieselben Mitteilungen und zeigt dieselben Daten.
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
          <p class="klein">Dieses Gerät:</p>
          <ul class="chips" data-testid="push-geraet-wahl">
            {PUSH_GERAETE.map((g) => (
              <li key={g.secret} class={g.secret === secret ? 'an' : 'aus'}>
                <button type="button" class="chip-knopf" onClick={() => setSecret(g.secret)}>
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
          <p data-testid="push-schritt">
            <strong>Letzter Schritt:</strong> Code kopieren und auf GitHub im Tresor speichern: „live“ antippen,{' '}
            {schonDa ? (
              <>
                beim Secret <code>{secret}</code> auf den Stift tippen, Code einsetzen, „Update secret“.
              </>
            ) : (
              <>
                „Add environment secret“ antippen, als Name <code>{secret}</code> eintragen, Code einsetzen, „Add secret“.
              </>
            )}{' '}
            Nur dort lesen ihn die Jobs.
          </p>
          <textarea readOnly rows={4} value={code} aria-label="Push-Code" onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
          <div class="knopfreihe">
            <button class="knopf" onClick={() => void kopieren()}>
              {kopiert ? 'Kopiert ✓' : 'Push-Code kopieren'}
            </button>
            {REPO && (
              <a class="knopf zweitrangig" href={`https://github.com/${REPO}/settings/environments`} target="_blank" rel="noopener noreferrer">
                Tresor auf GitHub öffnen
              </a>
            )}
          </div>
          <p class="klein">Zeigt GitHub „404“? Die Home-Bildschirm-App ist dort nicht angemeldet. Dann den Code kopieren, <strong>Safari</strong> öffnen, bei GitHub anmelden und <code>github.com/{REPO}/settings/environments</code> aufrufen.</p>
          <p class="klein">Kurz danach kommt automatisch eine Test-Mitteilung „✅ Push verbunden“.</p>
        </div>
      )}
      {Object.keys(geraete).length > 0 && (
        <ul class="liste klein" data-testid="push-geraete">
          {PUSH_GERAETE.filter((g) => geraete[g.secret]).map((g) => (
            <li key={g.secret}>
              {g.name}: {geraete[g.secret].abgelaufen ? '⚠️ abgelaufen – auf diesem Gerät „Push neu verbinden“' : '✅ verbunden'}
              {geraete[g.secret].letzterPush ? ` · letzte Mitteilung ${relativ(geraete[g.secret].letzterPush!)}` : ''}
            </li>
          ))}
        </ul>
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

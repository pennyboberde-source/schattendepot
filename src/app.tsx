import { useEffect, useState } from 'preact/hooks';
import { PFLICHTHINWEIS } from '../core/typen.ts';
import { Icon } from './ui';
import { UebersichtView } from './views/Uebersicht';
import { BriefingView } from './views/Briefing';
import { OrderDetailView } from './views/OrderDetail';
import { AbgeschlossenView } from './views/Abgeschlossen';
import { DaytradingView } from './views/Daytrading';
import { DepotNav, HeuteView } from './views/Heute';
import { LernenView } from './views/Lernen';
import { QuellenView } from './views/Quellen';
import { EinstellungenView } from './views/Einstellungen';

// 4 Bereiche (Plan Datenkrake): Heute · Depot · Daytrading · Lernen, dazu Einstellungen.
const TABS = [
  { route: 'heute', label: 'Heute', icon: 'briefing' },
  { route: 'depot', label: 'Depot', icon: 'uebersicht' },
  { route: 'daytrading', label: 'Daytrading', icon: 'daytrading' },
  { route: 'lernen', label: 'Lernen', icon: 'lernen' },
  { route: 'einstellungen', label: 'Einstellungen', icon: 'einstellungen' },
] as const;

/** Alte und Unter-Routen (Push-Links bleiben gültig) → aktiver Bereich */
const BEREICH: Record<string, string> = { uebersicht: 'depot', abgeschlossen: 'depot', order: 'depot', briefing: 'heute', quellen: 'lernen' };

function leseRoute(): string[] {
  const h = location.hash.replace(/^#\/?/, '');
  return (h || 'heute').split('/').map(decodeURIComponent);
}

export function navigiere(route: string) {
  location.hash = `/${route}`;
}

export function App() {
  const [route, setRoute] = useState(leseRoute());
  useEffect(() => {
    const onHash = () => {
      setRoute(leseRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const [top, arg] = route;
  const aktiverTab = BEREICH[top] ?? top;
  return (
    <div class="app">
      <main class="inhalt" id="main">
        {top === 'heute' && <HeuteView />}
        {(top === 'depot' || top === 'uebersicht') && (
          <>
            <DepotNav aktiv="positionen" />
            <UebersichtView />
          </>
        )}
        {top === 'briefing' && <BriefingView datum={arg} />}
        {top === 'order' && arg && <OrderDetailView id={arg} />}
        {top === 'abgeschlossen' && (
          <>
            <DepotNav aktiv="abgeschlossen" />
            <AbgeschlossenView />
          </>
        )}
        {top === 'daytrading' && <DaytradingView />}
        {top === 'lernen' && <LernenView />}
        {top === 'quellen' && <QuellenView />}
        {top === 'einstellungen' && <EinstellungenView />}
        {!TABS.some((t) => t.route === top) && !BEREICH[top] && <HeuteView />}
      </main>
      <footer class="hinweis-fuss">
        {PFLICHTHINWEIS}
      </footer>
      <nav class="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.route} href={`#/${t.route}`} class={aktiverTab === t.route ? 'aktiv' : ''} aria-current={aktiverTab === t.route ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

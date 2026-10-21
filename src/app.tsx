import { useEffect, useState } from 'preact/hooks';
import { PFLICHTHINWEIS } from '../core/typen.ts';
import { Icon } from './ui';
import { UebersichtView } from './views/Uebersicht';
import { BriefingView } from './views/Briefing';
import { OrderDetailView } from './views/OrderDetail';
import { AbgeschlossenView } from './views/Abgeschlossen';
import { LernenView } from './views/Lernen';
import { QuellenView } from './views/Quellen';
import { EinstellungenView } from './views/Einstellungen';

const TABS = [
  { route: 'uebersicht', label: 'Übersicht', icon: 'uebersicht' },
  { route: 'briefing', label: 'Briefing', icon: 'briefing' },
  { route: 'abgeschlossen', label: 'Abgeschlossen', icon: 'abgeschlossen' },
  { route: 'lernen', label: 'Lernen', icon: 'lernen' },
  { route: 'quellen', label: 'Quellen', icon: 'quellen' },
  { route: 'einstellungen', label: 'Einstellungen', icon: 'einstellungen' },
] as const;

function leseRoute(): string[] {
  const h = location.hash.replace(/^#\/?/, '');
  return (h || 'uebersicht').split('/').map(decodeURIComponent);
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
  const aktiverTab = top === 'order' ? 'uebersicht' : top;
  return (
    <div class="app">
      <main class="inhalt" id="main">
        {top === 'uebersicht' && <UebersichtView />}
        {top === 'briefing' && <BriefingView datum={arg} />}
        {top === 'order' && arg && <OrderDetailView id={arg} />}
        {top === 'abgeschlossen' && <AbgeschlossenView />}
        {top === 'lernen' && <LernenView />}
        {top === 'quellen' && <QuellenView />}
        {top === 'einstellungen' && <EinstellungenView />}
        {!TABS.some((t) => t.route === top) && top !== 'order' && <UebersichtView />}
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

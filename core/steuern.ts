// Abgeltungsteuer mit Verlustverrechnung wie bei einer deutschen Bank (config/steuern.json).
// Die Steuer je Verkauf ist die Änderung der Jahressteuer durch diesen Verkauf –
// ein späterer Verlust führt also wie in der Realität zu einer (negativen) Steuer = Erstattung.
import { runde } from './geld.ts';

export type Steuertopf = 'aktien' | 'sonstige';

export interface SteuerConfig {
  aktiv: boolean;
  abgeltungsteuer: number;
  soli: number;
  kirchensteuer: number;
  sparerpauschbetrag: number;
  verlustvortrag: boolean;
}

export interface SteuerFall {
  id: string;
  /** ISO-Zeitpunkt des Verkaufs. */
  zeit: string;
  /** Ergebnis nach Gebühren in Euro (Gewinn positiv, Verlust negativ). */
  ergebnis: number;
  topf: Steuertopf;
  /** Teilfreistellung (z. B. 0.3 für Aktien-ETFs). */
  teilfreistellung?: number;
}

export interface SteuerJahr {
  jahr: number;
  steuer: number;
  vortragAktien: number;
  vortragSonstige: number;
}

export interface SteuerErgebnis {
  proFall: Record<string, { steuer: number; nachSteuern: number }>;
  jahre: SteuerJahr[];
}

/** Gesamtsatz inkl. Soli und ggf. Kirchensteuer (Kirchensteuer mindert die Abgeltungsteuer, § 32d EStG). */
export function steuersatz(cfg: SteuerConfig): number {
  const abg = cfg.abgeltungsteuer / (1 + cfg.abgeltungsteuer * cfg.kirchensteuer);
  return abg * (1 + cfg.soli + cfg.kirchensteuer);
}

const jahrFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric' });
export function berlinJahr(iso: string): number {
  return Number(jahrFmt.format(new Date(iso)));
}

/** Steuerpflichtige Basis aus Aktien-Saldo A und sonstigem Saldo S (jeweils inkl. Vortrag). */
function basis(a: number, s: number, pausch: number): number {
  const roh = a > 0 ? Math.max(0, a + s) : Math.max(0, s);
  return Math.max(0, roh - pausch);
}

function vortraege(a: number, s: number): { aktien: number; sonstige: number } {
  if (a > 0) return { aktien: 0, sonstige: Math.min(0, a + s) };
  return { aktien: Math.min(0, a), sonstige: Math.min(0, s) };
}

export function steuernBerechnen(faelle: SteuerFall[], cfg: SteuerConfig): SteuerErgebnis {
  const proFall: SteuerErgebnis['proFall'] = {};
  const jahre: SteuerJahr[] = [];
  if (!cfg.aktiv) {
    for (const f of faelle) proFall[f.id] = { steuer: 0, nachSteuern: runde(f.ergebnis) };
    return { proFall, jahre };
  }
  const satz = steuersatz(cfg);
  const sortiert = [...faelle].sort((x, y) => x.zeit.localeCompare(y.zeit));
  let vortragA = 0;
  let vortragS = 0;
  let jahr: number | null = null;
  let a = 0;
  let s = 0;
  let steuerBisher = 0;

  const jahrAbschliessen = () => {
    if (jahr === null) return;
    const v = vortraege(a, s);
    vortragA = cfg.verlustvortrag ? v.aktien : 0;
    vortragS = cfg.verlustvortrag ? v.sonstige : 0;
    jahre.push({ jahr, steuer: runde(steuerBisher), vortragAktien: runde(vortragA), vortragSonstige: runde(vortragS) });
  };

  for (const f of sortiert) {
    const j = berlinJahr(f.zeit);
    if (j !== jahr) {
      jahrAbschliessen();
      jahr = j;
      a = vortragA;
      s = vortragS;
      steuerBisher = 0;
    }
    const steuerbar = f.ergebnis * (1 - (f.teilfreistellung ?? 0));
    if (f.topf === 'aktien') a += steuerbar;
    else s += steuerbar;
    const steuerJetzt = runde(basis(a, s, cfg.sparerpauschbetrag) * satz);
    const steuer = runde(steuerJetzt - steuerBisher);
    steuerBisher = steuerJetzt;
    proFall[f.id] = { steuer, nachSteuern: runde(f.ergebnis - steuer) };
  }
  jahrAbschliessen();
  return { proFall, jahre };
}

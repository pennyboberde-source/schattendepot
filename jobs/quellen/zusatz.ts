// Register für Quellen, die der wöchentliche Verbesserungslauf neu einbaut (Plan Volltreffer VS).
// Regeln (die Übernahme-Action prüft sie): Jede neue Quelle steht in einer NEUEN Datei in diesem Ordner, hält die
// Schnittstelle `Quelle` ein (Zeitlimit, Kontingent, Tests nur mit aufgezeichneten Antworten) und wird hier
// angehängt. Einträge dürfen nur dazukommen – keine Quelle wird je entfernt. Braucht eine Quelle einen
// Gratis-Schlüssel, nennt sie ihn in `schluessel`; ohne das Secret überspringt der Sammler sie von selbst.
import type { Quelle } from './typen.ts';

export const ZUSATZ_QUELLEN: Quelle[] = [];

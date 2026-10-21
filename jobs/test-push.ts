// Test-Push (Trockenlauf / nach Hinterlegen der Push-Anmeldung). Aufruf: node jobs/test-push.ts
import { pushen } from './lib/pushen.ts';

const jetzt = new Date();
const n = await pushen(
  [{ typ: 'warnung', titel: '🧪 Test-Push', text: 'Wenn du das liest, funktionieren die Mitteilungen. (Simulation – keine Anlageberatung)', ziel: '#/einstellungen', tag: 'test', erstellt: jetzt.toISOString() }],
  jetzt,
  { sofort: true },
);
console.log(`${n} Mitteilung(en) gesendet.`);
if (!process.env.PUSH_SUBSCRIPTION) process.exitCode = 0;

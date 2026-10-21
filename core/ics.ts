// Kalender-Abo (termine.ics) mit den geplanten Verkaufsterminen offener und vorgemerkter Orders.
import { euro, prozent } from './geld.ts';
import type { Order } from './typen.ts';

function icsZeit(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen über 75 Oktette falten (RFC 5545). */
function falten(zeile: string): string {
  const teile: string[] = [];
  let rest = zeile;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let n = 75;
    while (Buffer.byteLength(rest.slice(0, n), 'utf8') > 75) n--;
    teile.push(rest.slice(0, n));
    rest = ' ' + rest.slice(n);
  }
  teile.push(rest);
  return teile.join('\r\n');
}

export function termineIcs(orders: Order[], jetzt: string, appUrl: string): string {
  const zeilen = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schattendepot//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Schattendepot Verkaufstermine', 'X-WR-TIMEZONE:Europe/Berlin', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const o of orders) {
    if (o.status !== 'offen' && o.status !== 'vorgemerkt') continue;
    const start = new Date(o.verkaufstermin);
    const ende = new Date(start.getTime() + 15 * 60000);
    const p = o.plan;
    const beschreibung = [
      `Simulation – keine Anlageberatung.`,
      o.zielkurs ? `Ziel ${euro(o.zielkurs)}` : `Ziel ${prozent(p.zielNettoProzent)} netto`,
      o.stopkurs ? `Stop ${euro(o.stopkurs)}` : `Stop ${prozent(p.stopProzent)}`,
      `Chance ~${p.konfidenz} %`,
      `${appUrl}#/order/${o.id}`,
    ].join('\n');
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${o.id}@schattendepot`,
      `DTSTAMP:${icsZeit(jetzt)}`,
      `SEQUENCE:${o.anpassungen.length}`,
      `DTSTART:${icsZeit(start.toISOString())}`,
      `DTEND:${icsZeit(ende.toISOString())}`,
      `SUMMARY:${escape(`Verkauf geplant: ${p.wertpapier.name}`)}`,
      `DESCRIPTION:${escape(beschreibung)}`,
      `URL:${appUrl}#/order/${o.id}`,
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.map(falten).join('\r\n') + '\r\n';
}

import { describe, expect, it } from 'vitest';
import {
  berlin,
  berlinZuUtc,
  boersenfeiertage,
  handelstageZwischen,
  inHandelszeit,
  inRuhezeit,
  istHandelstag,
  naechsterHandelstag,
  ostersonntag,
} from './kalender.ts';

describe('Berliner Zeit', () => {
  it('Sommerzeit: 06:00 UTC = 08:00 Berlin', () => {
    const b = berlin(new Date('2026-07-15T06:00:00Z'));
    expect([b.datum, b.stunde, b.wochentag]).toEqual(['2026-07-15', 8, 3]);
  });
  it('Winterzeit: 07:00 UTC = 08:00 Berlin', () => {
    expect(berlin(new Date('2026-12-15T07:00:00Z')).stunde).toBe(8);
  });
  it('berlinZuUtc rechnet um, auch an Umstellungstagen', () => {
    expect(berlinZuUtc('2026-07-15', '08:00').toISOString()).toBe('2026-07-15T06:00:00.000Z');
    expect(berlinZuUtc('2026-12-15', '22:00').toISOString()).toBe('2026-12-15T21:00:00.000Z');
    expect(berlinZuUtc('2026-03-29', '12:00').toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(berlinZuUtc('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });
});

describe('Börsenkalender', () => {
  it('Ostern', () => {
    expect(ostersonntag(2026)).toBe('2026-04-05');
    expect(ostersonntag(2027)).toBe('2027-03-28');
  });
  it('Feiertage 2026', () => {
    expect([...boersenfeiertage(2026)]).toEqual([
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
      '2026-12-31',
    ]);
  });
  it('Handelstage', () => {
    expect(istHandelstag('2026-10-21')).toBe(true); // Mittwoch
    expect(istHandelstag('2026-10-24')).toBe(false); // Samstag
    expect(istHandelstag('2026-12-24')).toBe(false);
    expect(naechsterHandelstag('2026-12-23')).toBe('2026-12-28');
    expect(handelstageZwischen('2026-10-23', '2026-10-27')).toBe(2);
  });
  it('Handelszeit Tradegate 08:00–22:00', () => {
    expect(inHandelszeit(new Date('2026-10-21T05:59:00Z'))).toBe(false); // 07:59 Sommerzeit
    expect(inHandelszeit(new Date('2026-10-21T06:00:00Z'))).toBe(true);
    expect(inHandelszeit(new Date('2026-10-21T19:59:00Z'))).toBe(true); // 21:59
    expect(inHandelszeit(new Date('2026-10-21T20:00:00Z'))).toBe(false); // 22:00
    expect(inHandelszeit(new Date('2026-11-02T20:30:00Z'))).toBe(true); // 21:30 Winterzeit
  });
  it('Ruhezeit über Mitternacht', () => {
    const r = { von: '22:30', bis: '07:00' };
    expect(inRuhezeit(new Date('2026-10-21T20:45:00Z'), r)).toBe(true); // 22:45
    expect(inRuhezeit(new Date('2026-10-21T04:30:00Z'), r)).toBe(true); // 06:30
    expect(inRuhezeit(new Date('2026-10-21T05:00:00Z'), r)).toBe(false); // 07:00
  });
});

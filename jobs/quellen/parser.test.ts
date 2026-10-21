import { describe, expect, it } from 'vitest';
import { parseFredCsv, parseHtmlTabelle, parseRss, zahl } from './parser.ts';

describe('RSS/Atom', () => {
  it('RSS 2.0 mit CDATA und Entities', () => {
    const xml = `<rss><channel><item><title><![CDATA[Siemens Energy hebt Prognose an]]></title><link>https://example.org/a</link><pubDate>Wed, 21 Oct 2026 06:15:00 +0200</pubDate></item>
      <item><title>Apple &amp; Co. im Plus</title><link>https://example.org/b</link></item></channel></rss>`;
    expect(parseRss(xml)).toEqual([
      { titel: 'Siemens Energy hebt Prognose an', link: 'https://example.org/a', zeit: '2026-10-21T04:15:00.000Z' },
      { titel: 'Apple & Co. im Plus', link: 'https://example.org/b', zeit: undefined },
    ]);
  });
  it('Atom', () => {
    const xml = `<feed><entry><title>4 - ACME Corp (0000123) (Issuer)</title><link rel="alternate" href="https://www.sec.gov/x"/><updated>2026-10-21T10:00:00-04:00</updated></entry></feed>`;
    expect(parseRss(xml)[0]).toEqual({ titel: '4 - ACME Corp (0000123) (Issuer)', link: 'https://www.sec.gov/x', zeit: '2026-10-21T14:00:00.000Z' });
  });
});

describe('HTML-Tabelle (OpenInsider-Format)', () => {
  it('Zeilen nach Kopfzeile', () => {
    const html = `<table class="tinytable"><thead><tr><th>X</th><th>Ticker</th><th>Company&nbsp;Name</th><th>Ins</th><th>Value</th></tr></thead>
      <tbody><tr><td>M</td><td><a href="/ACME">ACME</a></td><td>Acme Corp</td><td>3</td><td>+$1,250,000</td></tr></tbody></table>`;
    expect(parseHtmlTabelle(html, 'tinytable')).toEqual([{ X: 'M', Ticker: 'ACME', 'Company Name': 'Acme Corp', Ins: '3', Value: '+$1,250,000' }]);
  });
  it('Attribute mit ">" (OpenInsider-Tooltips) werden sauber entfernt', () => {
    const html = `<table class="tinytable"><thead><tr><th>Ticker</th></tr></thead><tbody><tr><td><b><a href="/DX" onmouseover="Tip('<img src=x>', DELAY, 1)" onmouseout="UnTip()">DX</a></b></td></tr></tbody></table>`;
    expect(parseHtmlTabelle(html, 'tinytable')).toEqual([{ Ticker: 'DX' }]);
  });
  it('Zahlen', () => {
    expect(zahl('+$1,250,000')).toBe(1250000);
    expect(zahl('12%')).toBe(12);
    expect(zahl('1.5M')).toBe(1500000);
  });
});

describe('FRED-CSV', () => {
  it('letzter gültiger Wert je Reihe, "." wird übersprungen', () => {
    const csv = 'observation_date,VIXCLS,DGS10\n2026-10-19,16.8,4.10\n2026-10-20,17.2,.\n';
    expect(parseFredCsv(csv)).toEqual({ VIXCLS: { datum: '2026-10-20', wert: 17.2, vorher: 16.8 }, DGS10: { datum: '2026-10-19', wert: 4.1, vorher: undefined } });
  });
});

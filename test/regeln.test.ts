// Test für die festen Regeln des KI-Checks, die seit dem 24.10.2026
// dazugekommen sind (src/sammeln.ts und src/bewerten.ts).
// Ohne Netz, ohne KI, nur erfundene Seiten (Beispielbetrieb wie überall:
// KFZ Kolbenhof unter kfz-kolbenhof.example, RFC 2606).
//
//   npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entschaerfen, fuerTests, type Art, type Signale } from '../src/sammeln.ts';
import { bewerten } from '../src/bewerten.ts';
import { berichtBauen } from '../src/bericht.ts';
import { ohneFremdeAngaben } from '../src/kunde.ts';

const { seiteAuswerten, leereSignale } = fuerTests;
const START = 'https://kfz-kolbenhof.example/';

/** Seiten lesen wie sammeln(), ohne Netz. Die erste ist die Startseite. */
function lesen(seiten: Array<{ html: string; art?: Art; pfad?: string }>): Signale {
  const s = leereSignale(START);
  s.adresse = START;
  const gelesen = seiten.map(({ html, art = 'start', pfad = '' }) =>
    seiteAuswerten({ url: new URL(pfad, START), text: html, typ: 'text/html' }, art, s));
  s.handyAnsicht = /<meta\b[^>]*name=["']?viewport/i.test(seiten[0].html);
  s.seiten = gelesen.map((x) => ({ url: x.url, art: x.art, woerter: x.woerter, ...(x.titel ? { titel: x.titel } : {}) }));
  return s;
}
const seite = (kopf: string, inhalt = '<h1>KFZ Kolbenhof</h1><p>Werkstatt für alle Marken.</p>') =>
  `<!doctype html><html lang="de"><head>${kopf}</head><body>${inhalt}</body></html>`;
const eindruck = (s: Signale, thema: string, sprache: 'de' | 'pl' = 'de') => bewerten(s, undefined, sprache).eindruck.find((x) => x.thema === thema);

let n = 0;
const fall = (name: string, f: () => void) => { f(); n++; console.log(`ok  ${name}`); };

// ── WhatsApp-Vorschau ───────────────────────────────────────────────────
fall('Vorschau mit Bild: grün', () => {
  const s = lesen([{ html: seite('<title>KFZ Kolbenhof</title><meta property="og:image" content="/vorschau.jpg"><meta property="og:title" content="KFZ Kolbenhof">') }]);
  assert.equal(eindruck(s, 'vorschau')?.ampel, 'gruen');
});
fall('Vorschau ohne Bild: gelb', () => {
  const s = lesen([{ html: seite('<title>KFZ Kolbenhof</title><meta property="og:title" content="KFZ Kolbenhof">') }]);
  assert.equal(eindruck(s, 'vorschau')?.ampel, 'gelb');
  assert.match(eindruck(s, 'vorschau', 'pl')!.text, /og:image/);
});
fall('twitter:image zählt als Bild', () => {
  const s = lesen([{ html: seite('<meta name="twitter:image" content="https://kfz-kolbenhof.example/b.png">') }]);
  assert.equal(eindruck(s, 'vorschau')?.ampel, 'gruen');
});

// ── Seitentitel und Beschreibung ────────────────────────────────────────
const kopfGut = '<title>KFZ Kolbenhof – Werkstatt in Musterstadt</title><meta name="description" content="Inspektion, Reifen und Reparatur für alle Marken in Musterstadt, Termine auch samstags.">';
fall('alle Seiten gleicher Titel: gelb mit Satz', () => {
  const s = lesen([
    { html: seite(kopfGut) },
    { html: seite('<title>KFZ Kolbenhof – Werkstatt in Musterstadt</title>'), art: 'kontakt', pfad: '/kontakt' },
    { html: seite('<title>kfz kolbenhof – werkstatt in musterstadt </title>'), art: 'preise', pfad: '/preise' },
  ]);
  const g = eindruck(s, 'google')!;
  assert.equal(g.ampel, 'gelb');
  assert.match(g.text, /Alle 3 gelesenen Seiten/);
  assert.match(eindruck(s, 'google', 'pl')!.text, /Wszystkie 3 przeczytane strony mają/);
});
fall('verschiedene Titel: grün', () => {
  const s = lesen([
    { html: seite(kopfGut) },
    { html: seite('<title>Kontakt – KFZ Kolbenhof</title>'), art: 'kontakt', pfad: '/kontakt' },
    { html: seite('<title>Preise – KFZ Kolbenhof</title>'), art: 'preise', pfad: '/preise' },
  ]);
  assert.equal(eindruck(s, 'google')?.ampel, 'gruen');
});
fall('zwei gleiche Titel reichen nicht', () => {
  const s = lesen([{ html: seite(kopfGut) }, { html: seite(kopfGut), art: 'kontakt', pfad: '/kontakt' }]);
  assert.equal(eindruck(s, 'google')?.ampel, 'gruen');
});
fall('Beschreibung zu lang: gelb', () => {
  const lang = 'Wir sind die Werkstatt für alle Marken. '.repeat(6);
  const s = lesen([{ html: seite(`<title>KFZ Kolbenhof – Werkstatt in Musterstadt</title><meta name="description" content="${lang}">`) }]);
  assert.match(eindruck(s, 'google')!.text, /Zeichen lang/);
});
fall('Beschreibung sehr kurz: gelb', () => {
  const s = lesen([{ html: seite('<title>KFZ Kolbenhof – Werkstatt in Musterstadt</title><meta name="description" content="Werkstatt.">') }]);
  assert.equal(eindruck(s, 'google')?.ampel, 'gelb');
  assert.match(eindruck(s, 'google')!.text, /sehr kurz/);
});

// ── Handy ───────────────────────────────────────────────────────────────
fall('viewport normal: grün', () => {
  const s = lesen([{ html: seite('<meta name="viewport" content="width=device-width, initial-scale=1">') }]);
  assert.equal(eindruck(s, 'handy')?.ampel, 'gruen');
});
fall('ohne viewport: rot', () => {
  const s = lesen([{ html: seite('<title>x</title>') }]);
  assert.equal(eindruck(s, 'handy')?.ampel, 'rot');
});
fall('feste Breite: rot', () => {
  const s = lesen([{ html: seite('<meta name="viewport" content="width=1024">') }]);
  const h = eindruck(s, 'handy')!;
  assert.equal(h.ampel, 'rot');
  assert.match(h.beleg!.text, /width=1024/);
});
fall('Zoom gesperrt: gelb', () => {
  for (const v of ['width=device-width, user-scalable=no', 'width=device-width, maximum-scale=1.0', 'width=device-width,user-scalable=0']) {
    const s = lesen([{ html: seite(`<meta name="viewport" content="${v}">`) }]);
    assert.equal(eindruck(s, 'handy')?.ampel, 'gelb', v);
  }
});
fall('maximum-scale=5 ist kein Sperren', () => {
  const s = lesen([{ html: seite('<meta name="viewport" content="width=device-width, maximum-scale=5">') }]);
  assert.equal(eindruck(s, 'handy')?.ampel, 'gruen');
});
fall('schwerer Quelltext: gelb mit MB', () => {
  const s = lesen([{ html: seite('<meta name="viewport" content="width=device-width">', `<p>${'x'.repeat(1_100_000)}</p>`) }]);
  assert.match(eindruck(s, 'handy')!.text, /1,1 MB/);
});
fall('viele Skripte: gelb', () => {
  const skripte = Array.from({ length: 30 }, (_, i) => `<script src="/s${i}.js"></script>`).join('');
  const s = lesen([{ html: seite(`<meta name="viewport" content="width=device-width">${skripte}`) }]);
  assert.match(eindruck(s, 'handy')!.text, /30 Skriptdateien/);
});

// ── Nummer auf der Startseite ───────────────────────────────────────────
const punkt = (s: Signale, frage: string, sprache: 'de' | 'pl' = 'de') => bewerten(s, undefined, sprache).punkte.find((x) => x.frage === frage);
fall('Nummer nur auf der Kontaktseite: gelb', () => {
  const s = lesen([
    { html: seite('<title>KFZ Kolbenhof</title>') },
    { html: seite('<title>Kontakt</title>', '<p><a href="tel:+490000111222">0000 111 222</a></p>'), art: 'kontakt', pfad: '/kontakt' },
  ]);
  const e = punkt(s, 'erreichen')!;
  assert.equal(e.ampel, 'gelb');
  assert.match(e.satz, /erst auf der Seite „Kontakt“/);
  assert.match(punkt(s, 'erreichen', 'pl')!.satz, /dopiero na stronie „Kontakt”/);
});
fall('Nummer im Fuß der Startseite: grün', () => {
  const s = lesen([
    { html: seite('<title>KFZ Kolbenhof</title>', '<footer><a href="tel:+490000111222">Anrufen</a></footer>') },
    { html: seite('<title>Kontakt</title>', '<p><a href="tel:+490000111222">0000 111 222</a></p>'), art: 'kontakt', pfad: '/kontakt' },
  ]);
  assert.equal(punkt(s, 'erreichen')?.ampel, 'gruen');
});
fall('Nummer als Text auf der Startseite zählt auch', () => {
  const s = lesen([
    { html: seite('<title>KFZ Kolbenhof</title>', '<p>Tel. 0000 111 222</p>') },
    { html: seite('<title>Kontakt</title>', '<p><a href="tel:+490000111222">0000 111 222</a></p>'), art: 'kontakt', pfad: '/kontakt' },
  ]);
  assert.equal(punkt(s, 'erreichen')?.ampel, 'gruen');
});

// ── Vertrauen ohne KI ───────────────────────────────────────────────────
fall('Link zu Google-Bewertungen: grün', () => {
  const s = lesen([{ html: seite('', '<a href="https://g.page/r/kolbenhof-beispiel/review">Bewertet uns</a>') }]);
  const v = punkt(s, 'vertrauen')!;
  assert.equal(v.ampel, 'gruen');
  assert.match(v.satz, /Google-Bewertungen/);
});
fall('ProvenExpert-Widget: grün', () => {
  const s = lesen([{ html: seite('', '<script src="https://www.provenexpert.com/widget/beispiel.js"></script>') }]);
  assert.equal(punkt(s, 'vertrauen')?.ampel, 'gruen');
});
fall('AggregateRating: grün', () => {
  const s = lesen([{ html: seite('<script type="application/ld+json">{"@type":"AutoRepair","name":"KFZ Kolbenhof","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"20"}}</script>') }]);
  assert.equal(punkt(s, 'vertrauen')?.ampel, 'gruen');
});
fall('Meisterbetrieb: grün, im Impressum nicht', () => {
  assert.equal(punkt(lesen([{ html: seite('', '<p>Wir sind Meisterbetrieb im Kfz-Handwerk.</p>') }]), 'vertrauen')?.ampel, 'gruen');
  const s = lesen([{ html: seite('') }, { html: seite('', '<p>Mitglied der Handwerkskammer Musterstadt</p>'), art: 'impressum', pfad: '/impressum' }]);
  assert.equal(punkt(s, 'vertrauen')?.ampel, 'offen');
});
fall('„seit 1987“: gelb', () => {
  const s = lesen([{ html: seite('', '<p>Ihre Werkstatt seit 1987.</p>') }]);
  assert.equal(punkt(s, 'vertrauen')?.ampel, 'gelb');
  assert.match(punkt(s, 'vertrauen', 'pl')!.satz, /bez AI/);
});
fall('„Referenzen“ als Überschrift: gelb, im Satz nicht', () => {
  assert.equal(punkt(lesen([{ html: seite('', '<h2>Unsere Referenzen</h2><p>Hof, Halle, Hebebühne.</p>') }]), 'vertrauen')?.ampel, 'gelb');
  assert.equal(punkt(lesen([{ html: seite('', '<p>Auf der Seite ist Platz für Referenzen, Team und Anfahrt.</p>') }]), 'vertrauen')?.ampel, 'offen');
});
fall('nichts gefunden: offen wie bisher', () => assert.equal(punkt(lesen([{ html: seite('') }]), 'vertrauen')?.ampel, 'offen'));
fall('KI sieht weniger als die Regel: Regel gilt', () => {
  const s = lesen([{ html: seite('', '<a href="https://www.trustpilot.com/review/kfz-kolbenhof.example">Trustpilot</a>') }]);
  const ki = { branche: '', name: '', suchbegriff: '', ort: '', auftrag: '', eindruck: '', tipps: [], modell: '', tokens: { rein: 0, raus: 0 },
    antworten: { vertrauen: { frage: 'vertrauen' as const, status: 'nicht_gefunden' as const, antwort: 'Nichts gefunden.', zitat: '', seite: '', belegt: false } } };
  const v = bewerten(s, ki, 'de').punkte.find((x) => x.frage === 'vertrauen')!;
  assert.equal(v.ampel, 'gruen');
  assert.ok(v.widerspruch);
});

// ── Bilder ──────────────────────────────────────────────────────────────
fall('Bilder mit alt, keine Agentur: grün', () => {
  const s = lesen([{ html: seite('', '<img src="/werkstatt.jpg" alt="Unsere Werkstatt"><img src="/team.jpg" alt="Das Team"><img src="/deko.svg" alt="">') }]);
  assert.equal(eindruck(s, 'bilder')?.ampel, 'gruen');
});
fall('alt ohne Wert zählt als Beschreibung (Schmuckbild)', () => {
  const s = lesen([{ html: seite('', '<img src="/a.webp" alt sizes="100vw"><img src="/b.webp" alt><img src="/c.webp" alt/>') }]);
  assert.equal(eindruck(s, 'bilder')?.ampel, 'gruen');
});
fall('viele ohne alt: gelb', () => {
  const s = lesen([{ html: seite('', '<img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg" alt="Hebebühne">') }]);
  assert.match(eindruck(s, 'bilder')!.text, /2 von 3 Bildern/);
});
fall('Bildagentur per Adresse und Dateiname: gelb mit Belegen', () => {
  const s = lesen([{ html: seite('', '<img src="https://images.unsplash.com/photo-123?w=800" alt="Auto"><img data-src="/uploads/AdobeStock_445566.jpeg" alt="Motor"><img src="/eigenes.jpg" alt="Hof">') }]);
  const b = eindruck(s, 'bilder')!;
  assert.equal(b.ampel, 'gelb');
  assert.match(b.text, /2 Bilder stammen/);
  assert.equal(b.belege?.length, 2);
  assert.match(eindruck(s, 'bilder', 'pl')!.text, /2 zdjęcia pochodzą/);
});
fall('ohne Bilder: kein Hinweis', () => assert.equal(eindruck(lesen([{ html: seite('') }]), 'bilder'), undefined));

// ── Passt alles zusammen? ───────────────────────────────────────────────
const schema = (daten: object) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'AutoRepair', name: 'KFZ Kolbenhof', ...daten })}</script>`;
fall('Telefon-Link zeigt andere Nummer: gelb mit Beleg', () => {
  const s = lesen([{ html: seite('', '<a href="tel:+490000111222">0000 999 888</a>') }]);
  const w = eindruck(s, 'widersprueche')!;
  assert.equal(w.ampel, 'gelb');
  assert.deepEqual(w.belege, ['0000 999 888 → +490000111222']);
});
fall('Telefon-Link mit +49 und 0 vorn ist dieselbe Nummer', () => {
  const s = lesen([{ html: seite('', '<a href="tel:+49000011122233">0000 111 222 33</a>') }]);
  assert.equal(eindruck(s, 'widersprueche'), undefined);
});
fall('schema.org-Nummer fehlt auf der Seite: gelb', () => {
  const s = lesen([{ html: seite(schema({ telephone: '+49 0000 777666' }), '<p>Tel. 0000 111 222</p>') }]);
  assert.match(eindruck(s, 'widersprueche')!.text, /\+49 0000 777666/);
});
fall('schema.org passt zur Seite: grün', () => {
  const s = lesen([{ html: seite(schema({ telephone: '+49 0000 111222', address: { postalCode: '99999' }, openingHours: 'Mo-Fr 08:00-17:00' }),
    '<p>Tel. 0000 111 222</p><p>Hofweg 3, 99999 Musterstadt</p><h2>Öffnungszeiten</h2><p>Mo–Fr 8 bis 17 Uhr</p>') }]);
  assert.equal(eindruck(s, 'widersprueche')?.ampel, 'gruen');
});
fall('PLZ und Zeiten passen nicht: gelb, deutsch und polnisch', () => {
  const s = lesen([{ html: seite(schema({ address: { postalCode: '11111' }, openingHoursSpecification: [{ opens: '09:00', closes: '18:00' }] }),
    '<p>Hofweg 3, 99999 Musterstadt</p><h2>Öffnungszeiten</h2><p>Mo–Fr 7:30 bis 16:30 Uhr</p>') }]);
  const w = eindruck(s, 'widersprueche')!;
  assert.match(w.text, /Postleitzahl 11111, auf der Seite 99999/);
  assert.match(w.text, /9:00, 18:00/);
  assert.match(eindruck(s, 'widersprueche', 'pl')!.text, /kod pocztowy 11111/);
});

// ── Verlassene Seite ────────────────────────────────────────────────────
fall('Datumsformate', () => {
  assert.deepEqual(fuerTests.datenIn('am 3.4.2019, 2021-11-30 und 12. März 2018, 5 marca 2017, 31.02.2020'), ['2019-04-03', '2021-11-30', '2018-03-12', '2017-03-05']);
});
fall('alte Meldung unter „Aktuelles“: gelb', () => {
  const s = lesen([{ html: seite('', '<h2>Aktuelles</h2><p>14.05.2019</p><p>Neue Hebebühne ist da.</p><p>02.02.2018 Betriebsferien</p>') }]);
  assert.equal(s.neuesteMeldung, '2019-05-14');
  const a = eindruck(s, 'aktualitaet')!;
  assert.equal(a.ampel, 'gelb');
  assert.match(a.text, /vom Mai 2019/);
  assert.match(eindruck(s, 'aktualitaet', 'pl')!.text, /z maja 2019/);
});
fall('<time> zählt, Datum im Impressum nicht', () => {
  const jetzt = new Date().toISOString().slice(0, 10);
  const s = lesen([{ html: seite('', `<article><time datetime="${jetzt}T10:00">heute</time></article>`) }, { html: seite('', '<h2>Aktuelles</h2><p>Stand: 01.01.2015</p>'), art: 'impressum', pfad: '/impressum' }]);
  assert.equal(s.neuesteMeldung, jetzt);
  assert.equal(eindruck(s, 'aktualitaet')?.ampel, 'gruen');
});
fall('Datum außerhalb von Meldungen zählt nicht', () => {
  const s = lesen([{ html: seite('', '<p>Gegründet am 01.04.1999</p>') }]);
  assert.equal(s.neuesteMeldung, undefined);
});
fall('Termin in der Zukunft zählt als gepflegt', () => {
  const bald = new Date(Date.now() + 30 * 864e5);
  const s = lesen([{ html: seite('', `<h2>Termine</h2><p>${bald.getDate()}.${bald.getMonth() + 1}.${bald.getFullYear()} Tag der offenen Tür</p>`) }]);
  assert.equal(s.neuesteMeldung, new Date().toISOString().slice(0, 10));
});

// ── Postfach ────────────────────────────────────────────────────────────
fall('kein MX: gelb mit Adresse', () => {
  const s = lesen([{ html: seite('') }]);
  s.postfach = { adresse: 'info@kfz-kolbenhof.example', domain: 'kfz-kolbenhof.example', mx: false };
  const p = eindruck(s, 'postfach')!;
  assert.equal(p.ampel, 'gelb');
  assert.match(p.text, /info@kfz-kolbenhof\.example/);
});
fall('MX da: grün', () => {
  const s = lesen([{ html: seite('') }]);
  s.postfach = { adresse: 'info@kfz-kolbenhof.example', domain: 'kfz-kolbenhof.example', mx: true };
  assert.equal(eindruck(s, 'postfach')?.ampel, 'gruen');
});
fall('nur Freemailer: sanft gelb, ohne DNS-Anfrage', () => {
  const s = lesen([{ html: seite('', '<a href="mailto:kolbenhof@web.de">Mail</a>') }]);
  // Beim Freemailer kehrt postfachPruefen vor der ersten DNS-Anfrage zurück, also sofort.
  void fuerTests.postfachPruefen(s, new URL(START));
  assert.equal(s.freemail, 'web.de');
  assert.equal(s.postfach, undefined);
  assert.match(eindruck(s, 'postfach')!.text, /web\.de/);
});

// ── Polen, Österreich, Schweiz ──────────────────────────────────────────
const { WOCHENTAG, UHRZEIT_SPANNE, PLZ_ORT, HAUSNUMMER_AM_ENDE, TELEFON_IM_TEXT, BETRAG, NACH_VEREINBARUNG } = fuerTests;
fall('polnische Öffnungszeiten', () => {
  for (const z of ['pon.–pt. 8:00–16:00', 'Poniedziałek – piątek: 7:30 - 15:30', 'sob. 9:00-13:00, niedz. nieczynne', 'codziennie godz. 10-18', 'Pon - Pt 8.00 - 17.00']) {
    assert.ok(WOCHENTAG.test(z) && UHRZEIT_SPANNE.test(z), z);
  }
  // „wt“ und „pt“ allein mitten in Wörtern sind keine Tage.
  assert.ok(!WOCHENTAG.test('Zapraszamy do współpracy, ptaki i wtyczki'));
});
fall('polnische, österreichische, Schweizer Anschrift', () => {
  for (const [strasse, zeile, plz] of [['ul. Długa 5/3', '64-100 Leszno', '64-100'], ['Hauptstraße 12', '1010 Wien', '1010'], ['Bahnhofstrasse 7', '8001 Zürich', '8001'], ['Al. Jerozolimskie 44', '00-024 Warszawa', '00-024']]) {
    assert.ok(HAUSNUMMER_AM_ENDE.test(strasse), strasse);
    assert.equal(PLZ_ORT.exec(zeile)?.[1], plz, zeile);
  }
  const s = lesen([{ html: seite('', '<p>Warsztat Kolbenhof</p><p>ul. Długa 5, 64-100 Leszno</p>') }]);
  assert.equal(punkt(s, 'ort', 'pl')?.ampel, 'gruen');
});
fall('vierstellige Zahl ohne Straße ist keine PLZ für den Abgleich', () => {
  const s = lesen([{ html: seite('', '<p>2019 Neue Halle eröffnet</p>') }]);
  assert.deepEqual(s.plzAufSeite, []);
});
fall('polnische und österreichische Nummern', () => {
  const nummern = (z: string) => [...z.matchAll(TELEFON_IM_TEXT)].map((m) => (m[1] ?? m[2]).trim());
  assert.deepEqual(nummern('tel. 600 100 200'), ['600 100 200']);
  assert.deepEqual(nummern('Telefon: 65 500 10 20'), ['65 500 10 20']);
  assert.deepEqual(nummern('tel. kom. +48 600 100 200'), ['+48 600 100 200']);
  assert.deepEqual(nummern('Tel.: +43 1 234 5678'), ['+43 1 234 5678']);
});
fall('Złoty und Franken sind Preise', () => {
  for (const z of ['od 150 zł', 'Wymiana oleju 199 PLN', 'Service ab CHF 120', '1 200,00 zł brutto']) assert.ok(BETRAG.test(z), z);
  assert.ok(!BETRAG.test('złoty medal'));
});
fall('„po wcześniejszym umówieniu“', () => assert.ok(NACH_VEREINBARUNG.test('Wizyty po wcześniejszym umówieniu')));

// ── Baukasten und Formulare per JavaScript ──────────────────────────────
fall('Wix ohne Formular und Kontakt: gelb statt rot', () => {
  const s = lesen([{ html: seite('<meta name="generator" content="Wix.com Website Builder">', '<img src="https://static.wixstatic.com/media/beispiel.jpg" alt="Hof">') }]);
  assert.equal(s.baukasten, 'Wix');
  const a = punkt(s, 'anfragen')!;
  assert.equal(a.ampel, 'gelb');
  assert.match(a.satz, /mit Wix gebaut/);
});
fall('Jimdo an Dateiadressen erkannt, mit Nummer', () => {
  const s = lesen([{ html: seite('<link rel="stylesheet" href="https://assets.jimstatic.com/web.css">', '<p>Tel. 0000 111 222</p>') }]);
  assert.equal(s.baukasten, 'Jimdo');
  assert.match(punkt(s, 'anfragen')!.satz, /anrufen.*Jimdo/s);
});
fall('Formular per Skript (HubSpot): gelb mit Notiz', () => {
  const s = lesen([{ html: seite('', '<script src="https://js.hsforms.net/forms/embed/v2.js"></script>') }]);
  const a = punkt(s, 'anfragen')!;
  assert.equal(a.ampel, 'gelb');
  assert.match(a.satz, /HubSpot/);
});
fall('ohne Baukasten bleibt rot', () => assert.equal(punkt(lesen([{ html: seite('') }]), 'anfragen')?.ampel, 'rot'));
fall('KI rot bei Baukasten: Regel bleibt gelb', () => {
  const s = lesen([{ html: seite('<meta name="generator" content="Wix.com Website Builder">') }]);
  const ki = { branche: '', name: '', suchbegriff: '', ort: '', auftrag: '', eindruck: '', tipps: [], modell: '', tokens: { rein: 0, raus: 0 },
    antworten: { anfragen: { frage: 'anfragen' as const, status: 'nicht_gefunden' as const, antwort: 'Kein Formular.', zitat: '', seite: '', belegt: false } } };
  const a = bewerten(s, ki, 'de').punkte.find((x) => x.frage === 'anfragen')!;
  assert.equal(a.ampel, 'gelb');
  assert.ok(a.widerspruch);
});
fall('Wort „Wix“ im Text ist kein Baukasten', () => assert.equal(lesen([{ html: seite('', '<p>Wir bauen keine Seiten mit Wix oder Jimdo.</p>') }]).baukasten, undefined));

// ── Branchenfrage ───────────────────────────────────────────────────────
const kiMit = (branchenfrage: object) => ({ branche: 'Kfz-Werkstatt', name: '', suchbegriff: '', ort: '', auftrag: '', eindruck: '', tipps: [], modell: '', tokens: { rein: 0, raus: 0 }, antworten: {},
  branchenfrage: { frage: 'Bekomme ich einen Ersatzwagen?', status: 'gefunden' as const, antwort: 'Ja, gegen Gebühr.', zitat: 'Ersatzwagen auf Anfrage', seite: START, belegt: true, ...branchenfrage } });
fall('Branchenfrage belegt: grün mit Beleg', () => {
  const b = bewerten(lesen([{ html: seite('') }]), kiMit({}), 'de').branchenfrage!;
  assert.equal(b.ampel, 'gruen');
  assert.equal(b.beleg?.text, 'Ersatzwagen auf Anfrage');
});
fall('Branchenfrage ohne Beleg: offen', () => {
  const b = bewerten(lesen([{ html: seite('') }]), kiMit({ belegt: false }), 'de').branchenfrage!;
  assert.equal(b.ampel, 'offen');
  assert.equal(b.beleg, undefined);
});
fall('Branchenfrage nicht gefunden: rot, zählt nicht mit', () => {
  const e = bewerten(lesen([{ html: seite('') }]), kiMit({ status: 'nicht_gefunden', zitat: '', belegt: false }), 'de');
  assert.equal(e.branchenfrage?.ampel, 'rot');
  assert.equal(e.zaehlbar, 7);
});
fall('ohne KI keine Branchenfrage', () => assert.equal(bewerten(lesen([{ html: seite('') }]), undefined, 'de').branchenfrage, undefined));

// ── Sicherheit (Sicherheitsprüfung 24.10.2026) ──────────────────────────
fall('jedes als Paar gesuchte Tag wird vorher aufgeräumt', () => {
  const quelle = readFileSync(new URL('../src/sammeln.ts', import.meta.url), 'utf8');
  // Muster wie /<x\b[^>]*>([\s\S]*?)<\/x>/ oder /<(a|b)\b…[\s\S]*?<\/\1>/ in der Quelle.
  const gesucht = new Set<string>();
  const ausklappen = (t: string) => (/^h\[(\d)-(\d)\]$/.test(t) ? Array.from({ length: Number(t[4]) - Number(t[2]) + 1 }, (_, i) => `h${Number(t[2]) + i}`) : [t]);
  for (const zeile of quelle.split('\n').filter((z) => z.includes('[\\s\\S]*?)<\\/') || z.includes('[\\s\\S]*?<\\/'))) {
    for (const m of zeile.matchAll(/\[\\s\\S\]\*\?\)?<\\\/(\\1|[a-z][a-z0-9]*)>/g)) {
      const namen = m[1] === '\\1' ? (/<\(([^)]+)\)/.exec(zeile)?.[1] ?? '').split('|') : [m[1]];
      namen.flatMap(ausklappen).forEach((t) => gesucht.add(t));
    }
  }
  const erlaubt = new Set([...fuerTests.PAARE, ...fuerTests.ROHTEXT]);
  for (const tag of gesucht) assert.ok(erlaubt.has(tag), `Tag <${tag}> wird als Paar gesucht, fehlt aber in PAARE/ROHTEXT`);
  assert.ok(gesucht.has('time') && gesucht.has('h1') && gesucht.has('form'), [...gesucht].join(','));
});
fall('3 MB offene Tags bremsen nicht aus', () => {
  for (const tag of [...fuerTests.PAARE, 'p', 'div']) {
    const html = `<html><body>${`<${tag}>x`.repeat(Math.floor(3_000_000 / (tag.length + 3)))}</body></html>`;
    const s = leereSignale(START);
    const start = Date.now();
    seiteAuswerten({ url: new URL(START), text: entschaerfen(html), typ: 'text/html' }, 'start', s);
    assert.ok(Date.now() - start < 3000, `<${tag}> brauchte ${Date.now() - start} ms`);
  }
});
fall('<time> mit datetime zählt weiter', () => {
  const s = lesen([{ html: seite('', '<time datetime="2026-10-20">20. Oktober</time>') }]);
  assert.equal(s.neuesteMeldung, '2026-10-20');
});

fall('Bewertungsportal-Muster auf 700 langen Links bleibt schnell', () => {
  const links = Array.from({ length: 700 }, () => `<a href="https://google.${'google.'.repeat(480)}de/x">x</a>`).join('');
  const start = Date.now();
  lesen([{ html: seite('', links) }]);
  assert.ok(Date.now() - start < 1500, `${Date.now() - start} ms`);
  const s = lesen([{ html: seite('', '<a href="https://www.google.de/maps/place/Kolbenhof/reviews">Bewertungen</a>') }]);
  assert.equal(s.bewertungen.length, 1);
});
fall('Nummern mit Punkten fliegen aus KI-Sätzen', () => {
  const material = 'Tel. 0000 111 222';
  assert.equal(ohneFremdeAngaben('Ruf 0800.1234.567 an.', material, 400), '');
  assert.equal(ohneFremdeAngaben('Ruf +49.30.1234567 an.', material, 400), '');
  assert.equal(ohneFremdeAngaben('Ruf 0000 111 222 an.', material, 400), 'Ruf 0000 111 222 an.');
});
fall('Bericht ohne Abfrageteil in der Adresse', () => {
  const s = lesen([{ html: seite('') }]);
  s.adresse = 'https://kfz-kolbenhof.example/vorschau?token=geheim';
  const b = berichtBauen(bewerten(s, undefined, 'de'), s, null, 'pause', 'de');
  assert.equal(b.adresse, 'https://kfz-kolbenhof.example/vorschau');
  assert.ok(!b.domain.includes('geheim'));
});

fall('ungültige Zeichen-Codes brechen nichts ab', () => {
  const s = lesen([{ html: seite('', '<p>A&#x110000;B&#99999999999;C&#65;</p>') }]);
  assert.ok(s.seiten.length === 1);
});
fall('keine Postfach-Abfrage für interne Namen', () => {
  const s = lesen([{ html: seite('', '<a href="mailto:info@server.internal">Mail</a>') }]);
  void fuerTests.postfachPruefen(s, new URL(START));
  assert.equal(s.postfach, undefined);
});

console.log(`\n${n} Fälle bestanden`);

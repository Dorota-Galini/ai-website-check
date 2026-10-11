// Prüft die Erkennungsmuster an Zeilen, wie sie im Testlauf vom 09.10.2026
// vorkamen. Namen, Anschriften und Nummern sind ersetzt, das Muster ist gleich.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuerTests } from '../src/sammeln.ts';
import { zitatBelegt } from '../src/kunde.ts';

const { WOCHENTAG, UHRZEIT_SPANNE, PLZ_ORT, HAUSNUMMER_AM_ENDE, ZEIT_FREI, ZEIT_ZUSAMMENHANG, KEIN_PREIS } = fuerTests;
const istZeit = (z: string) => WOCHENTAG.test(z) && UHRZEIT_SPANNE.test(z);

test('Öffnungszeiten werden erkannt', () => {
  for (const z of [
    'Mo - Fr 07:45 Uhr bis 12:00 Uhr',
    '• Mo – Fr 08:00 – 17:00',
    'Montag bis Donnerstag 7 bis 16:30 Uhr',
    'Freitag 7 bis 13 Uhr',
    'Sa 9-12 Uhr',
    'Mo.-Fr. 8.00 - 17.00',
    'Di 14:00-18:00',
    'Mo, Di, Do 8–12 Uhr',
  ]) assert.ok(istZeit(z), z);
});

test('Keine Öffnungszeiten (Fehlfunde aus dem ersten Lauf)', () => {
  for (const z of [
    'Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG',
    'Nichts, wenn du das so willst. Dann liegen Hosting und Domain bei deinem Anbieter: die Domain je nach Anbieter 5 bis 16 €',
    'So erreichen Sie uns in 8 bis 10 Tagen',
    'Do it yourself 10-20 Stück',
  ]) assert.ok(!istZeit(z), z);
});

test('Zeiten im Fließtext und Antwortversprechen', () => {
  const z = 'Meistens morgens zwischen sieben und neun oder ab 15 Uhr.';
  assert.ok(ZEIT_FREI.test(z) && !WOCHENTAG.test(z));
  assert.ok(ZEIT_ZUSAMMENHANG.test('## Ich rufe an'));
  assert.ok(ZEIT_FREI.test('Rückruf meist ab 16 Uhr'));
  assert.ok(!ZEIT_FREI.test('Der Film dauert zwischen zwei und drei Minuten'));
  assert.ok(ZEIT_FREI.test('Zwei Minuten, und innerhalb von 24 Stunden rufe ich an.'));
  assert.ok(ZEIT_FREI.test('Wenn wir auf dem Dach sind, rufen wir innerhalb von zwei Stunden zurück.'));
  assert.ok(ZEIT_FREI.test('Dwie minuty, a w ciągu 24 godzin do Ciebie dzwonię.'));
  assert.ok(!ZEIT_FREI.test('Lieferung innerhalb von drei Wochen'));
});

test('Kein Preis: Überweisungsbeispiel', () => {
  assert.ok(KEIN_PREIS.test('Aus „Frau Anna Schmidt, IBAN DE89 3704 0044 0532 0130 00, überweist 1.250,00 €“ wird „Frau [NAME_1]“'));
  assert.ok(!KEIN_PREIS.test('Die Website, erste Seite | 650 €'));
});

test('Straßen mit Hausnummer', () => {
  for (const z of ['Musterstraße 2', 'Am Feldrain 6 b', 'Lindenstr. 81 F', 'Hoher Weg 23', 'Beim alten Bahnhof 6', 'Dorfstraße 8']) {
    assert.ok(HAUSNUMMER_AM_ENDE.test(z), z);
  }
  for (const z of ['Muster GmbH', 'tel.: 01234-5678', 'Am Feldrain']) assert.ok(!HAUSNUMMER_AM_ENDE.test(z), z);
});

test('PLZ und Ort', () => {
  assert.equal(PLZ_ORT.exec('Am Feldrain 6 b · 49393 Lohne')?.[0], '49393 Lohne');
  assert.equal(PLZ_ORT.exec('Hoher Weg 23, 58511 Lüdenscheid, Deutschland')?.[1], '58511');
});

test('Zitatprüfung: nur wörtliche Zitate zählen', () => {
  const material = '## Ich rufe an\nMeistens morgens zwischen sieben und neun oder ab 15 Uhr.\nTel.: 01234-5678';
  assert.ok(zitatBelegt('Meistens morgens zwischen sieben und neun', material));
  assert.ok(zitatBelegt('„Meistens morgens … ab 15 Uhr.“', material));
  assert.ok(!zitatBelegt('Mo–Fr 8 bis 17 Uhr', material));
  assert.ok(!zitatBelegt('', material));
  // Zitat über Überschriften hinweg (KI-Runde 10.10.2026)
  assert.ok(zitatBelegt('Elektroinstallation Satellitenempfang Photovoltaik', '## Elektroinstallation\n## Satellitenempfang\n## Photovoltaik'));
});

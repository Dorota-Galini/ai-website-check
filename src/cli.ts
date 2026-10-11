// KI-Check auf der Kommandozeile. Liest eine Website wie ein Kunde und gibt
// den Bericht als Text aus, auf Wunsch zusätzlich als JSON.
//
//   npx tsx src/cli.ts example.com                  (Bericht auf Englisch)
//   npx tsx src/cli.ts beispiel.de --lang de --json bericht.json
//   npx tsx src/cli.ts beispiel.de --lang pl --no-ai
//
// Sprachen: en (Standard), de, pl. Mit KI nur, wenn ANTHROPIC_API_KEY gesetzt
// ist (eine Prüfung kostet ein paar Cent). Ohne Schlüssel oder mit --no-ai
// gibt es die festen Regeln. Sperrt die robots.txt der Seite KI-Assistenten,
// läuft er ebenfalls ohne KI. Der Ablauf selbst steht in pruefen.ts.
import dns from 'node:dns';
import { writeFileSync } from 'node:fs';
import { alsText, pruefen, type Sprache } from './pruefen.ts';

// Erst IPv4: Über IPv6 brachen im Testlauf Verbindungen ab, die über IPv4 nie abbrachen.
dns.setDefaultResultOrder('ipv4first');

const argumente = process.argv.slice(2);
const MIT_WERT = ['--json', '--lang'];
const wert = (name: string) => (argumente.includes(name) ? argumente[argumente.indexOf(name) + 1] : undefined);
const adresse = argumente.find((a, i) => !a.startsWith('--') && !MIT_WERT.includes(argumente[i - 1]));
// --pl und --de gibt es weiter als Kurzform.
const gewaehlt = wert('--lang') ?? (argumente.includes('--pl') ? 'pl' : argumente.includes('--de') ? 'de' : 'en');
const sprache: Sprache = gewaehlt === 'de' || gewaehlt === 'pl' ? gewaehlt : 'en';
const ohneKi = argumente.includes('--no-ai') || argumente.includes('--ohne-ki');
const jsonDatei = wert('--json');

if (!adresse) {
  console.log('Usage: npx tsx src/cli.ts <address> [--lang en|de|pl] [--no-ai] [--json file.json]');
  process.exit(1);
}

const ergebnis = await pruefen(adresse, { sprache, mitKi: !ohneKi });
if ('fehler' in ergebnis) {
  console.log(ergebnis.meldung);
  process.exit(2);
}
console.log(alsText(ergebnis));
if (jsonDatei) {
  writeFileSync(jsonDatei, JSON.stringify(ergebnis.bericht, null, 1), 'utf8');
  console.log(`\nJSON: ${jsonDatei}`);
}

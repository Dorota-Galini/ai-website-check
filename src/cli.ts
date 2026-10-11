// KI-Check auf der Kommandozeile. Liest eine Website wie ein Kunde und gibt
// den Bericht als Text aus, auf Wunsch zusätzlich als JSON.
//
//   npx tsx src/cli.ts beispiel.de
//   npx tsx src/cli.ts beispiel.de --pl --json bericht.json
//   npx tsx src/cli.ts beispiel.de --ohne-ki
//
// Mit KI nur, wenn ANTHROPIC_API_KEY gesetzt ist (eine Prüfung kostet ein
// paar Cent). Ohne Schlüssel oder mit --ohne-ki gibt es die festen Regeln.
// Sperrt die robots.txt der Seite KI-Assistenten, läuft er ebenfalls ohne KI.
import dns from 'node:dns';
import { writeFileSync } from 'node:fs';
import { sammeln } from './sammeln.ts';
import { alsKundeLesen, type KiBericht } from './kunde.ts';
import { bewerten, type Sprache } from './bewerten.ts';
import { berichtBauen, type KiStatus } from './bericht.ts';

// Erst IPv4: Über IPv6 brachen im Testlauf Verbindungen ab, die über IPv4 nie abbrachen.
dns.setDefaultResultOrder('ipv4first');

const argumente = process.argv.slice(2);
const adresse = argumente.find((a) => !a.startsWith('--') && argumente[argumente.indexOf(a) - 1] !== '--json');
const sprache: Sprache = argumente.includes('--pl') ? 'pl' : 'de';
const ohneKi = argumente.includes('--ohne-ki');
const jsonDatei = argumente.includes('--json') ? argumente[argumente.indexOf('--json') + 1] : undefined;

if (!adresse) {
  console.log('Aufruf: npx tsx src/cli.ts <adresse> [--pl] [--ohne-ki] [--json datei.json]');
  process.exit(1);
}

const TEXT = {
  de: {
    urteil: { gruen: 'kommt weiter', gelb: 'kommt nur mit Mühe weiter', rot: 'bleibt hängen', offen: 'bleibt offen', passtNicht: 'passt hier nicht' },
    stationen: { google: 'Wie steht ihr bei Google?', handy: 'Kann ich die Seite am Handy lesen?' },
    weg: 'Der Weg eines Kunden', nebenbei: 'Unterwegs aufgefallen', lesbar: 'Können KI-Assistenten die Seite lesen?',
    eindruck: 'Sein Eindruck als Kunde', tipps: 'Was am meisten helfen würde', gelesen: 'Gelesen', startseite: 'Startseite',
    seiten: { kontakt: 'Kontakt', preise: 'Preise', termin: 'Termin', leistungen: 'Leistungen', zeiten: 'Öffnungszeiten', impressum: 'Impressum' } as Record<string, string>,
    ki: { ok: 'mit KI', pause: 'ohne KI (kein Schlüssel oder --ohne-ki)', limit: 'ohne KI (Tageslimit)', fehler: 'ohne KI (KI hat nicht geantwortet)', gesperrt: 'ohne KI (die robots.txt sperrt KI-Assistenten)' },
    fehler: { adresse_ungueltig: 'Das sieht nicht wie eine Website-Adresse aus.', nicht_erlaubt: 'Diese Adresse darf nicht geöffnet werden (keine öffentliche Website).', nicht_erreichbar: 'Die Seite antwortet nicht.', keine_website: 'Unter dieser Adresse liegt keine Website.', robots_gesperrt: 'Die robots.txt bittet Programme, diese Seite nicht zu lesen. Daran hält sich der Check.' },
  },
  pl: {
    urteil: { gruen: 'idzie dalej', gelb: 'idzie dalej z trudem', rot: 'utknie', offen: 'bez odpowiedzi', passtNicht: 'tu nie pasuje' },
    stationen: { google: 'Jak widać was w Google?', handy: 'Czy przeczytam stronę na telefonie?' },
    weg: 'Droga klienta', nebenbei: 'Po drodze zauważył', lesbar: 'Czy asystenci AI mogą przeczytać stronę?',
    eindruck: 'Jego wrażenie jako klienta', tipps: 'Co najbardziej by pomogło', gelesen: 'Przeczytane', startseite: 'strona główna',
    seiten: { kontakt: 'Kontakt', preise: 'Cennik', termin: 'Termin', leistungen: 'Usługi', zeiten: 'Godziny otwarcia', impressum: 'Nota prawna' } as Record<string, string>,
    ki: { ok: 'z AI', pause: 'bez AI (brak klucza albo --ohne-ki)', limit: 'bez AI (limit dzienny)', fehler: 'bez AI (AI nie odpowiedziała)', gesperrt: 'bez AI (robots.txt blokuje asystentów AI)' },
    fehler: { adresse_ungueltig: 'To nie wygląda na adres strony.', nicht_erlaubt: 'Tego adresu nie wolno otworzyć (to nie jest publiczna strona).', nicht_erreichbar: 'Strona nie odpowiada.', keine_website: 'Pod tym adresem nie ma strony.', robots_gesperrt: 'Plik robots.txt prosi programy, żeby nie czytały tej strony. Test się do tego stosuje.' },
  },
}[sprache];

// Dieselben Formen wie auf der Seite: voll, halb, leer (offener Ring), gestrichelt.
const ZEICHEN = { gruen: '●', gelb: '◐', rot: '○', offen: '◌' } as const;

const start = Date.now();
const g = await sammeln(adresse, { bis: start + 24_000 });
if (g.signale.fehler) {
  console.log(TEXT.fehler[g.signale.fehler]);
  process.exit(2);
}

let ki: KiBericht | null = null;
let kiStatus: KiStatus = 'pause';
if (g.signale.kiGesperrt) {
  kiStatus = 'gesperrt';
} else if (!ohneKi && process.env.ANTHROPIC_API_KEY) {
  const antwort = await alsKundeLesen(g, sprache, { fristMs: 45_000 });
  if ('fehler' in antwort) kiStatus = 'fehler';
  else { ki = antwort; kiStatus = 'ok'; }
}

const bericht = berichtBauen(bewerten(g.signale, ki ?? undefined, sprache), g.signale, ki, kiStatus, sprache);
const urteil = (a: keyof typeof ZEICHEN, passtNicht?: boolean) => (passtNicht ? TEXT.urteil.passtNicht : TEXT.urteil[a]);

const zeilen: string[] = [];
zeilen.push(`KI-Check: ${bericht.domain}`);
zeilen.push(`${TEXT.gelesen}: ${[TEXT.startseite, ...bericht.weitereSeiten.map((a) => TEXT.seiten[a] ?? a)].join(', ')} · ${((Date.now() - start) / 1000).toFixed(1)} s · ${TEXT.ki[kiStatus]}`);
zeilen.push('', TEXT.weg);
const station = (zeichen: string, frage: string, wort: string, satz: string, beleg?: string) => {
  zeilen.push(`  ${zeichen} ${frage}  [${wort}]`, `    ${satz}`);
  if (beleg) zeilen.push(`    ${beleg}`);
};
for (const thema of ['google', 'handy'] as const) {
  const e = bericht.eindruck.find((x) => x.thema === thema);
  if (e) station(ZEICHEN[e.ampel], TEXT.stationen[thema], urteil(e.ampel), e.text, e.vorschau ? `„${e.vorschau.titel}“ · ${e.vorschau.beschreibung}` : undefined);
}
// Reihenfolge wie auf der Seite: Anfragen ist das Ziel und steht am Ende.
for (const frage of ['leistungen', 'preise', 'zeiten', 'erreichen', 'ort', 'vertrauen', 'anfragen']) {
  const p = bericht.punkte.find((x) => x.frage === frage);
  if (!p) continue;
  // Steht das Zitat schon im Satz, nur noch die Seite nennen.
  const imSatz = !!p.beleg && p.satz.includes(p.beleg.text.slice(0, 40));
  const beleg = !p.beleg ? undefined : p.beleg.notiz ? p.beleg.text : imSatz ? `Fundstelle: ${new URL(p.beleg.seite).pathname}` : `„${p.beleg.text}“ (${new URL(p.beleg.seite).pathname})`;
  station(ZEICHEN[p.passtNicht ? 'offen' : p.ampel], p.titel, urteil(p.ampel, p.passtNicht), p.satz, beleg);
}
const nebenbei = bericht.eindruck.filter((x) => x.thema !== 'google' && x.thema !== 'handy');
if (nebenbei.length) {
  zeilen.push('', TEXT.nebenbei);
  for (const x of nebenbei) {
    zeilen.push(`  ${ZEICHEN[x.ampel]} ${x.titel}: ${x.text}`);
    for (const b of x.belege?.slice(0, 3) ?? []) zeilen.push(`      – ${b}`);
  }
}
zeilen.push('', TEXT.lesbar);
for (const x of bericht.lesbarkeit.saetze) zeilen.push(`  ${ZEICHEN[x.ampel]} ${x.text}`);
if (bericht.ki) {
  zeilen.push('', `${TEXT.eindruck}:`, `  ${bericht.ki.eindruck}`, '', TEXT.tipps);
  for (const t of bericht.ki.tipps) zeilen.push(`  – ${t}`);
}
console.log(zeilen.join('\n'));

if (jsonDatei) {
  writeFileSync(jsonDatei, JSON.stringify(bericht, null, 1), 'utf8');
  console.log(`\nJSON: ${jsonDatei}`);
}

// Der gemeinsame Ablauf für Kommandozeile (cli.ts) und MCP-Server (mcp.ts):
// sammeln, mit oder ohne KI lesen, bewerten, Bericht bauen, als Text ausgeben.
// Angelegt am 11.10.2026.
import { sammeln, type Signale } from './sammeln.ts';
import { alsKundeLesen, type KiBericht } from './kunde.ts';
import { bewerten, type Sprache } from './bewerten.ts';
import { berichtBauen, type KiCheckBericht, type KiStatus } from './bericht.ts';

export type { Sprache };

const TEXTE = {
  de: {
    urteil: { gruen: 'kommt weiter', gelb: 'kommt nur mit Mühe weiter', rot: 'bleibt hängen', offen: 'bleibt offen', passtNicht: 'passt hier nicht' },
    stationen: { google: 'Wie steht ihr bei Google?', handy: 'Kann ich die Seite am Handy lesen?' },
    weg: 'Der Weg eines Kunden', nebenbei: 'Unterwegs aufgefallen', lesbar: 'Können KI-Assistenten die Seite lesen?',
    eindruck: 'Sein Eindruck als Kunde', tipps: 'Was am meisten helfen würde', gelesen: 'Gelesen', startseite: 'Startseite', fundstelle: 'Fundstelle', titel: 'KI-Check', q: (s: string) => `„${s}“`,
    seiten: { kontakt: 'Kontakt', preise: 'Preise', termin: 'Termin', leistungen: 'Leistungen', zeiten: 'Öffnungszeiten', impressum: 'Impressum' } as Record<string, string>,
    ki: { ok: 'mit KI', pause: 'ohne KI (kein Schlüssel oder KI ausgeschaltet)', limit: 'ohne KI (Tageslimit)', fehler: 'ohne KI (KI hat nicht geantwortet)', gesperrt: 'ohne KI (die robots.txt sperrt KI-Assistenten)', folgt: 'KI folgt im zweiten Schritt' },
    fehler: { adresse_ungueltig: 'Das sieht nicht wie eine Website-Adresse aus.', nicht_erlaubt: 'Diese Adresse darf nicht geöffnet werden (keine öffentliche Website).', nicht_erreichbar: 'Die Seite antwortet nicht.', keine_website: 'Unter dieser Adresse liegt keine Website.', robots_gesperrt: 'Die robots.txt bittet Programme, diese Seite nicht zu lesen. Daran hält sich der Check.' },
  },
  pl: {
    urteil: { gruen: 'idzie dalej', gelb: 'idzie dalej z trudem', rot: 'utknie', offen: 'bez odpowiedzi', passtNicht: 'tu nie pasuje' },
    stationen: { google: 'Jak widać was w Google?', handy: 'Czy przeczytam stronę na telefonie?' },
    weg: 'Droga klienta', nebenbei: 'Po drodze zauważył', lesbar: 'Czy asystenci AI mogą przeczytać stronę?',
    eindruck: 'Jego wrażenie jako klienta', tipps: 'Co najbardziej by pomogło', gelesen: 'Przeczytane', startseite: 'strona główna', fundstelle: 'Źródło', titel: 'Test AI', q: (s: string) => `„${s}”`,
    seiten: { kontakt: 'Kontakt', preise: 'Cennik', termin: 'Termin', leistungen: 'Usługi', zeiten: 'Godziny otwarcia', impressum: 'Nota prawna' } as Record<string, string>,
    ki: { ok: 'z AI', pause: 'bez AI (brak klucza albo AI wyłączona)', limit: 'bez AI (limit dzienny)', fehler: 'bez AI (AI nie odpowiedziała)', gesperrt: 'bez AI (robots.txt blokuje asystentów AI)', folgt: 'AI w drugim kroku' },
    fehler: { adresse_ungueltig: 'To nie wygląda na adres strony.', nicht_erlaubt: 'Tego adresu nie wolno otworzyć (to nie jest publiczna strona).', nicht_erreichbar: 'Strona nie odpowiada.', keine_website: 'Pod tym adresem nie ma strony.', robots_gesperrt: 'Plik robots.txt prosi programy, żeby nie czytały tej strony. Test się do tego stosuje.' },
  },
  en: {
    urteil: { gruen: 'gets through', gelb: 'gets through, with effort', rot: 'gets stuck', offen: 'open', passtNicht: 'does not apply' },
    stationen: { google: 'How do you look on Google?', handy: 'Can I read the site on my phone?' },
    weg: 'A customer’s path', nebenbei: 'Noticed along the way', lesbar: 'Can AI assistants read the site?',
    eindruck: 'His impression as a customer', tipps: 'What would help most', gelesen: 'Read', startseite: 'Start page', fundstelle: 'Found on', titel: 'AI Website Check', q: (s: string) => `“${s}”`,
    seiten: { kontakt: 'Contact', preise: 'Prices', termin: 'Booking', leistungen: 'Services', zeiten: 'Opening hours', impressum: 'Legal notice' } as Record<string, string>,
    ki: { ok: 'with AI', pause: 'without AI (no key, or AI turned off)', limit: 'without AI (daily limit)', fehler: 'without AI (the AI did not answer)', gesperrt: 'without AI (robots.txt blocks AI assistants)', folgt: 'AI follows in a second step' },
    fehler: { adresse_ungueltig: 'That does not look like a website address.', nicht_erlaubt: 'This address may not be opened (not a public website).', nicht_erreichbar: 'The site does not respond.', keine_website: 'There is no website at this address.', robots_gesperrt: 'robots.txt asks programs not to read this site. The check respects that.' },
  },
};

// Dieselben Formen wie auf der Seite: voll, halb, leer (offener Ring), gestrichelt.
const ZEICHEN = { gruen: '●', gelb: '◐', rot: '○', offen: '◌' } as const;

// Eine kaputte Adresse im Beleg darf den Bericht nicht abbrechen.
const pfad = (adresse: string) => {
  try {
    return new URL(adresse).pathname;
  } catch {
    return adresse;
  }
};

export type Fehler = NonNullable<Signale['fehler']>;
export type Ergebnis =
  | { bericht: KiCheckBericht; kiStatus: KiStatus; dauerMs: number }
  | { fehler: Fehler; meldung: string };

/** Eine Prüfung. Mit KI nur, wenn mitKi, ein Schlüssel da ist und die robots.txt KI-Assistenten nicht sperrt. */
export async function pruefen(adresse: string, optionen: { sprache: Sprache; mitKi?: boolean }): Promise<Ergebnis> {
  const { sprache, mitKi = true } = optionen;
  const start = Date.now();
  const g = await sammeln(adresse, { bis: start + 24_000 });
  if (g.signale.fehler) return { fehler: g.signale.fehler, meldung: TEXTE[sprache].fehler[g.signale.fehler] };

  let ki: KiBericht | null = null;
  let kiStatus: KiStatus = 'pause';
  if (g.signale.kiGesperrt) {
    kiStatus = 'gesperrt';
  } else if (mitKi && process.env.ANTHROPIC_API_KEY) {
    const antwort = await alsKundeLesen(g, sprache, { fristMs: 45_000 });
    if ('fehler' in antwort) kiStatus = 'fehler';
    else { ki = antwort; kiStatus = 'ok'; }
  }
  const bericht = berichtBauen(bewerten(g.signale, ki ?? undefined, sprache), g.signale, ki, kiStatus, sprache);
  return { bericht, kiStatus, dauerMs: Date.now() - start };
}

/** Der Bericht als lesbarer Text, Stationen in der Reihenfolge der Seite. */
export function alsText(e: { bericht: KiCheckBericht; kiStatus: KiStatus; dauerMs: number }): string {
  const { bericht, kiStatus, dauerMs } = e;
  const TEXT = TEXTE[bericht.sprache];
  const urteil = (a: keyof typeof ZEICHEN, passtNicht?: boolean) => (passtNicht ? TEXT.urteil.passtNicht : TEXT.urteil[a]);
  const zeilen: string[] = [];
  zeilen.push(`${TEXT.titel}: ${bericht.domain}`);
  zeilen.push(`${TEXT.gelesen}: ${[TEXT.startseite, ...bericht.weitereSeiten.map((a) => TEXT.seiten[a] ?? a)].join(', ')} · ${(dauerMs / 1000).toFixed(1)} s · ${TEXT.ki[kiStatus]}`);
  zeilen.push('', TEXT.weg);
  const station = (zeichen: string, frage: string, wort: string, satz: string, beleg?: string) => {
    zeilen.push(`  ${zeichen} ${frage}  [${wort}]`, `    ${satz}`);
    if (beleg) zeilen.push(`    ${beleg}`);
  };
  for (const thema of ['google', 'handy'] as const) {
    const x = bericht.eindruck.find((y) => y.thema === thema);
    if (x) station(ZEICHEN[x.ampel], TEXT.stationen[thema], urteil(x.ampel), x.text, x.vorschau ? `${TEXT.q(x.vorschau.titel)} · ${x.vorschau.beschreibung}` : undefined);
  }
  // Reihenfolge wie auf der Seite: Anfragen ist das Ziel und steht am Ende,
  // davor seit 24.10.2026 die Frage aus der Branche (nur mit KI).
  for (const frage of ['leistungen', 'preise', 'zeiten', 'erreichen', 'ort', 'vertrauen', 'anfragen']) {
    const bf = bericht.branchenfrage;
    if (frage === 'anfragen' && bf) station(ZEICHEN[bf.ampel], bf.frage, urteil(bf.ampel), bf.satz, bf.beleg ? `${TEXT.q(bf.beleg.text)} (${pfad(bf.beleg.seite)})` : undefined);
    const p = bericht.punkte.find((x) => x.frage === frage);
    if (!p) continue;
    // Steht das Zitat schon im Satz, nur noch die Seite nennen.
    const imSatz = !!p.beleg && p.satz.includes(p.beleg.text.slice(0, 40));
    const beleg = !p.beleg ? undefined : p.beleg.notiz ? p.beleg.text : imSatz ? `${TEXT.fundstelle}: ${pfad(p.beleg.seite)}` : `${TEXT.q(p.beleg.text)} (${pfad(p.beleg.seite)})`;
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
  return zeilen.join('\n');
}

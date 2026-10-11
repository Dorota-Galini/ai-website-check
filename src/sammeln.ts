// KI-Check, Teil 1: Sammeln (ohne KI). Entstanden am 09./10.10.2026,
// Prüfprotokoll in docs/EVALUATION.md.
// Online gilt eine feste Frist (`bis`), damit alles in die 60 Sekunden einer
// Netlify-Funktion passt. Wird es knapp, fällt Nachprüfendes weg, nie wird
// dann etwas behauptet.
//
// Herr Entwurf geht als Kunde auf eine Website. Hier wird nur gelesen: die
// Startseite und bis zu sechs Unterseiten, die ein Kunde zuerst anklicken
// würde (Kontakt, Preise, Leistungen, Termin, Öffnungszeiten, Impressum).
// Gelesen wird der Quelltext ohne JavaScript, so wie ihn viele KI-Leser
// bekommen. Was erst per JavaScript erscheint, fehlt hier mit Absicht; die
// Probe mit --browser in ki-check.ts zeigt, wie groß der Unterschied ist.
//
// NIE etwas abschicken: keine Formulare, keine Buchungen, keine Anfragen.
// Die Adresse kommt später von Besuchern, die nicht beweisen müssen, dass es
// ihre eigene Seite ist.
//
// Schutz: nur öffentliche Server,
// höchstens 4 Weiterleitungen, 8 Sekunden und 800 KB je Seite.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Wer den Check selbst betreibt, setzt eine eigene Kennung mit Kontakt
// (KI_CHECK_KENNUNG), damit Betreiber geprüfter Seiten wissen, wer anfragt.
// Online auf galini-studio.de heißt er „GaliniStudio-KICheck“.
const KENNUNG = process.env.KI_CHECK_KENNUNG ?? 'Mozilla/5.0 (compatible; KI-Check/0.1)';
// So heißen wir in einer robots.txt (Produktname aus KENNUNG, ohne Groß-/Kleinschreibung).
const EIGENE_NAMEN = [...new Set([(KENNUNG.match(/compatible;\s*([\w.-]+)\//i)?.[1] ?? 'ki-check').toLowerCase(), 'ki-check'])];
// WordPress-Seiten mit Baukasten-Themes bringen über 1 MB mit, meist Stile
// im Kopf (Testlauf 09.10.2026: 1,06 MB, bei 800 KB fehlte der ganze Inhalt).
const HOECHSTENS_BYTES = 3_000_000;
const ZEIT_SEITE_MS = 8000;
const ZEIT_KLEIN_MS = 4000;
const HOECHSTENS_UNTERSEITEN = 6;

// ── Typen ───────────────────────────────────────────────────────────────

export type Art = 'start' | 'rahmen' | 'kontakt' | 'preise' | 'termin' | 'leistungen' | 'zeiten' | 'impressum';

export interface Seite {
  url: string;
  art: Art;
  titel?: string;
  /** Lesbarer Text mit Zeilenumbrüchen, Überschriften mit „## “. */
  text: string;
  woerter: number;
  noindex: boolean;
}

export interface Beleg {
  seite: string;
  text: string;
}

export interface Signale {
  eingabe: string;
  adresse?: string;
  /** Sprache der Startseite aus <html lang> („de“, „pl“ …). Der Bericht setzt damit lang an Zitate. */
  sprache?: string;
  fehler?: 'adresse_ungueltig' | 'nicht_erlaubt' | 'nicht_erreichbar' | 'keine_website' | 'robots_gesperrt';
  /** Die robots.txt sperrt KI-Assistenten, die auf Wunsch eines Menschen lesen: Bericht ohne KI. */
  kiGesperrt?: boolean;
  https?: boolean;
  handyAnsicht?: boolean;
  frames?: boolean;
  /** Startseite ohne JavaScript fast leer (unter 60 Wörter, viel Skript). */
  ohneJavaScriptLeer?: boolean;
  noindex?: boolean;
  /** Ohne www nicht erreichbar, nur mit. */
  nurMitWww?: boolean;
  /** Mindestens eine Verbindung brach ab und ging erst beim zweiten Versuch. */
  wackelig?: boolean;
  /** Unterseiten, die auch beim zweiten Versuch nicht kamen. Was dort steht, fehlt im Bericht. */
  nichtGelesen: { url: string; art: Art; grund: string }[];
  seiten: { url: string; art: Art; woerter: number }[];
  telefonKlickbar: Beleg[];
  telefonImText: Beleg[];
  whatsapp: Beleg[];
  emailKlickbar: Beleg[];
  emailImText: Beleg[];
  formular: Beleg[];
  /** Dieselben Formulare für den Bericht, ohne Sprache: Überschrift, Felder, Pflichtfelder oder der eingebundene Dienst. */
  formulare: { seite: string; ueberschrift?: string; felder: number; pflicht: number; dienst?: string }[];
  buchung: Beleg[];
  oeffnungszeiten: Beleg[];
  nachVereinbarung: Beleg[];
  /** Zeiten im Fließtext, z. B. „Ich rufe an: meistens morgens zwischen sieben und neun“. */
  zeitenFrei: Beleg[];
  preise: Beleg[];
  preisHinweise: Beleg[];
  preisDateien: Beleg[];
  anschrift: Beleg[];
  strukturiert: {
    typen: string[];
    ortsbetrieb: boolean;
    mitTelefon: boolean;
    mitAnschrift: boolean;
    mitZeiten: boolean;
  };
  robots: {
    gefunden: boolean;
    /** KI-Suchen und KI-Assistenten, die ausgesperrt sind. Das kostet Kunden. */
    sucheGesperrt: string[];
    /** Nur Training ausgesperrt. Das ist eine Entscheidung, kein Fehler. */
    trainingGesperrt: string[];
  };
  llmsTxt: boolean;
  /** So steht die Startseite in Google: Titel und Beschreibung (meta description). */
  google: { titel?: string; beschreibung?: string };
  /** Höchste Jahreszahl hinter ©/Copyright auf der Startseite. */
  jahrImFuss?: number;
  /** Platzhalter aus Vorlagen: Lorem ipsum, info@company.com, +01 123 … */
  vorlagenreste: Beleg[];
  /** Interne Links der Startseite, die geprüft wurden, und die ins Leere führen (404/410). */
  linksGeprueft: number;
  kaputteLinks: { url: string; text: string; status: number }[];
}

// ── Adressen prüfen ─────────────────────────────────────────────────────

function ipv4Intern(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function ipIntern(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Intern(ip);
  const klein = ip.toLowerCase();
  const gemappt = klein.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (gemappt) return ipv4Intern(gemappt[1]);
  return klein === '::' || klein === '::1' || /^f[cd]/.test(klein) || /^fe[89ab]/.test(klein) || /^ff/.test(klein);
}

async function pruefeAdresse(url: URL): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('nicht_erlaubt');
  if (url.username || url.password) throw new Error('nicht_erlaubt');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('nicht_erlaubt');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && isIP(host) === 0) throw new Error('nicht_erlaubt');
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i.test(host)) throw new Error('nicht_erlaubt');
  const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!ips.length || ips.some((x) => ipIntern(x.address))) throw new Error('nicht_erlaubt');
}

export function normalisiere(eingabe: string): URL | null {
  const roh = eingabe.trim().replace(/[\s<>"]/g, '');
  if (!roh || roh.length > 300) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(roh) ? roh : `https://${roh}`);
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

// ── Holen ───────────────────────────────────────────────────────────────

interface Geholt {
  url: URL;
  text: string;
  typ: string;
}

/** Ziel eines <meta http-equiv="refresh">. Alte Seiten leiten gern so weiter. */
function metaWeiterleitung(html: string, basis: URL): URL | null {
  const m = /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i.exec(html);
  if (!m) return null;
  try {
    return new URL(m[1], basis);
  } catch {
    return null;
  }
}

async function holen(start: URL, frist: number, nurText = true, zaehler?: { wiederholt: number }): Promise<Geholt> {
  const ende = Date.now() + frist;
  let url = start;
  for (let sprung = 0; sprung <= 4; sprung++) {
    await pruefeAdresse(url);
    const rest = ende - Date.now();
    if (rest < 300) throw new Error('nicht_erreichbar');
    const anfrage = () => fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(300, ende - Date.now())),
      headers: {
        'user-agent': KENNUNG,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
        'accept-language': 'de-DE,de;q=0.9,pl;q=0.7,en;q=0.5',
      },
    });
    // Ein Abbruch der Verbindung wird einmal wiederholt (Testlauf 09.10.2026:
    // ein Server setzte jede zweite Verbindung zurück, egal mit welcher Kennung).
    let antwort: Response;
    try {
      antwort = await anfrage();
    } catch (fehler) {
      if (!(fehler instanceof TypeError) || ende - Date.now() < 1500) throw fehler;
      if (zaehler) zaehler.wiederholt++;
      await new Promise((r) => setTimeout(r, 400));
      antwort = await anfrage();
    }
    if (antwort.status >= 300 && antwort.status < 400) {
      const ziel = antwort.headers.get('location');
      await antwort.body?.cancel();
      if (!ziel) throw new Error('nicht_erreichbar');
      url = new URL(ziel, url);
      continue;
    }
    if (!antwort.ok || !antwort.body) {
      await antwort.body?.cancel();
      throw new Error('nicht_erreichbar');
    }
    const typ = antwort.headers.get('content-type') ?? '';
    if (nurText && typ && !/html|xml|text\/plain|text\/markdown/i.test(typ)) {
      await antwort.body.cancel();
      throw new Error('keine_website');
    }
    const leser = antwort.body.getReader();
    const teile: Uint8Array[] = [];
    let groesse = 0;
    while (groesse < HOECHSTENS_BYTES) {
      const { done, value } = await leser.read();
      if (done) break;
      teile.push(value);
      groesse += value.byteLength;
    }
    await leser.cancel().catch(() => {});
    const bytes = new Uint8Array(groesse);
    let pos = 0;
    for (const t of teile) {
      bytes.set(t, pos);
      pos += t.byteLength;
    }
    const kopf = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    const zeichensatz = (typ.match(/charset=([\w-]+)/i)?.[1] ?? kopf.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase();
    let text: string;
    try {
      text = new TextDecoder(zeichensatz).decode(bytes);
    } catch {
      text = new TextDecoder('utf-8').decode(bytes);
    }
    const weiter = /html/i.test(typ) || /<html/i.test(text) ? metaWeiterleitung(text, url) : null;
    if (weiter && weiter.href !== url.href && sprung < 4) {
      url = weiter;
      continue;
    }
    return { url, text, typ };
  }
  throw new Error('nicht_erreichbar');
}

// ── Lesen ───────────────────────────────────────────────────────────────

const ZEICHEN: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', copy: '©',
  reg: '®', euro: '€', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«',
  raquo: '»', middot: '·', eacute: 'é', egrave: 'è', shy: '', zwnj: '', zwj: '', thinsp: ' ',
  ensp: ' ', emsp: ' ', bull: '•', times: '×',
};

function zeichenLoesen(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ZEICHEN[n] ?? m);
}

function attribute(tag: string): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    werte[m[1].toLowerCase()] = zeichenLoesen(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return werte;
}

function ohneBallast(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    // Abgeschnittene Seite: ein offenes <style> oder <script> bis zum Ende weg.
    .replace(/<(script|style)\b[^>]*>(?![\s\S]*<\/\1>)[\s\S]*$/i, ' ');
}

/** HTML in lesbaren Text mit Zeilen. Überschriften bekommen „## “. */
export function zuText(html: string): string {
  return zeichenLoesen(
    ohneBallast(html)
      .replace(/<h[1-6]\b[^>]*>/gi, '\n## ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|tr|dt|dd|section|article|header|footer|nav|ul|ol|table|address|blockquote|form|label|option)>/gi, '\n')
      .replace(/<(li)\b[^>]*>/gi, '\n• ')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<[^>]*>/g, ' '),
  )
    .split('\n')
    .map((z) => z.replace(/[ \t   ]+/g, ' ').replace(/^\s*\|\s*/, '').replace(/(\s*\|\s*)+$/, '').trim())
    .filter((z) => z && z !== '##' && z !== '•')
    .join('\n');
}

const woerterZaehlen = (text: string) => text.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;

interface Verweis {
  url: URL;
  text: string;
  href: string;
}

function verweise(html: string, basis: URL): Verweis[] {
  const liste: Verweis[] = [];
  for (const m of ohneBallast(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attribute(m[1]);
    const href = (a.href ?? '').trim();
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, basis);
    } catch {
      continue;
    }
    const text = zeichenLoesen(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() || a['aria-label'] || a.title || '';
    liste.push({ url, text: text.slice(0, 80), href });
  }
  return liste;
}

const JAHR = new Date().getFullYear();

/** Wie ohneBallast, aber der <head> bleibt (für meta description). */
function ohneBallastKopf(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
}

// Platzhalter, die beim Einrichten einer Vorlage stehen geblieben sind
// (KI-Runde 10.10.2026: „Have any Questions? +01 123 444 555 / info@company.com“).
const VORLAGENREST = /lorem ipsum|dolor sit amet|consectetur adipiscing|info@company\.com|@example\.(?:com|org|net|de)\b|\.example\b|your company|ihr firmenname|ihre firma gmbh|musterstra(?:ß|ss)e \d|max mustermann|erika mustermann|\+01 123|123[ -]?456[ -]?789|have any questions\?|just another wordpress site|ein weiterer wordpress-?(?:blog|website)|hello world!|hallo welt!|sample page|platzhaltertext|dummy text|blindtext|\b0{3} ?0{2} ?0{2}\b/i;

const gleicherHost = (a: URL, b: URL) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

// Welche Unterseite ein Kunde zuerst anklicken würde. Reihenfolge = Vorrang.
const ZIELE: [Art, RegExp][] = [
  ['kontakt', /kontakt|contact|anfahrt|standort|so-finden|erreichen|kontakt-?formular/i],
  ['preise', /preis|kosten|tarif|honorar|gebühr|gebuehr|price|cennik/i],
  ['termin', /termin|buchen|booking|reservier|online-?buchung/i],
  ['leistungen', /leistung|service|angebot|produkt|was-wir|unsere-arbeit|sortiment|speisekarte|men(u|ü)\b|uslug/i],
  ['zeiten', /öffnungszeit|oeffnungszeit|sprechzeit|geschäftszeit|geschaeftszeit/i],
  ['impressum', /impressum|imprint/i],
];
const NICHT_FOLGEN = /datenschutz|privacy|cookie|agb|widerruf|login|anmelden|warenkorb|cart|wp-admin|feed|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i;

function unterseitenWaehlen(alle: Verweis[], basis: URL, schon: Set<string>): { url: URL; art: Art }[] {
  const gewaehlt: { url: URL; art: Art }[] = [];
  // Wer eine Unterseite eingibt (z. B. /beispiele/dachdecker/), meint nur
  // diesen Teil, nicht die ganze Domain.
  const praefix = basis.pathname.replace(/[^/]*$/, '');
  for (const [art, muster] of ZIELE) {
    if (gewaehlt.length >= HOECHSTENS_UNTERSEITEN) break;
    for (const v of alle) {
      if (v.url.protocol !== 'https:' && v.url.protocol !== 'http:') continue;
      if (!gleicherHost(v.url, basis) || !v.url.pathname.startsWith(praefix)) continue;
      const ziel = new URL(v.url.href);
      ziel.hash = '';
      const schluessel = ziel.href.replace(/\/+$/, '');
      if (schon.has(schluessel) || NICHT_FOLGEN.test(ziel.pathname)) continue;
      if (!muster.test(decodeURIComponent(ziel.pathname)) && !muster.test(v.text)) continue;
      schon.add(schluessel);
      gewaehlt.push({ url: ziel, art });
      break;
    }
  }
  return gewaehlt;
}

// ── Signale ─────────────────────────────────────────────────────────────

const BUCHUNGSDIENSTE = /calendly\.com|cal\.com\/|doctolib\.|etermin\.net|terminland\.de|shore\.com|treatwell\.|samedi\.de|timify\.com|simplybook\.|setmore\.com|bookingkit\.|quandoo\.|opentable\.|resmio\.|thefork\.|dish\.co|gastronovi\.|planity\.|salonized\.|fresha\.com|phorest\.|termin2go|booksy\.com|acuityscheduling\.com|youcanbook\.me|tidycal\.com|zcal\.co|supersaas\.|outlook\.office365\.com\/(owa\/calendar|book)|bookings\.|jameda\.de|termed\.de|clickdoc\.de|terminkalender\.|appointlet\.|hubspot\.com\/meetings|cituro\.com|terminbuchung|online-?termin/i;
// Wochentage streng: „so“ und „die“ sind auch normale Wörter (Testlauf
// 09.10.2026: „§§ 8 bis 10“ im Impressum galt sonst als Öffnungszeit).
// Abkürzungen zählen nur groß geschrieben und nur in einer Spanne („Mo–Fr“,
// „Mo. bis Fr.“) oder direkt vor einer Uhrzeit.
const TAG_KURZ = '(?:Mo|Di|Mi|Do|Fr|Sa|So)\\.?';
const TAG_LANG = '(?:[Mm]ontags?|[Dd]ienstags?|[Mm]ittwochs?|[Dd]onnerstags?|[Ff]reitags?|[Ss]amstags?|[Ss]onntags?|[Ww]erktags|[Tt]äglich|[Ff]eiertags?)';
const WOCHENTAG = new RegExp(
  `${TAG_LANG}|\\b${TAG_KURZ}\\s*(?:–|-|—|bis|und|&|,)\\s*${TAG_KURZ}(?![\\wäöü])|\\b${TAG_KURZ}:?\\s+\\d{1,2}(?:[:.]\\d{2}|\\s*(?:–|-|—|bis)\\s*\\d{1,2}\\s*(?:[:.]\\d{2}|[Uu]hr))`,
);
// Eine Uhrzeitspanne braucht Minuten oder „Uhr“, sonst ist „5 bis 16 €“ auch eine.
const UHRZEIT_SPANNE = /\b\d{1,2}(?:[:.]\d{2}\s*(?:uhr)?|\s*uhr)\s*(?:–|-|—|bis)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:uhr)?(?!\s*(?:€|eur|%|jahre|monat|tag|stück|seiten))|\b\d{1,2}\s*(?:–|-|—|bis)\s*\d{1,2}(?:[:.]\d{2})\s*(?:uhr)?|\b\d{1,2}\s*(?:–|-|—|bis)\s*\d{1,2}\s*uhr\b/i;
const ZEITEN_TITEL = /öffnungszeit|oeffnungszeit|geschäftszeit|geschaeftszeit|bürozeit|buerozeit|sprechzeit|erreichbar(keit)?|godziny otwarcia/i;
const BETRAG = /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2}|,-|,–)?\s*(?:€|eur\b|euro\b)|€\s*\d/i;
const KEIN_PREIS = /stammkapital|haftung|bußgeld|bussgeld|streitwert|umsatzsteuer|ust-?id|handelsregister|förder|foerder|zuschuss|bafa|kfw|gewinnspiel|spende|gutschein im wert|cookie|bis zu \d+ ?% |rabatt-?code|überweis|ueberweis|iban/i;
// Zeiten ohne Wochentag, nur mit Zusammenhang „anrufen, erreichen“ in der
// Zeile oder der Überschrift davor (Testlauf 09.10.2026, galini-studio.de).
const ZEIT_FREI = /\b(?:morgens|vormittags|mittags|nachmittags|abends)\b[^.]*\b(?:uhr|zwischen|bis|ab)\b|\b(?:ab|bis|zwischen|nach|vor)\s+\d{1,2}(?:[:.]\d{2})?\s*uhr\b|\bzwischen\s+(?:sieben|acht|neun|zehn|elf|zwölf|\d{1,2})\s+und\s+(?:acht|neun|zehn|elf|zwölf|\d{1,2})\b|\b(?:innerhalb|binnen)\s+(?:von\s+)?(?:\d{1,3}|zwei|drei|vier)\s+(?:stunden|werktag(?:en)?|tag(?:en)?)\b|\bam\s+selben\s+tag\b|\bw\s+ciągu\s+\d{1,3}\s+godzin/i;
const ZEIT_ZUSAMMENHANG = /anruf|rufe|rufen|rückruf|zurückruf|erreich|telefon|melde|antwort|sprechstunde|büro|buero|besuch/i;
const PREIS_HINWEIS = /kostenlos|kostenfrei|gratis|unverbindlich(e|es)? (angebot|kostenvoranschlag|beratung)|festpreis|preis auf anfrage|preise auf anfrage|kostenvoranschlag/i;
// Nur „nach Vereinbarung“. „Nach Absprache“ stand im Testlauf bei Preisen.
const NACH_VEREINBARUNG = /nach (telefonischer |vorheriger )?vereinbarung/i;
// Nummer mit Hinweis davor („Tel.“, „Oder anrufen:“) oder allein in der Zeile.
const TELEFON_IM_TEXT = /(?:tel(?:efon)?|fon|phone|mobil|handy|anrufen|ruf(?:en sie)?(?: uns)? an|hotline|notdienst|zentrale|☎|📞)\.?\s*(?:[:.]|\(.*?\))?\s*((?:\+49|0049|0)[\d\s\/().–-]{6,22}\d)|^\s*((?:\+49|0049|0)\d[\d\s\/().–-]{5,20}\d)\s*$/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
// Anschrift: vom „PLZ Ort“ aus rückwärts. Die Straße steht davor in derselben
// Zeile (nach · , | ;) oder in der Zeile darüber und endet mit einer
// Hausnummer. So zählen auch „Am Bokel 6 b“ oder „Beim alten Flugplatz 6“.
const PLZ_ORT = /(?<![\d+/-]\s?)\b(?:D-\s?)?(\d{5})\s+([A-ZÄÖÜ][\wäöüß.-]+(?:[ -](?:\(?[A-ZÄÖÜ][\wäöüß.)-]+))*)/;
const HAUSNUMMER_AM_ENDE = /^[A-ZÄÖÜ][\wäöüßÄÖÜ.' -]{2,55}?\s\d{1,4}(?:\s?[a-zA-Z](?![\wäöü])|\s?[-/]\s?\d{1,4})?$/;
const KEINE_STRASSE = /^(tel|fax|fon|mobil|handy|ust|steuer|hrb|hra|amtsgericht|postfach|iban|bic|reg|sitz|stand|version|seite)\b/i;

// KI-Leser in robots.txt. Suche: wer hier gesperrt ist, taucht in den
// Antworten von ChatGPT, Claude, Perplexity, Copilot oder Siri nicht oder
// schlechter auf. Training: Aussperren ist eine eigene Entscheidung.
const KI_SUCHE = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Bingbot', 'Googlebot', 'Applebot'];
const KI_TRAINING = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'meta-externalagent', 'Bytespider'];
// KI-Assistenten, die auf Wunsch eines Menschen eine Seite lesen, so wie Herr
// Entwurf. Sperrt die robots.txt einen davon für die ganze Seite, wertet er sie
// ohne KI aus. Reine Trainings-Sperren (KI_TRAINING) zählen nicht: Über die
// Schnittstelle von Anthropic wird nicht trainiert.
const KI_ASSISTENTEN = ['ChatGPT-User', 'OAI-SearchBot', 'Claude-User', 'Claude-SearchBot', 'Perplexity-User', 'PerplexityBot'];

/** Höchstens 160 Zeichen. Bei langen Zeilen der Ausschnitt um den Fund herum. */
function beleg(liste: Beleg[], seite: string, text: string, hoechstens = 4, fund?: RegExp) {
  let t = text.replace(/\s+/g, ' ').replace(/^##\s*/, '').trim();
  if (t.length > 160) {
    const stelle = fund ? Math.max(0, t.search(fund)) : 0;
    const von = Math.max(0, Math.min(stelle - 70, t.length - 160));
    t = `${von > 0 ? '…' : ''}${t.slice(von, von + 158).trim()}…`;
  }
  if (!t || liste.length >= hoechstens || liste.some((b) => b.text === t)) return;
  liste.push({ seite, text: t });
}

function leereSignale(eingabe: string): Signale {
  return {
    eingabe,
    seiten: [],
    telefonKlickbar: [], telefonImText: [], whatsapp: [], emailKlickbar: [], emailImText: [],
    formular: [], formulare: [], buchung: [], oeffnungszeiten: [], nachVereinbarung: [], zeitenFrei: [],
    preise: [], preisHinweise: [], preisDateien: [], anschrift: [],
    strukturiert: { typen: [], ortsbetrieb: false, mitTelefon: false, mitAnschrift: false, mitZeiten: false },
    robots: { gefunden: false, sucheGesperrt: [], trainingGesperrt: [] },
    llmsTxt: false,
    nichtGelesen: [],
    google: {},
    vorlagenreste: [],
    linksGeprueft: 0,
    kaputteLinks: [],
  };
}

/** Formulare, mit denen ein Kunde anfragen kann. Suche, Login, Newsletter zählen nicht. */
function formulareLesen(html: string, seite: string, s: Signale) {
  const ohne = ohneBallast(html);
  for (const m of ohne.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const inhalt = m[2];
    if (/type=["']?(search|password)|role=["']?search/i.test(m[0])) continue;
    // Ganze Tags, sonst zählen versteckte Felder und Knöpfe mit (bis 10.10.2026 so).
    const eingaben = (inhalt.match(/<(?:input|textarea|select)\b[^>]*>/gi) ?? []).filter((f) => !/type=["']?(hidden|submit|button|image|reset)\b/i.test(f));
    const felder = eingaben.length;
    const pflicht = eingaben.filter((f) => /\srequired\b|aria-required=["']?true/i.test(f)).length;
    const sichtbar = eingaben.filter((f) => /^<input/i.test(f) && !/type=["']?(checkbox|radio)\b/i.test(f)).length;
    const textfeld = /<textarea\b/i.test(inhalt);
    if (/newsletter/i.test(inhalt) && !textfeld) continue;
    if (!textfeld && sichtbar < 3) continue;
    // Satzzeichen am Zeilenende weg, sonst steht „Fragen.,“ im Material.
    const beschriftung = zuText(inhalt).split('\n').map((z) => z.trim().replace(/[.,;:]+$/, '')).filter(Boolean).slice(0, 6).join(', ');
    beleg(s.formular, seite, `Formular mit ${felder} ${felder === 1 ? 'Feld' : 'Feldern'}: ${beschriftung}`);
    // Für den Bericht: die Überschrift im Formular (legend, h1 bis h4) oder die letzte davor.
    const kopf = inhalt.match(/<(legend|h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2]
      ?? [...ohne.slice(Math.max(0, (m.index ?? 0) - 4000), m.index).matchAll(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)].pop()?.[2];
    const ueberschrift = kopf ? zeichenLoesen(kopf.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (s.formulare.length < 4 && !s.formulare.some((f) => f.felder === felder && (f.ueberschrift ?? '') === ueberschrift)) {
      s.formulare.push({ seite, felder, pflicht, ...(ueberschrift ? { ueberschrift } : {}) });
    }
  }
  // Formular-Dienste, die als Rahmen eingebunden sind.
  for (const m of html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)) {
    if (/jotform|typeform|forms\.gle|docs\.google\.com\/forms|formular|form\.|hubspot|cognitoforms|tally\.so|123formbuilder/i.test(m[1])) {
      beleg(s.formular, seite, `Eingebundenes Formular: ${m[1].slice(0, 100)}`);
      let dienst = '';
      try { dienst = new URL(m[1], seite).hostname.replace(/^www\./, ''); } catch { /* kaputte Adresse */ }
      if (dienst && s.formulare.length < 4 && !s.formulare.some((f) => f.dienst === dienst)) s.formulare.push({ seite, felder: 0, pflicht: 0, dienst });
    }
  }
}

function strukturiertLesen(html: string, s: Signale) {
  const typen = new Set<string>(s.strukturiert.typen);
  const ortsbetrieb = /LocalBusiness|Store|Restaurant|Dentist|Physician|Contractor|Electrician|Plumber|Roofing|AutoRepair|AutoDealer|HomeAndConstruction|ProfessionalService|LegalService|Attorney|Notary|Bakery|Cafe|BeautySalon|HairSalon|HealthAndBeauty|MedicalBusiness|MedicalClinic|LodgingBusiness|Hotel|FoodEstablishment|Locksmith|HVACBusiness|HousePainter|GeneralContractor|AutomotiveBusiness|FinancialService|InsuranceAgency|RealEstateAgent|TravelAgency|SportsActivityLocation|EntertainmentBusiness|ChildCare|DryCleaning|EmploymentAgency|Florist|GardenStore/;
  const besuchen = (knoten: unknown) => {
    if (!knoten || typeof knoten !== 'object') return;
    if (Array.isArray(knoten)) return knoten.forEach(besuchen);
    const o = knoten as Record<string, unknown>;
    const typ = o['@type'];
    const liste = Array.isArray(typ) ? typ : typ ? [typ] : [];
    for (const t of liste) if (typeof t === 'string') typen.add(t);
    if (liste.some((t) => typeof t === 'string' && ortsbetrieb.test(t))) {
      s.strukturiert.ortsbetrieb = true;
      if (o.telephone) s.strukturiert.mitTelefon = true;
      if (o.address) s.strukturiert.mitAnschrift = true;
      if (o.openingHours || o.openingHoursSpecification) s.strukturiert.mitZeiten = true;
    }
    for (const wert of Object.values(o)) if (wert && typeof wert === 'object') besuchen(wert);
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      besuchen(JSON.parse(m[1].trim()));
    } catch {
      /* kaputtes JSON-LD: zählt nicht */
    }
  }
  for (const m of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/(\w+)/gi)) {
    typen.add(m[1]);
    if (ortsbetrieb.test(m[1])) s.strukturiert.ortsbetrieb = true;
  }
  s.strukturiert.typen = [...typen].slice(0, 12);
}

function seiteAuswerten(geholt: Geholt, art: Art, s: Signale): Seite {
  const html = geholt.text;
  const url = geholt.url.href;
  const text = zuText(html);
  const titel = zeichenLoesen(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() || undefined;
  const noindex = /<meta\b[^>]*name=["']?robots["']?[^>]*content=["'][^"']*noindex/i.test(html) ||
    /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']?robots/i.test(html);

  // Verweise: Telefon, WhatsApp, E-Mail, Buchung, Preislisten
  for (const v of verweise(html, geholt.url)) {
    const h = v.href;
    if (/^tel:/i.test(h)) beleg(s.telefonKlickbar, url, decodeURIComponent(h.slice(4)) + (v.text ? ` („${v.text}“)` : ''));
    else if (/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|chat\.whatsapp\.com/i.test(h)) beleg(s.whatsapp, url, v.text || h);
    else if (/^mailto:/i.test(h)) beleg(s.emailKlickbar, url, decodeURIComponent(h.slice(7).split('?')[0]));
    if (BUCHUNGSDIENSTE.test(h)) beleg(s.buchung, url, `${v.text ? `„${v.text}“, ` : ''}${v.url.hostname}${v.url.pathname}`.slice(0, 140));
    if (/\.pdf$/i.test(v.url.pathname) && /preis|tarif|kosten|karte|liste|cennik/i.test(v.text + ' ' + v.url.pathname)) {
      beleg(s.preisDateien, url, `${v.text ? `„${v.text}“, ` : ''}${decodeURIComponent(v.url.pathname.split('/').pop() ?? '')}`);
    }
  }
  // Buchungsdienste als Rahmen oder Skript
  for (const m of html.matchAll(/<(iframe|script)\b[^>]*src=["']([^"']+)["']/gi)) {
    if (BUCHUNGSDIENSTE.test(m[2])) beleg(s.buchung, url, m[2].replace(/^https?:\/\//, '').slice(0, 100));
  }
  formulareLesen(html, url, s);
  strukturiertLesen(html, s);

  // Text Zeile für Zeile
  const zeilen = text.split('\n');
  let nachZeitenTitel = 0;
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (ZEITEN_TITEL.test(z)) nachZeitenTitel = 6;
    const mitNachbar = `${z} ${zeilen[i + 1] ?? ''}`;
    if ((WOCHENTAG.test(z) && UHRZEIT_SPANNE.test(z)) || (WOCHENTAG.test(z) && UHRZEIT_SPANNE.test(zeilen[i + 1] ?? '') && z.length < 40)) {
      beleg(s.oeffnungszeiten, url, WOCHENTAG.test(z) && UHRZEIT_SPANNE.test(z) ? z : mitNachbar, 4, WOCHENTAG);
    } else if (nachZeitenTitel > 0 && UHRZEIT_SPANNE.test(z)) {
      beleg(s.oeffnungszeiten, url, z, 4, UHRZEIT_SPANNE);
    }
    if (nachZeitenTitel > 0) nachZeitenTitel--;
    if (NACH_VEREINBARUNG.test(z)) beleg(s.nachVereinbarung, url, z, 2, NACH_VEREINBARUNG);
    if (ZEIT_FREI.test(z) && !WOCHENTAG.test(z) && (ZEIT_ZUSAMMENHANG.test(z) || ZEIT_ZUSAMMENHANG.test(zeilen[i - 1] ?? '') || ZEIT_ZUSAMMENHANG.test(zeilen[i - 2] ?? ''))) {
      beleg(s.zeitenFrei, url, z, 2, ZEIT_FREI);
    }

    // Ein Betrag allein in der Zeile unter „IBAN“ oder „Überweisung“ ist ein
    // Zahlungsbeispiel, kein Preis (Testlauf 09.10.2026, Seite eines Softwareanbieters).
    const zahlungDavor = /iban|überweis|ueberweis/i.test(zeilen.slice(Math.max(0, i - 4), i).join(' '));
    if (art !== 'impressum' && BETRAG.test(z) && !KEIN_PREIS.test(z) && !zahlungDavor) beleg(s.preise, url, z, 5, BETRAG);
    if (art !== 'impressum' && PREIS_HINWEIS.test(z)) beleg(s.preisHinweise, url, z, 3, PREIS_HINWEIS);

    for (const m of z.matchAll(TELEFON_IM_TEXT)) beleg(s.telefonImText, url, m[0], 3);
    for (const m of z.matchAll(EMAIL)) {
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(m[0]) && !/sentry|wixpress|example\./i.test(m[0])) beleg(s.emailImText, url, m[0], 3);
    }
  }
  // Anschrift: PLZ Ort finden, Straße davor suchen.
  for (let i = 0; i < zeilen.length; i++) {
    const ort = PLZ_ORT.exec(zeilen[i]);
    if (!ort) continue;
    const davor = zeilen[i].slice(0, ort.index).split(/\s*[·,|;•]\s*|\s{2,}/).map((t) => t.trim()).filter(Boolean);
    const kandidaten = [davor.at(-1), (zeilen[i - 1] ?? '').split(/\s*[·,|;•]\s*/).at(-1)?.trim()];
    const strasse = kandidaten.find((k) => k && HAUSNUMMER_AM_ENDE.test(k) && !KEINE_STRASSE.test(k));
    if (strasse) beleg(s.anschrift, url, `${strasse}, ${ort[1]} ${ort[2]}`.replace(/\s+/g, ' '), 3);
  }

  // Platzhalter aus Vorlagen, auf jeder Seite.
  for (const z of zeilen) {
    const m = VORLAGENREST.exec(z);
    if (m) beleg(s.vorlagenreste, url, z, 3, VORLAGENREST);
  }
  if (art === 'start' || art === 'rahmen') {
    if (art === 'start') {
      const beschreibung = [...ohneBallastKopf(html).matchAll(/<meta\b[^>]*>/gi)]
        .map((m) => attribute(m[0]))
        .find((a) => (a.name ?? '').toLowerCase() === 'description')?.content;
      s.google = { titel, beschreibung: beschreibung?.replace(/\s+/g, ' ').trim() || undefined };
    }
    for (const m of text.matchAll(/(?:©|copyright|\(c\))\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)) {
      const jahr = Number(m[1]);
      if (jahr <= JAHR && (!s.jahrImFuss || jahr > s.jahrImFuss)) s.jahrImFuss = jahr;
    }
  }

  return { url, art, titel, text, woerter: woerterZaehlen(text), noindex };
}

// ── robots.txt und llms.txt ─────────────────────────────────────────────
//
// Seit 10.10.2026 hält sich der Check selbst an die robots.txt
// (vorsorglich). Sperrt sie eine Seite für uns
// (eigene Gruppe, siehe EIGENE_NAMEN, sonst „*“), lesen wir sie nicht;
// ist schon die Startseite gesperrt, gibt es keinen Bericht. Sperrt sie
// KI-Assistenten (KI_ASSISTENTEN), gibt es den Bericht ohne KI. Es zählen nur
// ausdrückliche Verbote: Gibt es keine robots.txt oder kommt sie nicht, liest
// Herr Entwurf wie ein Browser, auf Wunsch des Besuchers.

type RobotsGruppe = { namen: string[]; regeln: { erlaubt: boolean; pfad: string }[] };

/** Gruppen einer robots.txt nach RFC 9309: Namen in Kleinbuchstaben, Regeln in der Reihenfolge der Datei. */
function robotsGruppen(robots: string): RobotsGruppe[] {
  const gruppen: RobotsGruppe[] = [];
  let aktuell: RobotsGruppe | null = null;
  let letzteWarAgent = false;
  for (const roh of robots.split(/\r?\n/)) {
    const zeile = roh.replace(/#.*$/, '').trim();
    const m = zeile.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const feld = m[1].toLowerCase();
    const wert = m[2].trim();
    if (feld === 'user-agent') {
      if (!aktuell || !letzteWarAgent) {
        aktuell = { namen: [], regeln: [] };
        gruppen.push(aktuell);
      }
      aktuell.namen.push(wert.toLowerCase());
      letzteWarAgent = true;
    } else if (feld === 'allow' || feld === 'disallow') {
      letzteWarAgent = false;
      aktuell?.regeln.push({ erlaubt: feld === 'allow', pfad: wert });
    } else {
      letzteWarAgent = false;
    }
  }
  return gruppen;
}

/** Passt eine Regel auf den Pfad? „*“ steht für beliebig viele Zeichen, „$“ am Ende für das Ende. */
function regelPasst(muster: string, pfad: string): boolean {
  const amEnde = muster.endsWith('$');
  const kern = (amEnde ? muster.slice(0, -1) : muster).split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${kern}${amEnde ? '$' : ''}`).test(pfad);
}

/**
 * Darf einer dieser Leser den Pfad (mit Abfrage) lesen? Die Gruppe mit dem
 * eigenen Namen gilt vor „*“. Die längste passende Regel gewinnt, bei
 * Gleichstand Allow. „Disallow:“ ohne Pfad heißt: alles erlaubt.
 */
function robotsErlaubt(gruppen: RobotsGruppe[], leser: string[], pfad: string): boolean {
  const namen = leser.map((l) => l.toLowerCase());
  const eigene = gruppen.filter((g) => g.namen.some((n) => namen.includes(n)));
  const regeln = (eigene.length ? eigene : gruppen.filter((g) => g.namen.includes('*'))).flatMap((g) => g.regeln);
  let beste: { erlaubt: boolean; laenge: number } | null = null;
  for (const r of regeln) {
    if (!r.pfad || !regelPasst(r.pfad, pfad)) continue;
    if (!beste || r.pfad.length > beste.laenge || (r.pfad.length === beste.laenge && r.erlaubt)) {
      beste = { erlaubt: r.erlaubt, laenge: r.pfad.length };
    }
  }
  return beste ? beste.erlaubt : true;
}

/** Ist „/“ für diesen Leser gesperrt? */
function robotsSperrt(robots: string, leser: string): boolean {
  return !robotsErlaubt(robotsGruppen(robots), [leser], '/');
}

// ── Kaputte Links ───────────────────────────────────────────────────────

/** HTTP-Status einer Adresse, Weiterleitungen gefolgt. 0 heißt: keine Antwort. */
async function linkStatus(start: URL): Promise<number> {
  let url = start;
  const ende = Date.now() + 6000;
  for (let sprung = 0; sprung <= 4; sprung++) {
    try {
      await pruefeAdresse(url);
      const antwort = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(300, ende - Date.now())),
        headers: { 'user-agent': KENNUNG, accept: 'text/html,*/*;q=0.5' },
      });
      await antwort.body?.cancel();
      const ziel = antwort.headers.get('location');
      if (antwort.status >= 300 && antwort.status < 400 && ziel) {
        url = new URL(ziel, url);
        continue;
      }
      return antwort.status;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Die internen Links der Startseite (höchstens 20), vier gleichzeitig.
 * Als kaputt zählt nur 404 oder 410. Zeitüberschreitung und Serverfehler
 * können an der Leitung liegen und werden nicht gemeldet.
 */
async function linksPruefen(alle: Verweis[], basis: URL, gelesen: Set<string>, s: Signale, erlaubt: (u: URL) => boolean, bis = Number.POSITIVE_INFINITY) {
  const ziele = new Map<string, { url: URL; text: string }>();
  for (const v of alle) {
    if ((v.url.protocol !== 'https:' && v.url.protocol !== 'http:') || !gleicherHost(v.url, basis)) continue;
    if (!erlaubt(v.url)) continue; // von der robots.txt gesperrt: nicht anfragen, nicht zählen
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i.test(v.url.pathname) || /wp-admin|wp-login|login|warenkorb|cart|feed/i.test(v.url.pathname)) continue;
    const u = new URL(v.url.href);
    u.hash = '';
    const schluessel = u.href.replace(/\/+$/, '');
    if (gelesen.has(schluessel) || ziele.has(schluessel)) continue;
    ziele.set(schluessel, { url: u, text: v.text });
    if (ziele.size >= 20) break;
  }
  const liste = [...ziele.values()];
  let geprueft = 0;
  for (let i = 0; i < liste.length; i += 4) {
    if (bis - Date.now() < 7000) break; // keine Zeit mehr: lieber weniger prüfen
    geprueft += liste.slice(i, i + 4).length;
    const stati = await Promise.all(liste.slice(i, i + 4).map((z) => linkStatus(z.url)));
    stati.forEach((status, j) => {
      const z = liste[i + j];
      if (status === 404 || status === 410) s.kaputteLinks.push({ url: z.url.href, text: z.text, status });
    });
  }
  s.linksGeprueft = geprueft + gelesen.size - 1;
}

/** Text der robots.txt; leer, wenn es keine gibt oder sie nicht kommt (dann ist alles erlaubt). */
async function robotsHolen(basis: URL, frist: number): Promise<string> {
  try {
    const { text, typ } = await holen(new URL('/robots.txt', basis), frist);
    return /html/i.test(typ) || /<html/i.test(text) ? '' : text; // Fehlerseite statt robots.txt
  } catch {
    return '';
  }
}

/** Was die robots.txt über KI-Leser sagt, für den Bericht und für die Frage „mit KI?“. */
function robotsAuswerten(text: string, s: Signale) {
  if (!text) return;
  s.robots.gefunden = true;
  s.robots.sucheGesperrt = KI_SUCHE.filter((l) => robotsSperrt(text, l));
  s.robots.trainingGesperrt = KI_TRAINING.filter((l) => robotsSperrt(text, l));
  s.kiGesperrt = KI_ASSISTENTEN.some((l) => robotsSperrt(text, l));
}

async function llmsLesen(basis: URL, s: Signale) {
  try {
    const { text, typ } = await holen(new URL('/llms.txt', basis), ZEIT_KLEIN_MS);
    s.llmsTxt = !/html/i.test(typ) && !/<html/i.test(text) && text.trim().length > 20;
  } catch {
    s.llmsTxt = false;
  }
}

/**
 * Geht die Domain ohne www wirklich nicht? Nur dann ja, wenn es sie im DNS
 * nicht gibt oder weder http noch https überhaupt antworten. Eine
 * Weiterleitung auf www zählt als erreichbar. (Testlauf 09.10.2026: Bei zwei
 * Betrieben war es nur ein kurzer Aussetzer, das wäre ein falscher Vorwurf.)
 */
async function ohneWwwTot(start: URL): Promise<boolean> {
  try {
    await lookup(start.hostname);
  } catch {
    return true;
  }
  for (const protokoll of ['https:', 'http:']) {
    for (let versuch = 0; versuch < 2; versuch++) {
      try {
        const u = new URL(start.href);
        u.protocol = protokoll;
        await pruefeAdresse(u);
        const antwort = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': KENNUNG } });
        await antwort.body?.cancel();
        return false;
      } catch {
        /* nächster Versuch */
      }
    }
  }
  return true;
}

// ── Ablauf ──────────────────────────────────────────────────────────────

export interface Gesammelt {
  signale: Signale;
  seiten: Seite[];
}

export async function sammeln(eingabe: string, optionen: { bis?: number } = {}): Promise<Gesammelt> {
  const bis = optionen.bis ?? Number.POSITIVE_INFINITY;
  const frist = (ms: number) => Math.max(0, Math.min(ms, bis - Date.now()));
  const s = leereSignale(eingabe);
  const start = normalisiere(eingabe);
  if (!start) return { signale: { ...s, fehler: 'adresse_ungueltig' }, seiten: [] };

  // robots.txt je Host einmal holen, bevor dort irgendeine Seite gelesen wird.
  const robotsJeHost = new Map<string, Promise<string>>();
  const robotsText = (u: URL) => {
    if (!robotsJeHost.has(u.origin)) robotsJeHost.set(u.origin, robotsHolen(u, frist(ZEIT_KLEIN_MS)));
    return robotsJeHost.get(u.origin)!;
  };
  const fuerUnsGesperrt = async (u: URL) => !robotsErlaubt(robotsGruppen(await robotsText(u)), EIGENE_NAMEN, u.pathname + u.search);
  const gesperrt = (): Gesammelt => ({ signale: { ...s, fehler: 'robots_gesperrt' }, seiten: [] });

  // Reihenfolge: wie eingegeben, dann mit www (manche Domains gehen nur so,
  // Testlauf 09.10.2026), dann ohne https (alte Seiten).
  const zaehler = { wiederholt: 0 };
  const versuche: URL[] = [start];
  if (!/^www\./i.test(start.hostname) && isIP(start.hostname) === 0) {
    const mitWww = new URL(start.href);
    mitWww.hostname = `www.${start.hostname}`;
    versuche.push(mitWww);
  }
  if (start.protocol === 'https:') {
    for (const v of [...versuche]) versuche.push(new URL(v.href.replace(/^https:/, 'http:')));
  }
  let startSeite: Geholt | null = null;
  let ersterFehler = '';
  for (const versuch of versuche) {
    if (frist(ZEIT_SEITE_MS) < 1500) break;
    if (await fuerUnsGesperrt(versuch)) return gesperrt();
    try {
      startSeite = await holen(versuch, frist(ZEIT_SEITE_MS), true, zaehler);
      if (versuch.hostname !== start.hostname) s.nurMitWww = bis - Date.now() > 20_000 ? await ohneWwwTot(start) : false;
      break;
    } catch (fehler) {
      const art = fehler instanceof Error ? fehler.message : '';
      ersterFehler ||= art;
      if (art === 'nicht_erlaubt') break;
    }
  }
  if (!startSeite && ersterFehler !== 'nicht_erlaubt' && bis - Date.now() > 15_000) {
    await new Promise((w) => setTimeout(w, 2000));
    for (const versuch of versuche) {
      if (frist(ZEIT_SEITE_MS) < 1500) break;
      if (await fuerUnsGesperrt(versuch)) return gesperrt();
      try {
        startSeite = await holen(versuch, frist(ZEIT_SEITE_MS), true, zaehler);
        if (versuch.hostname !== start.hostname) s.nurMitWww = bis - Date.now() > 20_000 ? await ohneWwwTot(start) : false;
        break;
      } catch {
        /* nächste Variante */
      }
    }
  }
  if (!startSeite) {
    const fehler = ersterFehler === 'nicht_erlaubt' || ersterFehler === 'keine_website' ? ersterFehler : 'nicht_erreichbar';
    return { signale: { ...s, fehler }, seiten: [] };
  }
  if (!/html/i.test(startSeite.typ) && !/<html/i.test(startSeite.text)) return { signale: { ...s, fehler: 'keine_website' }, seiten: [] };

  const basis = startSeite.url;
  // Nach einer Weiterleitung (etwa auf www) gilt die robots.txt des Ziels.
  if (await fuerUnsGesperrt(basis)) return gesperrt();
  const robots = await robotsText(basis);
  const regeln = robotsGruppen(robots);
  const erlaubt = (u: URL) => robotsErlaubt(regeln, EIGENE_NAMEN, u.pathname + u.search);
  robotsAuswerten(robots, s);
  s.adresse = basis.href;
  s.https = basis.protocol === 'https:';
  s.handyAnsicht = /<meta\b[^>]*name=["']?viewport/i.test(startSeite.text);
  s.sprache = startSeite.text.match(/<html\b[^>]*\slang=["']?([a-z]{2,3})\b/i)?.[1]?.toLowerCase();

  const seiten: Seite[] = [seiteAuswerten(startSeite, 'start', s)];
  const schon = new Set<string>([basis.href.replace(/\/+$/, '')]);
  let alleVerweise = verweise(startSeite.text, basis);

  // Alte Seiten mit Frames: Der Inhalt steckt in den Rahmen, der wichtigste
  // heißt meist main, haupt oder content und steht oft als letzter da.
  const rahmen = [...startSeite.text.matchAll(/<(?:frame|iframe)\b[^>]*>/gi)]
    .map((m) => attribute(m[0]))
    .map((a) => { try { return { url: new URL(a.src ?? '', basis), haupt: /main|haupt|content|inhalt/i.test(`${a.name ?? ''} ${a.src ?? ''}`) }; } catch { return null; } })
    .filter((r): r is { url: URL; haupt: boolean } => !!r && !!r.url.pathname && gleicherHost(r.url, basis) && erlaubt(r.url) && !schon.has(r.url.href.replace(/\/+$/, '')))
    .sort((a, b) => Number(b.haupt) - Number(a.haupt))
    .slice(0, 5)
    .map((r) => r.url);
  s.frames = /<frameset\b/i.test(startSeite.text);
  const geholteRahmen = await Promise.allSettled(rahmen.map((u) => holen(u, frist(ZEIT_SEITE_MS), true, zaehler)));
  for (const r of geholteRahmen) {
    if (r.status !== 'fulfilled') continue;
    schon.add(r.value.url.href.replace(/\/+$/, ''));
    seiten.push(seiteAuswerten(r.value, 'rahmen', s));
    alleVerweise = alleVerweise.concat(verweise(r.value.text, r.value.url));
  }

  // Was die robots.txt für uns sperrt, wird nicht gelesen und im Bericht so benannt.
  const ausgewaehlt = unterseitenWaehlen(alleVerweise, basis, schon);
  const ziele = ausgewaehlt.filter((z) => erlaubt(z.url));
  for (const z of ausgewaehlt) if (!erlaubt(z.url)) s.nichtGelesen.push({ url: z.url.href, art: z.art, grund: 'robots' });
  const [geholt] = await Promise.all([
    Promise.allSettled(ziele.map((z) => holen(z.url, frist(ZEIT_SEITE_MS), true, zaehler))),
    erlaubt(new URL('/llms.txt', basis)) ? llmsLesen(basis, s) : Promise.resolve(),
  ]);
  // Was nicht kam, wird einmal nacheinander nachgeholt (KI-Runde 10.10.2026:
  // Bei sechs Abrufen gleichzeitig fehlte einem Betrieb die Kontaktseite,
  // und der Bericht sagte dann „kein Formular“).
  for (let i = 0; i < ziele.length; i++) {
    let r = geholt[i];
    if (r.status === 'rejected' && frist(ZEIT_SEITE_MS) > 3000) {
      await new Promise((w) => setTimeout(w, 500));
      [r] = await Promise.allSettled([holen(ziele[i].url, frist(ZEIT_SEITE_MS), true, zaehler)]);
    }
    if (r.status === 'fulfilled' && (/html/i.test(r.value.typ) || /<html/i.test(r.value.text))) {
      seiten.push(seiteAuswerten(r.value, ziele[i].art, s));
    } else {
      const grund = r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'Fehler') : 'keine Website';
      s.nichtGelesen.push({ url: ziele[i].url.href, art: ziele[i].art, grund });
    }
  }

  await linksPruefen(alleVerweise, basis, new Set(seiten.map((x) => x.url.replace(/\/+$/, ''))), s, erlaubt, bis);

  const startWoerter = seiten[0].woerter + seiten.filter((x) => x.art === 'rahmen').reduce((n, x) => n + x.woerter, 0);
  const skripte = (startSeite.text.match(/<script\b/gi) ?? []).length;
  s.ohneJavaScriptLeer = startWoerter < 60 && (skripte >= 3 || /<div[^>]+id=["'](root|app|__next|___gatsby)["']/i.test(startSeite.text));
  s.noindex = seiten[0].noindex;
  // Ein einzelner Abbruch kann auch an unserer Leitung liegen. Erst ab zwei
  // Abbrüchen gilt der Server als wackelig.
  s.wackelig = zaehler.wiederholt >= 2;
  s.seiten = seiten.map((x) => ({ url: x.url, art: x.art, woerter: x.woerter }));
  return { signale: s, seiten };
}

/** Nur für muster.test.ts. */
export const fuerTests = { VORLAGENREST, WOCHENTAG, UHRZEIT_SPANNE, PLZ_ORT, HAUSNUMMER_AM_ENDE, ZEIT_FREI, ZEIT_ZUSAMMENHANG, KEIN_PREIS, robotsSperrt, robotsGruppen, robotsErlaubt, robotsAuswerten, EIGENE_NAMEN, zuText };

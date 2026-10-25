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
// höchstens 4 Weiterleitungen, 8 Sekunden und 3 MB je Seite.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { lookup, Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch, type RequestInit } from 'undici';

// Wer den Check selbst betreibt, setzt eine eigene Kennung mit Kontakt
// (KI_CHECK_KENNUNG), damit Betreiber geprüfter Seiten wissen, wer anfragt.
// Online auf galini-studio.de heißt er „GaliniStudio-KICheck“. Gelesen wird
// erst beim Abruf, damit ein Programm, das diese Datei einbindet, die
// Variable noch setzen kann.
const kennung = () => process.env.KI_CHECK_KENNUNG ?? 'Mozilla/5.0 (compatible; KI-Check/0.1)';
// So heißen wir in einer robots.txt (Produktname aus der Kennung, ohne Groß-/Kleinschreibung).
const eigeneNamen = () => [...new Set([(kennung().match(/compatible;\s*([\w.-]+)\//i)?.[1] ?? 'ki-check').toLowerCase(), 'ki-check'])];
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
  /**
   * Seit 24.10.2026, „Vertrauen“ ohne KI. bewertungen: Links zu
   * Bewertungsportalen (Text: Portal und Adresse). sterne: AggregateRating in
   * schema.org. nachweise: Meisterbetrieb, Innung, Zertifikat im Text (nicht
   * im Impressum, dort steht die Kammer bei jedem Handwerker). vertrauensHinweise:
   * „seit 1987“, Referenzen, Kundenstimmen als Überschrift oder Link.
   */
  bewertungen: Beleg[];
  sterne?: boolean;
  nachweise: Beleg[];
  vertrauensHinweise: Beleg[];
  /** Seit 24.10.2026: Bilder auf allen gelesenen Seiten. stock: Dateien von Bildagenturen (Adresse oder Dateiname). */
  bilder: { gesamt: number; ohneAlt: number; stockZahl: number; stock: Beleg[] };
  /**
   * Seit 24.10.2026, „Passt alles zusammen?“. schemaWerte: Telefon, PLZ und
   * Uhrzeiten („8:00“) aus schema.org. nummernKerne: letzte sieben Ziffern
   * jeder Nummer auf der Seite (tel-Links und Text). plzAufSeite: PLZ vor
   * einem Ort im Text. falscheTelLinks: Links, die eine andere Nummer zeigen,
   * als sie wählen.
   */
  schemaWerte: { telefone: string[]; plz: string[]; zeiten: string[] };
  nummernKerne: string[];
  plzAufSeite: string[];
  falscheTelLinks: Beleg[];
  /** Seit 24.10.2026: neueste Meldung (ISO-Datum) aus <time> oder einer Liste unter „Aktuelles“, „News“, „Termine“. */
  neuesteMeldung?: string;
  /**
   * Seit 24.10.2026: Postfach zur E-Mail-Adresse auf eigener Domain. mx:
   * true = MX-Eintrag da, false = keiner (auch Null-MX oder Domain gibt es
   * nicht). Kam keine Antwort, fehlt das Feld: Das kann an der Leitung liegen.
   */
  postfach?: { adresse: string; domain: string; mx: boolean };
  /** Seit 24.10.2026: Alle E-Mail-Adressen laufen über einen Freemailer (web.de, gmx …). */
  freemail?: string;
  /**
   * Seit 24.10.2026: Baukasten der Startseite (Wix, Jimdo …). Dort erscheinen
   * Formulare oft erst per JavaScript; „kein Formular“ wäre dann ein falscher
   * Vorwurf. jsFormulare: Formular-Dienste, die per Skript geladen werden.
   */
  baukasten?: string;
  jsFormulare: Beleg[];
  /** Seit 24.10.2026: Unterseiten, die erst über die Sitemap gefunden wurden (kein Link auf der Startseite). */
  ausSitemap?: Art[];
  /** titel seit 24.10.2026, für „alle Seiten heißen gleich“. */
  seiten: { url: string; art: Art; woerter: number; titel?: string }[];
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
  /** Seit 22.10.2026 (SEO-Grundlagen): Sitemap in der robots.txt oder unter /sitemap.xml. Fehlt, wenn nicht geprüft. */
  sitemap?: boolean;
  /** Seit 22.10.2026: Die Startseite hat eine Hauptüberschrift (<h1>) mit Text. */
  hauptueberschrift?: boolean;
  /** So steht die Startseite in Google: Titel und Beschreibung (meta description). */
  google: { titel?: string; beschreibung?: string };
  /** Seit 24.10.2026: Vorschau beim Teilen (WhatsApp, Facebook) aus og:title, og:description, og:image der Startseite. */
  vorschau?: { titel?: string; beschreibung?: string; bild?: string };
  /**
   * Seit 24.10.2026: Handy-Einstellung genauer. viewport ist der Inhalt des
   * Tags, festeBreite heißt width=<Zahl> statt device-width, zoomGesperrt
   * heißt user-scalable=no oder maximum-scale bis 1. bytes ist der Quelltext
   * der Startseite (ohne Bilder), skripte die eingebundenen Skriptdateien.
   */
  handy?: { viewport: string; festeBreite: boolean; zoomGesperrt: boolean; bytes: number; skripte: number };
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

/** IPv6 als acht Zahlen, auch mit „::“ und IPv4-Schwanz („::ffff:1.2.3.4“). */
function ipv6Teile(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, '');
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number);
    s = s.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [vorn, hinten] = s.split('::');
  const links = vorn ? vorn.split(':') : [];
  const rechts = hinten ? hinten.split(':') : [];
  const fehlen = s.includes('::') ? 8 - links.length - rechts.length : 0;
  if (fehlen < 0) return null;
  const teile = [...links, ...Array(fehlen).fill('0'), ...rechts].map((h) => parseInt(h, 16));
  return teile.length === 8 && teile.every((n) => n >= 0 && n <= 0xffff) ? teile : null;
}

const alsIpv4 = (hoch: number, tief: number) => `${hoch >> 8}.${hoch & 255}.${tief >> 8}.${tief & 255}`;

// Bis 18.10.2026 kam „[::ffff:7f00:1]“ (= 127.0.0.1 in Hex-Schreibweise,
// so schreibt Node jede gemappte Adresse um) durch. Jetzt wird jede
// IPv4 geprüft, die in einer IPv6 steckt.
export function ipIntern(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Intern(ip);
  const t = ipv6Teile(ip);
  if (!t) return true;
  const nullen = (bis: number) => t.slice(0, bis).every((n) => n === 0);
  // ::ffff:a.b.c.d (gemappt), ::a.b.c.d (alt, auch :: und ::1), 64:ff9b::a.b.c.d (NAT64)
  if ((nullen(5) && t[5] === 0xffff) || nullen(6) || (t[0] === 0x64 && t[1] === 0xff9b && t.slice(2, 6).every((n) => n === 0))) {
    return ipv4Intern(alsIpv4(t[6], t[7]));
  }
  if (t[0] === 0x2002) return ipv4Intern(alsIpv4(t[1], t[2])); // 6to4
  return (
    (t[0] & 0xfe00) === 0xfc00 || // fc00::/7, privat
    (t[0] & 0xffc0) === 0xfe80 || // fe80::/10, nur im eigenen Netz
    (t[0] & 0xffc0) === 0xfec0 || // fec0::/10, alt
    t[0] >> 8 === 0xff || // ff00::/8, Multicast
    (t[0] === 0x64 && t[1] === 0xff9b) || // 64:ff9b:1::/48, NAT64 im eigenen Netz
    (t[0] === 0x2001 && (t[1] === 0 || t[1] === 0xdb8)) || // Teredo, Dokumentation
    (t[0] === 0x100 && nullen(4))
  );
}

// Prüfen und Verbinden müssen dieselbe Adresse benutzen. Sonst kann ein Name
// bei der Prüfung auf eine öffentliche IP zeigen und eine Sekunde später auf
// 127.0.0.1 (DNS-Rebinding). Deshalb prüft die Verbindung selbst noch einmal.
function sichererLookup(
  host: string,
  optionen: LookupOptions,
  fertig: (fehler: Error | null, adresse: string | LookupAddress[], familie?: number) => void,
) {
  dnsLookup(host, { ...optionen, all: true, verbatim: true }, (fehler, adressen) => {
    if (fehler) return fertig(fehler, '');
    if (!adressen.length || adressen.some((a) => ipIntern(a.address))) return fertig(new Error('nicht_erlaubt'), '');
    if (optionen.all) fertig(null, adressen);
    else fertig(null, adressen[0].address, adressen[0].family);
  });
}

const VERBINDUNG = new Agent({ connect: { lookup: sichererLookup } });
export const abrufen = (url: URL, optionen: Omit<RequestInit, 'dispatcher'>) => fetch(url, { ...optionen, dispatcher: VERBINDUNG });

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
    const anfrage = () => abrufen(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(300, ende - Date.now())),
      headers: {
        'user-agent': kennung(),
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
        'accept-language': 'de-DE,de;q=0.9,pl;q=0.7,en;q=0.5',
      },
    });
    // Ein Abbruch der Verbindung wird einmal wiederholt (Testlauf 09.10.2026:
    // ein Server setzte jede zweite Verbindung zurück, egal mit welcher Kennung).
    let antwort: Awaited<ReturnType<typeof abrufen>>;
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
    const istHtml = /html/i.test(typ) || /<html/i.test(text);
    if (istHtml) text = entschaerfen(text);
    const weiter = istHtml ? metaWeiterleitung(text, url) : null;
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

const codepunkt = (n: number) => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\uFFFD');

function zeichenLoesen(s: string): string {
  return s
    // Über 0x10FFFF warf fromCodePoint, und der Check endete mit Fehler 500 (Sicherheitsprüfung 24.10.2026, H1).
    .replace(/&#x([0-9a-f]{1,8});/gi, (_, h) => codepunkt(parseInt(h, 16)))
    .replace(/&#(\d{1,10});/g, (_, d) => codepunkt(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ZEICHEN[n] ?? m);
}

function attribute(tag: string): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    werte[m[1].toLowerCase()] = zeichenLoesen(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return werte;
}

// Eine präparierte Seite (z. B. 3 MB „<a>“ ohne „</a>“) ließ die Suchmuster
// unten minutenlang laufen (Sicherheitsprüfung 18.10.2026). Deshalb wird das
// HTML vorher in einem Durchgang aufgeräumt: „<“ ohne eigenes „>“ wird zu
// &lt;, überlange Tags fallen weg, ebenso öffnende Tags ohne späteres
// Gegenstück, und ein offenes <script>, <style> oder <!-- schneidet den Rest
// ab. Danach findet jedes Suchmuster sein Ende in einem Schritt. Jedes Tag,
// das unten als Paar gesucht wird, muss hier stehen; „time“ fehlte bis zur
// Sicherheitsprüfung vom 24.10.2026 (Fund 1). Der Test in
// werkzeug/ki-check-regeln.test.mts gleicht das ab.
const PAARE = ['a', 'form', 'noscript', 'svg', 'template', 'head', 'title', 'legend', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'time'];
const ROHTEXT = ['script', 'style'];
const HOECHSTENS_TAG = 4000;

export function entschaerfen(html: string): string {
  const klein = html.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  const letzterSchluss = new Map(PAARE.map((n) => [n, klein.lastIndexOf(`</${n}>`)]));
  const teile: string[] = [];
  let kopiertBis = 0;
  let gt = -1;
  let i = klein.indexOf('<');
  while (i !== -1) {
    if (klein.startsWith('<!--', i)) {
      const ende = klein.indexOf('-->', i + 4);
      if (ende === -1) break;
      i = klein.indexOf('<', ende + 3);
      continue;
    }
    if (gt < i) {
      gt = klein.indexOf('>', i);
      if (gt === -1) gt = Infinity;
    }
    const naechstes = klein.indexOf('<', i + 1);
    if (gt === Infinity || (naechstes !== -1 && gt > naechstes)) {
      teile.push(html.slice(kopiertBis, i), '&lt;');
      kopiertBis = i + 1;
    } else if (gt - i > HOECHSTENS_TAG) {
      teile.push(html.slice(kopiertBis, i), ' ');
      kopiertBis = gt + 1;
    } else {
      const name = /^<([a-z][a-z0-9]*)/.exec(klein.slice(i, i + 12))?.[1];
      if (name && ROHTEXT.includes(name)) {
        const ende = klein.indexOf(`</${name}`, gt + 1);
        if (ende === -1) break;
        i = ende;
        continue;
      }
      if (name && PAARE.includes(name) && letzterSchluss.get(name)! < i) {
        teile.push(html.slice(kopiertBis, i), ' ');
        kopiertBis = gt + 1;
      }
    }
    i = naechstes;
  }
  teile.push(html.slice(kopiertBis, i === -1 ? html.length : i));
  return teile.join('');
}

// Auch der Text bekommt Grenzen: Die Muster für Zeiten, Preise und Nummern
// laufen je Zeile, bei einer 3 MB langen Zeile aus Ziffern also ewig.
const HOECHSTENS_WORT = 200;
const HOECHSTENS_ZEILE = 1000;
const HOECHSTENS_TEXT = 200_000;

function zeileTeilen(zeile: string): string[] {
  const z = zeile.replace(new RegExp(`\\S{${HOECHSTENS_WORT + 1},}`, 'g'), (w) => w.slice(0, HOECHSTENS_WORT));
  const teile: string[] = [];
  let rest = z;
  while (rest.length > HOECHSTENS_ZEILE) {
    const schnitt = rest.lastIndexOf(' ', HOECHSTENS_ZEILE);
    const bei = schnitt > HOECHSTENS_ZEILE / 2 ? schnitt : HOECHSTENS_ZEILE;
    teile.push(rest.slice(0, bei).trim());
    rest = rest.slice(bei).trim();
  }
  if (rest) teile.push(rest);
  return teile;
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
    .flatMap(zeileTeilen)
    .join('\n')
    .slice(0, HOECHSTENS_TEXT);
}

const woerterZaehlen = (text: string) => text.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;

interface Verweis {
  url: URL;
  text: string;
  href: string;
}

/** decodeURIComponent wirft bei kaputter Prozent-Kodierung („tel:%“); dann eben der Rohtext (Nachprüfung 24.10.2026). */
function dekodiert(t: string): string {
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

function verweise(roh: string, basis: URL): Verweis[] {
  const liste: Verweis[] = [];
  const html = entschaerfen(roh);
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

/** Alle <meta> mit name oder property, Schlüssel klein. Der erste Wert gewinnt, leere zählen nicht. */
function metaWerte(html: string): Map<string, string> {
  const werte = new Map<string, string>();
  for (const m of ohneBallastKopf(html).matchAll(/<meta\b[^>]*>/gi)) {
    const a = attribute(m[0]);
    const schluessel = (a.name ?? a.property ?? '').toLowerCase();
    const inhalt = (a.content ?? '').replace(/\s+/g, ' ').trim();
    if (schluessel && inhalt && !werte.has(schluessel)) werte.set(schluessel, inhalt.slice(0, 500));
  }
  return werte;
}

// Platzhalter, die beim Einrichten einer Vorlage stehen geblieben sind
// (KI-Runde 10.10.2026: „Have any Questions? +01 123 444 555 / info@company.com“).
const VORLAGENREST = /lorem ipsum|dolor sit amet|consectetur adipiscing|info@company\.com|@example\.(?:com|org|net|de)\b|\.example\b|your company|ihr firmenname|ihre firma gmbh|musterstra(?:ß|ss)e \d|max mustermann|erika mustermann|\+01 123|123[ -]?456[ -]?789|have any questions\?|just another wordpress site|ein weiterer wordpress-?(?:blog|website)|hello world!|hallo welt!|sample page|platzhaltertext|dummy text|blindtext|\b0{3} ?0{2} ?0{2}\b/i;

const gleicherHost = (a: URL, b: URL) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

// Welche Unterseite ein Kunde zuerst anklicken würde. Reihenfolge = Vorrang.
const ZIELE: [Art, RegExp][] = [
  ['kontakt', /kontakt|contact|anfahrt|standort|so-finden|erreichen|kontakt-?formular/i],
  ['preise', /preis|kosten|tarif|honorar|gebühr|gebuehr|price|cennik/i],
  ['termin', /termin|buchen|booking|reservier|online-?buchung|rezerwacj|umow-wizyt/i],
  ['leistungen', /leistung|service|angebot|produkt|was-wir|unsere-arbeit|sortiment|speisekarte|men(u|ü)\b|uslug|usług|oferta/i],
  ['zeiten', /öffnungszeit|oeffnungszeit|sprechzeit|geschäftszeit|geschaeftszeit|godziny/i],
  ['impressum', /impressum|imprint/i],
];
const NICHT_FOLGEN = /datenschutz|privacy|cookie|agb|widerruf|login|anmelden|warenkorb|cart|wp-admin|feed|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i;

function unterseitenWaehlen(alle: Verweis[], basis: URL, schon: Set<string>, ohneArten: Art[] = [], hoechstens = HOECHSTENS_UNTERSEITEN): { url: URL; art: Art }[] {
  const gewaehlt: { url: URL; art: Art }[] = [];
  // Wer eine Unterseite eingibt (z. B. /beispiele/dachdecker/), meint nur
  // diesen Teil, nicht die ganze Domain.
  const praefix = basis.pathname.replace(/[^/]*$/, '');
  for (const [art, muster] of ZIELE) {
    if (gewaehlt.length >= hoechstens) break;
    if (ohneArten.includes(art)) continue;
    for (const v of alle) {
      if (v.url.protocol !== 'https:' && v.url.protocol !== 'http:') continue;
      if (!gleicherHost(v.url, basis) || !v.url.pathname.startsWith(praefix)) continue;
      const ziel = new URL(v.url.href);
      ziel.hash = '';
      const schluessel = ziel.href.replace(/\/+$/, '');
      if (schon.has(schluessel) || NICHT_FOLGEN.test(ziel.pathname)) continue;
      if (!muster.test(dekodiert(ziel.pathname)) && !muster.test(v.text)) continue;
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
// Polnisch seit 24.10.2026: „pon.–pt.“, „poniedziałek – piątek“, „codziennie“.
// \b greift vor „ś“ nicht, deshalb eigene Grenzen aus Buchstaben.
const PL_BUCHSTABE = 'a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ';
const gross = (w: string) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`;
const TAG_PL_LANG = `(?:${['poniedziałek', 'poniedziałku', 'wtorek', 'wtorku', 'środa', 'środy', 'czwartek', 'czwartku', 'piątek', 'piątku', 'sobota', 'soboty', 'niedziela', 'niedzieli', 'codziennie'].map(gross).join('|')})`;
const TAG_PL_KURZ = `(?:${['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'niedz', 'nd'].map(gross).join('|')})\\.?`;
const WOCHENTAG = new RegExp(
  `${TAG_LANG}|\\b${TAG_KURZ}\\s*(?:–|-|—|bis|und|&|,)\\s*${TAG_KURZ}(?![\\wäöü])|\\b${TAG_KURZ}:?\\s+\\d{1,2}(?:[:.]\\d{2}|\\s*(?:–|-|—|bis)\\s*\\d{1,2}\\s*(?:[:.]\\d{2}|[Uu]hr))` +
  `|(?<![${PL_BUCHSTABE}])${TAG_PL_LANG}(?![${PL_BUCHSTABE}])|(?<![${PL_BUCHSTABE}])${TAG_PL_KURZ}\\s*(?:–|-|—|do|,)\\s*${TAG_PL_KURZ}(?![${PL_BUCHSTABE}])` +
  `|(?<![${PL_BUCHSTABE}])${TAG_PL_KURZ}:?\\s+\\d{1,2}[:.]\\d{2}`,
);
// Eine Uhrzeitspanne braucht Minuten oder „Uhr“, sonst ist „5 bis 16 €“ auch eine.
const UHRZEIT_SPANNE = /\bgodz\.?\s*\d{1,2}(?:[:.]\d{2})?\s*(?:–|-|—|do)\s*\d{1,2}|\b\d{1,2}(?:[:.]\d{2}\s*(?:uhr)?|\s*uhr)\s*(?:–|-|—|bis|do)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:uhr)?(?!\s*(?:€|eur|%|jahre|monat|tag|stück|seiten))|\b\d{1,2}\s*(?:–|-|—|bis)\s*\d{1,2}(?:[:.]\d{2})\s*(?:uhr)?|\b\d{1,2}\s*(?:–|-|—|bis)\s*\d{1,2}\s*uhr\b/i;
const ZEITEN_TITEL = /öffnungszeit|oeffnungszeit|geschäftszeit|geschaeftszeit|bürozeit|buerozeit|sprechzeit|erreichbar(keit)?|godziny otwarcia|godziny pracy|godziny przyjęć|czynne/i;
// Seit 24.10.2026 auch Złoty und Franken.
const BETRAG = /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2}|,-|,–)?\s*(?:€|eur\b|euro\b|zł(?![a-ząćęłńóśźż])|pln\b|chf\b)|€\s*\d|\b(?:chf|pln)\s*\d/i;
const KEIN_PREIS = /stammkapital|haftung|bußgeld|bussgeld|streitwert|umsatzsteuer|ust-?id|handelsregister|förder|foerder|zuschuss|bafa|kfw|gewinnspiel|spende|gutschein im wert|cookie|bis zu \d+ ?% |rabatt-?code|überweis|ueberweis|iban/i;
// Zeiten ohne Wochentag, nur mit Zusammenhang „anrufen, erreichen“ in der
// Zeile oder der Überschrift davor (Testlauf 09.10.2026, galini-studio.de).
const ZEIT_FREI = /\b(?:morgens|vormittags|mittags|nachmittags|abends)\b[^.]*\b(?:uhr|zwischen|bis|ab)\b|\b(?:ab|bis|zwischen|nach|vor)\s+\d{1,2}(?:[:.]\d{2})?\s*uhr\b|\bzwischen\s+(?:sieben|acht|neun|zehn|elf|zwölf|\d{1,2})\s+und\s+(?:acht|neun|zehn|elf|zwölf|\d{1,2})\b|\b(?:innerhalb|binnen)\s+(?:von\s+)?(?:\d{1,3}|zwei|drei|vier)\s+(?:stunden|werktag(?:en)?|tag(?:en)?)\b|\bam\s+selben\s+tag\b|\bw\s+ciągu\s+\d{1,3}\s+godzin/i;
const ZEIT_ZUSAMMENHANG = /anruf|rufe|rufen|rückruf|zurückruf|erreich|telefon|melde|antwort|sprechstunde|büro|buero|besuch/i;
const PREIS_HINWEIS = /kostenlos|kostenfrei|gratis|unverbindlich(e|es)? (angebot|kostenvoranschlag|beratung)|festpreis|preis auf anfrage|preise auf anfrage|kostenvoranschlag|bezpłatn[aey]? wycen|darmow[aey]? wycen|cena do uzgodnienia|wycena indywidualna/i;
// Nur „nach Vereinbarung“. „Nach Absprache“ stand im Testlauf bei Preisen.
const NACH_VEREINBARUNG = /nach (telefonischer |vorheriger )?vereinbarung|po (?:wcześniejszym )?(?:umówieniu|uzgodnieniu)/i;
// Nummer mit Hinweis davor („Tel.“, „Oder anrufen:“) oder allein in der Zeile.
// Seit 24.10.2026 auch +48, +43, +41 und polnische Nummern ohne 0 nach „tel.“
// („tel. 600 100 200“, „tel. 65 500 10 20“).
const TELEFON_IM_TEXT = /(?:tel(?:efon)?|fon|phone|mobil|handy|anrufen|ruf(?:en sie)?(?: uns)? an|hotline|notdienst|zentrale|kom\.|komórka|zadzwoń|☎|📞)\.?\s*(?:[:.]|\(.*?\))?\s*((?:\+49|0049|\+4[138]|004[138]|0)[\d\s\/().–-]{6,22}\d|\d{3}[\s-]\d{3}[\s-]\d{3}\b|\d{2}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2}\b)|^\s*((?:\+49|0049|\+4[138]|004[138]|0)\d[\d\s\/().–-]{5,20}\d)\s*$/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
// Anschrift: vom „PLZ Ort“ aus rückwärts. Die Straße steht davor in derselben
// Zeile (nach · , | ;) oder in der Zeile darüber und endet mit einer
// Hausnummer. So zählen auch „Am Bokel 6 b“ oder „Beim alten Flugplatz 6“.
// Seit 24.10.2026 auch Polen („64-100 Leszno“), Österreich und Schweiz (vier
// Ziffern, nie mit 0 vorn) und polnische Straßen („ul. Długa 5/3“). Vier
// Ziffern allein wären oft eine Jahreszahl; sie zählen nur mit Straße davor.
const PLZ_ORT = /(?<![\d+/-]\s?)\b(?:(?:D|A|CH|PL)-\s?)?(\d{5}|\d{2}-\d{3}|[1-9]\d{3})\s+([A-ZÄÖÜŁŚŻŹĆŃÓĘĄ][\wäöüßąćęłńóśźż.-]+(?:[ -](?:\(?[A-ZÄÖÜŁŚŻŹĆŃÓĘĄ][\wäöüßąćęłńóśźż.)-]+))*)/;
const HAUSNUMMER_AM_ENDE = /^(?:(?:ul|al|pl|os)\.\s*)?[A-ZÄÖÜŁŚŻŹĆŃÓĘĄ][\wäöüßÄÖÜąćęłńóśźżŁŚŻŹĆŃÓĘĄ.' -]{2,55}?\s\d{1,4}(?:\s?[a-zA-Z](?![\wäöü])|\s?[-/]\s?\d{1,4})?$/;
const KEINE_STRASSE = /^(tel|fax|fon|mobil|handy|ust|steuer|hrb|hra|amtsgericht|postfach|iban|bic|reg|sitz|stand|version|seite)\b/i;

// Vertrauen ohne KI (24.10.2026). Bewertungsportale nach Adresse, mit dem
// Namen, der im Bericht steht.
const BEWERTUNGSPORTALE: [RegExp, string][] = [
  [/(?:\/\/|\.)g\.page\/|search\.google\.com\/local\/(?:write)?reviews?|google\.[a-z.]+\/maps\/.*(?:review|bewertung)|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/search\?.*(?:review|bewertung|lrd=)/i, 'Google-Bewertungen'],
  [/provenexpert\.com/i, 'ProvenExpert'],
  [/trustpilot\.com/i, 'Trustpilot'],
  [/jameda\.de/i, 'Jameda'],
  [/werkenntdenbesten\.de/i, 'wer kennt den BESTEN'],
  [/golocal\.de/i, 'golocal'],
  [/yelp\.[a-z.]+\/biz/i, 'Yelp'],
  [/my-hammer\.de/i, 'MyHammer'],
  [/check24\.de\/profis/i, 'CHECK24 Profis'],
  [/anwalt\.de\/[^/]+\/bewertungen|anwalt\.de\/rechtsanwalt/i, 'anwalt.de'],
  [/trustedshops\.[a-z.]+/i, 'Trusted Shops'],
  [/ekomi\.[a-z.]+/i, 'eKomi'],
  [/houzz\.[a-z.]+/i, 'Houzz'],
  [/tripadvisor\.[a-z.]+/i, 'Tripadvisor'],
  [/znanylekarz\.pl/i, 'ZnanyLekarz'],
  [/oferteo\.pl/i, 'Oferteo'],
  [/opineo\.pl/i, 'Opineo'],
  [/fixly\.pl/i, 'Fixly'],
];
// Bewertungen als eingebundenes Widget (Skript oder Rahmen).
const BEWERTUNGS_WIDGET = /provenexpert\.(?:com|net)|widget\.trustpilot|trustindex\.io|elfsight\.com|reviews\.io|ekomi|trustedshops|judge\.me|embedsocial/i;
const NACHWEIS = /meisterbetrieb|meister(?:in)? im [\wäöü-]+handwerk|innungs(?:fach)?betrieb|mitglied (?:der|im|in der) [\wäöüß -]{0,30}(?:innung|handwerkskammer|verband|kammer)|zertifizierte[rs]? fachbetrieb|tüv[- ]?(?:geprüft|zertifiziert)|din en iso 9001|iso[- ]9001|zakład mistrzowski|członkiem? cechu|mistrz(?:em)? (?:w )?(?:rzemiośle|zawodzie)/i;
const VERTRAUENS_HINWEIS = /\b(?:seit|since|od)\s+(?:19[3-9]\d|20[0-2]\d)\b|gegründet\s+(?:19|20)\d{2}|seit über \d+ jahren|\d+ jahre erfahrung/i;
// Diese Wörter nur als Überschrift oder Menüpunkt (kurze Zeile). Im Satz
// stand auf galini-studio.de „Platz für Referenzen, Team …“ (Probe 24.10.2026).
const VERTRAUENS_TITEL = /^(?:##\s*|•\s*)?(?:unsere\s+|meine\s+|nasze\s+)?(?:referenzen|kundenstimmen|kundenmeinungen|das sagen unsere kunden|bewertungen|projekte|arbeiten|galerie|realizacje|opinie(?: klientów)?|referencje|galeria)\b.{0,25}$/i;
// Bildagenturen: Adresse oder typischer Dateiname.
const STOCKBILD = /images\.unsplash\.com|plus\.unsplash\.com|images\.pexels\.com|cdn\.pixabay\.com|pixabay\.com\/get\/|shutterstock\.com|istockphoto\.com|gettyimages\.|stock\.adobe\.com|ftcdn\.net|depositphotos|123rf\.com|dreamstime\.com|img\.freepik\.com|(?:^|[/_-])(?:shutterstock|istock|adobestock|depositphotos|pexels-photo|unsplash|gettyimages|fotolia)[_-]?\d/i;

// Baukästen (24.10.2026), erkannt an Adressen ihrer Dateien oder am
// generator-Tag. Reihenfolge = Vorrang.
const BAUKAESTEN: [RegExp, string][] = [
  [/static\.wixstatic\.com|parastorage\.com|wix\.com website builder/i, 'Wix'],
  [/jimstatic\.com|jimdosite\.com|jimdo-dolphin|\bjimdo\b/i, 'Jimdo'],
  [/static1\.squarespace\.com|squarespace\.com|\bsquarespace\b/i, 'Squarespace'],
  [/webflow\.(?:js|com)|data-wf-site/i, 'Webflow'],
  [/editmysite\.com|\bweebly\b/i, 'Weebly'],
  [/cm4all|cm-templates/i, 'IONOS oder STRATO (CM4all)'],
  [/img1\.wsimg\.com|godaddy website builder/i, 'GoDaddy'],
  [/multiscreensite\.com|irp-cdn\.|\bduda\b/i, 'Duda'],
  [/site123\.(?:me|com)|\bsite123\b/i, 'SITE123'],
  [/cdn\.shopify\.com/i, 'Shopify'],
];
// Formular-Dienste, die erst per Skript ein Formular in die Seite setzen.
const JS_FORMULARE: [RegExp, string][] = [
  [/js\.hsforms\.net|hsforms\.com/i, 'HubSpot'],
  [/embed\.typeform\.com/i, 'Typeform'],
  [/jotform\.(?:com|eu)\/(?:jsform|\d)/i, 'Jotform'],
  [/tally\.so\/widgets/i, 'Tally'],
  [/123formbuilder\.com/i, '123FormBuilder'],
  [/cognitoforms\.com/i, 'Cognito Forms'],
  [/paperform\.co/i, 'Paperform'],
  [/formstack\.com/i, 'Formstack'],
  [/forms\.zoho\.(?:com|eu)|zohopublic/i, 'Zoho Forms'],
];

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
    bewertungen: [],
    nachweise: [],
    vertrauensHinweise: [],
    bilder: { gesamt: 0, ohneAlt: 0, stockZahl: 0, stock: [] },
    schemaWerte: { telefone: [], plz: [], zeiten: [] },
    nummernKerne: [],
    plzAufSeite: [],
    falscheTelLinks: [],
    jsFormulare: [],
  };
}

// ── Abgleich und Datum (24.10.2026) ─────────────────────────────────────

/** Letzte sieben Ziffern, damit „+49 4442 …“ und „04442 …“ dieselbe Nummer sind. */
export const nummerKern = (s: string) => s.replace(/\D/g, '').slice(-7);
const merken = (liste: string[], wert: string, hoechstens = 30) => {
  if (wert && !liste.includes(wert) && liste.length < hoechstens) liste.push(wert);
};

/** Uhrzeiten als „8:00“: aus „08:00“, „8.30“, „8 Uhr“, „08:00:00“. */
export function uhrzeiten(text: string): string[] {
  const zeiten: string[] = [];
  for (const m of text.matchAll(/\b([01]?\d|2[0-3])(?:[:.]([0-5]\d)(?::\d{2})?|\s*uhr\b)/gi)) merken(zeiten, `${Number(m[1])}:${m[2] ?? '00'}`);
  return zeiten;
}

const MONATE_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const MONATE_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const DATUM = new RegExp(
  `\\b(\\d{1,2})\\.\\s?(\\d{1,2})\\.\\s?((?:19|20)\\d{2})\\b|\\b((?:19|20)\\d{2})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})\\.?\\s+(${[...MONATE_DE, ...MONATE_PL].join('|')})\\s+((?:19|20)\\d{2})\\b`,
  'gi',
);
// Überschriften, unter denen Meldungen mit Datum stehen.
const MELDUNGEN_TITEL = /^##\s*.{0,20}(?:aktuell|neuigkeit|news|blog|termine|veranstaltung|presse|aktualności|wydarzenia|ogłoszenia)/i;

/** Alle Daten in einem Text als ISO-Datum; unmögliche fallen weg. */
export function datenIn(text: string): string[] {
  const daten: string[] = [];
  for (const m of text.matchAll(DATUM)) {
    const [tag, monat, jahr] = m[1] ? [m[1], m[2], m[3]] : m[4] ? [m[6], m[5], m[4]]
      : [m[7], String((MONATE_DE.indexOf(m[8].toLowerCase()) + 1) || MONATE_PL.indexOf(m[8].toLowerCase()) + 1), m[9]];
    const d = new Date(Date.UTC(Number(jahr), Number(monat) - 1, Number(tag)));
    if (Number(monat) >= 1 && Number(monat) <= 12 && d.getUTCDate() === Number(tag)) daten.push(d.toISOString().slice(0, 10));
  }
  return daten;
}

/** Neuestes Datum übernehmen. Termine in der Zukunft (bis ein Jahr) zählen als heute: Wer sie einträgt, pflegt die Seite. */
function meldungMerken(s: Signale, iso: string) {
  const heute = new Date().toISOString().slice(0, 10);
  const inEinemJahr = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  if (iso > inEinemJahr) return;
  const wert = iso > heute ? heute : iso;
  if (!s.neuesteMeldung || wert > s.neuesteMeldung) s.neuesteMeldung = wert;
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
    if (liste.includes('AggregateRating') || (o.aggregateRating && typeof o.aggregateRating === 'object')) s.sterne = true;
    if (liste.some((t) => typeof t === 'string' && ortsbetrieb.test(t))) {
      s.strukturiert.ortsbetrieb = true;
      if (o.telephone) s.strukturiert.mitTelefon = true;
      if (o.address) s.strukturiert.mitAnschrift = true;
      if (o.openingHours || o.openingHoursSpecification) s.strukturiert.mitZeiten = true;
      // Werte für den Abgleich mit der Seite (24.10.2026).
      const w = s.schemaWerte;
      for (const t of [o.telephone].flat()) if (typeof t === 'string' && nummerKern(t).length === 7) merken(w.telefone, t.slice(0, 40), 5);
      for (const a of [o.address].flat()) {
        const plz = a && typeof a === 'object' ? (a as Record<string, unknown>).postalCode : undefined;
        if (typeof plz === 'string' || typeof plz === 'number') merken(w.plz, String(plz).trim().slice(0, 10), 5);
      }
      for (const z of [o.openingHours].flat()) if (typeof z === 'string') uhrzeiten(z).forEach((u) => merken(w.zeiten, u));
      for (const spez of [o.openingHoursSpecification].flat()) {
        if (!spez || typeof spez !== 'object') continue;
        const { opens, closes } = spez as Record<string, unknown>;
        for (const u of [opens, closes]) if (typeof u === 'string') uhrzeiten(u).forEach((x) => merken(w.zeiten, x));
      }
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
    if (m[1] === 'AggregateRating') s.sterne = true;
    if (ortsbetrieb.test(m[1])) s.strukturiert.ortsbetrieb = true;
  }
  s.strukturiert.typen = [...typen].slice(0, 12);
}

function seiteAuswerten(geholt: Geholt, art: Art, s: Signale): Seite {
  // Immer entschärfen, auch wenn holen() es schon getan hat: Rahmen kamen bis
  // zur Nachprüfung vom 24.10.2026 (N1) als text/plain ungefiltert hier an.
  // Ein zweiter Durchgang ist linear und ändert entschärften Text nicht.
  const html = entschaerfen(geholt.text);
  const url = geholt.url.href;
  const text = zuText(html);
  const titel = zeichenLoesen(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim() || undefined;
  const noindex = /<meta\b[^>]*name=["']?robots["']?[^>]*content=["'][^"']*noindex/i.test(html) ||
    /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']?robots/i.test(html);

  // Verweise: Telefon, WhatsApp, E-Mail, Buchung, Preislisten
  for (const v of verweise(html, geholt.url)) {
    const h = v.href;
    if (/^tel:/i.test(h)) {
      const gewaehlt = dekodiert(h.slice(4));
      beleg(s.telefonKlickbar, url, gewaehlt + (v.text ? ` („${v.text}“)` : ''));
      merken(s.nummernKerne, nummerKern(gewaehlt));
      // Zeigt der Link eine Nummer, muss es die sein, die er wählt (24.10.2026).
      const gezeigt = /(?:\+|\b0)\d[\d\s\/().–-]{5,20}\d/.exec(v.text)?.[0];
      if (gezeigt && nummerKern(gezeigt).length === 7 && nummerKern(gewaehlt).length === 7 && nummerKern(gezeigt) !== nummerKern(gewaehlt)) {
        beleg(s.falscheTelLinks, url, `${gezeigt} → ${gewaehlt}`, 3);
      }
    }
    else if (/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|chat\.whatsapp\.com/i.test(h)) beleg(s.whatsapp, url, v.text || h);
    else if (/^mailto:/i.test(h)) beleg(s.emailKlickbar, url, dekodiert(h.slice(7).split('?')[0]));
    if (BUCHUNGSDIENSTE.test(h)) beleg(s.buchung, url, `${v.text ? `„${v.text}“, ` : ''}${v.url.hostname}${v.url.pathname}`.slice(0, 140));
    if (/\.pdf$/i.test(v.url.pathname) && /preis|tarif|kosten|karte|liste|cennik/i.test(v.text + ' ' + v.url.pathname)) {
      beleg(s.preisDateien, url, `${v.text ? `„${v.text}“, ` : ''}${dekodiert(v.url.pathname.split('/').pop() ?? '')}`);
    }
    // Nur der Anfang der Adresse: Mit „.*“ lief das Muster auf 4000 Zeichen
    // langen Links spürbar (Sicherheitsprüfung 24.10.2026, Fund 2).
    const kopf = v.url.href.slice(0, 300);
    const portal = BEWERTUNGSPORTALE.find(([muster]) => muster.test(kopf))?.[1];
    if (portal && (v.url.protocol === 'https:' || v.url.protocol === 'http:')) beleg(s.bewertungen, url, `${portal}: ${v.url.hostname.replace(/^www\./, '')}`, 3);
  }
  // Buchungsdienste und Bewertungs-Widgets als Rahmen oder Skript
  for (const m of html.matchAll(/<(iframe|script)\b[^>]*src=["']([^"']+)["']/gi)) {
    if (BUCHUNGSDIENSTE.test(m[2])) beleg(s.buchung, url, m[2].replace(/^https?:\/\//, '').slice(0, 100));
    const widget = BEWERTUNGS_WIDGET.exec(m[2]);
    if (widget) beleg(s.bewertungen, url, `Bewertungs-Widget: ${widget[0].replace(/^widget\./, '')}`, 3);
    const formDienst = m[1].toLowerCase() === 'script' ? JS_FORMULARE.find(([muster]) => muster.test(m[2]))?.[1] : undefined;
    if (formDienst) beleg(s.jsFormulare, url, formDienst, 3);
  }
  // Bilder: wie viele ohne alt (alt="" ist Absicht: Schmuck), wie viele von Bildagenturen.
  for (const m of ohneBallast(html).matchAll(/<img\b[^>]*>/gi)) {
    const a = attribute(m[0]);
    s.bilder.gesamt++;
    // Auch „alt“ ohne Wert zählt (so schreibt es Astro für Schmuckbilder, Probe 24.10.2026).
    if (!/\salt(?:\s*=|[\s/>])/i.test(m[0])) s.bilder.ohneAlt++;
    const quelle = [a.src, a['data-src'], a['data-lazy-src'], a.srcset, a['data-srcset']].filter(Boolean).join(' ');
    const stock = STOCKBILD.exec(quelle);
    if (stock) {
      s.bilder.stockZahl++;
      const datei = (quelle.split(/[\s,]+/).find((q) => STOCKBILD.test(q)) ?? stock[0]).replace(/^https?:\/\//, '').split('?')[0];
      beleg(s.bilder.stock, url, datei.length > 90 ? `…${datei.slice(-88)}` : datei, 5);
    }
  }
  formulareLesen(html, url, s);
  strukturiertLesen(html, s);

  // Datum in <time>: das Attribut, sonst der Text darin (24.10.2026).
  for (const m of ohneBallast(html).matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/gi)) {
    const iso = /^\s*((?:19|20)\d{2}-\d{2}-\d{2})/.exec(attribute(m[1]).datetime ?? '')?.[1];
    for (const d of iso ? [iso] : datenIn(zuText(m[2]))) meldungMerken(s, d);
  }

  // Text Zeile für Zeile
  const zeilen = text.split('\n');
  let nachZeitenTitel = 0;
  let nachMeldungen = 0;
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (ZEITEN_TITEL.test(z)) nachZeitenTitel = 6;
    if (art !== 'impressum' && MELDUNGEN_TITEL.test(z)) nachMeldungen = 20;
    else if (z.startsWith('## ') && nachMeldungen > 0 && nachMeldungen < 15 && !datenIn(zeilen[i + 1] ?? '').length && !datenIn(z).length) nachMeldungen = 0;
    if (nachMeldungen > 0) {
      datenIn(z).forEach((d) => meldungMerken(s, d));
      nachMeldungen--;
    }
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

    if (art !== 'impressum' && NACHWEIS.test(z)) beleg(s.nachweise, url, z, 3, NACHWEIS);
    else if (art !== 'impressum' && (VERTRAUENS_HINWEIS.test(z) || VERTRAUENS_TITEL.test(z))) beleg(s.vertrauensHinweise, url, z, 3, VERTRAUENS_HINWEIS);
    for (const m of z.matchAll(TELEFON_IM_TEXT)) {
      beleg(s.telefonImText, url, m[0], 3);
      merken(s.nummernKerne, nummerKern(m[1] ?? m[2] ?? ''));
    }
    for (const m of z.matchAll(EMAIL)) {
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(m[0]) && !/sentry|wixpress|example\./i.test(m[0])) beleg(s.emailImText, url, m[0], 3);
    }
  }
  // Anschrift: PLZ Ort finden, Straße davor suchen.
  for (let i = 0; i < zeilen.length; i++) {
    const ort = PLZ_ORT.exec(zeilen[i]);
    if (!ort) continue;
    if (ort[1].length !== 4) merken(s.plzAufSeite, ort[1]);
    const davor = zeilen[i].slice(0, ort.index).split(/\s*[·,|;•]\s*|\s{2,}/).map((t) => t.trim()).filter(Boolean);
    const kandidaten = [davor.at(-1), (zeilen[i - 1] ?? '').split(/\s*[·,|;•]\s*/).at(-1)?.trim()];
    const strasse = kandidaten.find((k) => k && HAUSNUMMER_AM_ENDE.test(k) && !KEINE_STRASSE.test(k));
    if (strasse && ort[1].length === 4) merken(s.plzAufSeite, ort[1]);
    if (strasse) beleg(s.anschrift, url, `${strasse}, ${ort[1]} ${ort[2]}`.replace(/\s+/g, ' '), 3);
  }

  // Platzhalter aus Vorlagen, auf jeder Seite.
  for (const z of zeilen) {
    const m = VORLAGENREST.exec(z);
    if (m) beleg(s.vorlagenreste, url, z, 3, VORLAGENREST);
  }
  if (art === 'start' || art === 'rahmen') {
    if (art === 'start') {
      const metas = metaWerte(html);
      const beschreibung = metas.get('description');
      s.google = { titel, beschreibung };
      s.vorschau = { titel: metas.get('og:title'), beschreibung: metas.get('og:description'), bild: metas.get('og:image') ?? metas.get('og:image:url') ?? metas.get('twitter:image') };
      // Baukasten: generator-Tag zuerst, sonst Adressen im Quelltext (nur Tags, nicht der Text der Seite).
      const tags = (html.match(/<(?:script|link|img|meta|div|html|body)\b[^>]*>/gi) ?? []).join(' ').slice(0, 400_000);
      s.baukasten = BAUKAESTEN.find(([muster]) => muster.test(metas.get('generator') ?? ''))?.[1]
        ?? BAUKAESTEN.find(([muster]) => muster.test(tags))?.[1];
      const viewport = metas.get('viewport');
      if (viewport) {
        const maxScale = Number(/maximum-scale\s*=\s*([\d.]+)/i.exec(viewport)?.[1] ?? 'NaN');
        s.handy = {
          viewport: viewport.slice(0, 160),
          festeBreite: /(?:^|[,;\s])width\s*=\s*\d/i.test(viewport),
          zoomGesperrt: /user-scalable\s*=\s*(?:no|0)\b/i.test(viewport) || (Number.isFinite(maxScale) && maxScale <= 1),
          bytes: new TextEncoder().encode(html).length,
          skripte: (html.match(/<script\b[^>]*\ssrc=/gi) ?? []).length,
        };
      }
      // Eine <h1> mit lesbarem Text, nicht nur ein Bild oder leer.
      s.hauptueberschrift = [...ohneBallast(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
        .some((m) => zeichenLoesen(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().length > 1);
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
// (eigene Gruppe, siehe eigeneNamen, sonst „*“), lesen wir sie nicht;
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
// Seit 25.10.2026 ohne regulären Ausdruck: Ein Muster mit vielen „*“ ließ die
// Suche exponentiell lange laufen (10 Sterne, 41 Zeichen: 10,6 s;
// Sicherheitsprüfung 25.10.2026, Fund 2). Jedes Stück wird einmal von links
// weiter gesucht; bei Mustern nur aus Text und „*“ ist das immer richtig.
function regelPasst(muster: string, pfad: string): boolean {
  const amEnde = muster.endsWith('$');
  const teile = (amEnde ? muster.slice(0, -1) : muster).split('*');
  const erstes = teile[0];
  if (!pfad.startsWith(erstes)) return false;
  if (teile.length === 1) return amEnde ? pfad === erstes : true;
  let pos = erstes.length;
  for (let i = 1; i < teile.length - 1; i++) {
    if (!teile[i]) continue;
    const fund = pfad.indexOf(teile[i], pos);
    if (fund < 0) return false;
    pos = fund + teile[i].length;
  }
  const letztes = teile[teile.length - 1];
  if (!amEnde) return pfad.indexOf(letztes, pos) >= 0;
  return pfad.length - letztes.length >= pos && pfad.endsWith(letztes);
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
      const antwort = await abrufen(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(300, ende - Date.now())),
        headers: { 'user-agent': kennung(), accept: 'text/html,*/*;q=0.5' },
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

/** Sitemap unter /sitemap.xml oder /sitemap_index.xml (wenn die robots.txt keine nennt). */
async function sitemapLesen(basis: URL, s: Signale, erlaubt: (u: URL) => boolean) {
  for (const pfad of ['/sitemap.xml', '/sitemap_index.xml']) {
    // Jede Adresse für sich gegen die robots.txt (Sicherheitsprüfung 22.10.2026, H3).
    if (!erlaubt(new URL(pfad, basis))) continue;
    try {
      const { text } = await holen(new URL(pfad, basis), ZEIT_KLEIN_MS);
      if (/<(urlset|sitemapindex)\b/i.test(text.slice(0, 2000))) {
        s.sitemap = true;
        return;
      }
    } catch {
      /* nächste Adresse */
    }
  }
  s.sitemap = false;
}

/**
 * Seit 24.10.2026: Adressen aus der Sitemap, wenn die Startseite nicht zu
 * Kontakt oder Preisen verlinkt (Menü nur per JavaScript, Bild-Links ohne
 * Text). Nur Sitemaps auf derselben Domain, ein Sitemap-Index höchstens
 * zwei Stufen tief, höchstens 500 Adressen. Was nicht kommt, fällt still weg.
 */
async function sitemapAdressen(basis: URL, robots: string, erlaubt: (u: URL) => boolean, frist: () => number): Promise<Verweis[]> {
  const aus = (text: string) => [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => zeichenLoesen(m[1]));
  // [ \t] statt \s: \s* lief über Zeilenumbrüche, viele Leerzeilen machten die
  // Suche quadratisch (Sicherheitsprüfung 25.10.2026, Fund 3).
  const kandidaten = [...robots.matchAll(/^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/gim)].map((m) => m[1]);
  kandidaten.push('/sitemap.xml', '/sitemap_index.xml');
  const offen: URL[] = [];
  for (const k of kandidaten) {
    try {
      const u = new URL(k, basis);
      if (gleicherHost(u, basis) && erlaubt(u) && !offen.some((x) => x.href === u.href)) offen.push(u);
    } catch { /* kaputte Zeile in der robots.txt */ }
  }
  const adressen: Verweis[] = [];
  for (let abrufe = 0; offen.length && abrufe < 4 && adressen.length < 500; abrufe++) {
    if (frist() < 1500) break;
    const u = offen.shift()!;
    let text = '';
    try {
      text = (await holen(u, Math.min(frist(), ZEIT_KLEIN_MS))).text;
    } catch {
      continue;
    }
    const kopf = text.slice(0, 2000);
    if (/<sitemapindex\b/i.test(kopf)) {
      // Unterseiten-Sitemaps zuerst die mit Seiten, nicht Beiträge oder Bilder.
      const kinder = aus(text).map((x) => { try { return new URL(x, u); } catch { return null; } })
        .filter((x): x is URL => !!x && gleicherHost(x, basis) && erlaubt(x))
        .sort((a, b) => Number(/page|seite/i.test(b.pathname)) - Number(/page|seite/i.test(a.pathname)));
      offen.unshift(...kinder.slice(0, 2));
      continue;
    }
    if (!/<urlset\b/i.test(kopf)) continue;
    for (const x of aus(text).slice(0, 500 - adressen.length)) {
      try { adressen.push({ url: new URL(x, u), text: '', href: x }); } catch { /* kaputte Adresse */ }
    }
    break;
  }
  return adressen;
}

// Freemailer: Adressen dort sind kein Fehler, nur weniger geschäftlich.
const FREEMAIL = /^(?:web\.de|gmx\.(?:de|net|at|ch)|t-online\.de|gmail\.com|googlemail\.com|yahoo\.[a-z.]+|outlook\.[a-z]+|hotmail\.[a-z]+|live\.[a-z]+|freenet\.de|arcor\.de|icloud\.com|me\.com|aol\.[a-z]+|mail\.de|posteo\.de|wp\.pl|o2\.pl|onet\.pl|interia\.pl|op\.pl|gazeta\.pl|poczta\.fm|tlen\.pl)$/i;

/**
 * Seit 24.10.2026: Hat die E-Mail-Adresse auf eigener Domain ein Postfach
 * (MX-Eintrag)? Nur eine Domain, eine Anfrage, höchstens 2,5 Sekunden. Ohne
 * Antwort (Zeit, Serverfehler) bleibt es offen, das kann an uns liegen.
 */
async function postfachPruefen(s: Signale, basis: URL) {
  const adressen = [...s.emailKlickbar, ...s.emailImText]
    .map((b) => b.text.trim().toLowerCase())
    .filter((a) => /^[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}$/.test(a));
  if (!adressen.length) return;
  const domain = (a: string) => a.split('@')[1];
  const eigene = adressen.filter((a) => !FREEMAIL.test(domain(a)));
  if (!eigene.length) {
    s.freemail = domain(adressen[0]);
    return;
  }
  const seite = basis.hostname.replace(/^www\./, '');
  const adresse = eigene.find((a) => domain(a) === seite) ?? eigene[0];
  // Wie bei pruefeAdresse: keine internen Namen (Sicherheitsprüfung 24.10.2026, H5).
  if (!domain(adresse).includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|arpa)$/i.test(domain(adresse))) return;
  const resolver = new Resolver({ timeout: 2500, tries: 1 });
  try {
    const eintraege = await resolver.resolveMx(domain(adresse));
    s.postfach = { adresse, domain: domain(adresse), mx: eintraege.some((e) => e.exchange && e.exchange !== '.') };
  } catch (fehler) {
    const code = (fehler as { code?: string }).code;
    if (code === 'ENODATA' || code === 'ENOTFOUND') s.postfach = { adresse, domain: domain(adresse), mx: false };
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
        const antwort = await abrufen(u, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': kennung() } });
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
  const fuerUnsGesperrt = async (u: URL) => !robotsErlaubt(robotsGruppen(await robotsText(u)), eigeneNamen(), u.pathname + u.search);
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
  const erlaubt = (u: URL) => robotsErlaubt(regeln, eigeneNamen(), u.pathname + u.search);
  robotsAuswerten(robots, s);
  if (/^[ \t]*sitemap[ \t]*:[ \t]*\S/im.test(robots)) s.sitemap = true;
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
    // Wie bei den Unterseiten: nur HTML (Nachprüfung 24.10.2026, N1).
    if (r.status !== 'fulfilled' || !(/html/i.test(r.value.typ) || /<html/i.test(r.value.text))) continue;
    schon.add(r.value.url.href.replace(/\/+$/, ''));
    seiten.push(seiteAuswerten(r.value, 'rahmen', s));
    alleVerweise = alleVerweise.concat(verweise(r.value.text, r.value.url));
  }

  // Was die robots.txt für uns sperrt, wird nicht gelesen und im Bericht so benannt.
  const ausgewaehlt = unterseitenWaehlen(alleVerweise, basis, schon);
  // Kein Link zu Kontakt oder Preisen auf der Startseite: die Sitemap fragen.
  const arten = ausgewaehlt.map((z) => z.art);
  if ((!arten.includes('kontakt') || !arten.includes('preise')) && ausgewaehlt.length < HOECHSTENS_UNTERSEITEN && bis - Date.now() > 15_000) {
    const karte = await sitemapAdressen(basis, robots, erlaubt, () => frist(ZEIT_KLEIN_MS));
    if (karte.length) s.sitemap = true;
    const ausKarte = unterseitenWaehlen(karte, basis, schon, arten, HOECHSTENS_UNTERSEITEN - ausgewaehlt.length);
    if (ausKarte.length) {
      ausgewaehlt.push(...ausKarte);
      s.ausSitemap = ausKarte.map((z) => z.art);
    }
  }
  const ziele = ausgewaehlt.filter((z) => erlaubt(z.url));
  for (const z of ausgewaehlt) if (!erlaubt(z.url)) s.nichtGelesen.push({ url: z.url.href, art: z.art, grund: 'robots' });
  const [geholt] = await Promise.all([
    Promise.allSettled(ziele.map((z) => holen(z.url, frist(ZEIT_SEITE_MS), true, zaehler))),
    erlaubt(new URL('/llms.txt', basis)) ? llmsLesen(basis, s) : Promise.resolve(),
    !s.sitemap ? sitemapLesen(basis, s, erlaubt) : Promise.resolve(),
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

  await Promise.all([
    linksPruefen(alleVerweise, basis, new Set(seiten.map((x) => x.url.replace(/\/+$/, ''))), s, erlaubt, bis),
    bis - Date.now() > 4000 ? postfachPruefen(s, basis) : Promise.resolve(),
  ]);

  const startWoerter = seiten[0].woerter + seiten.filter((x) => x.art === 'rahmen').reduce((n, x) => n + x.woerter, 0);
  const skripte = (startSeite.text.match(/<script\b/gi) ?? []).length;
  s.ohneJavaScriptLeer = startWoerter < 60 && (skripte >= 3 || /<div[^>]+id=["'](root|app|__next|___gatsby)["']/i.test(startSeite.text));
  s.noindex = seiten[0].noindex;
  // Ein einzelner Abbruch kann auch an unserer Leitung liegen. Erst ab zwei
  // Abbrüchen gilt der Server als wackelig.
  s.wackelig = zaehler.wiederholt >= 2;
  s.seiten = seiten.map((x) => ({ url: x.url, art: x.art, woerter: x.woerter, ...(x.titel ? { titel: x.titel } : {}) }));
  return { signale: s, seiten };
}

/** Nur für muster.test.ts. */
export const fuerTests = { PAARE, ROHTEXT, postfachPruefen, TELEFON_IM_TEXT, BETRAG, NACH_VEREINBARUNG, datenIn, uhrzeiten, metaWerte, sitemapAdressen, unterseitenWaehlen, VORLAGENREST, WOCHENTAG, UHRZEIT_SPANNE, PLZ_ORT, HAUSNUMMER_AM_ENDE, ZEIT_FREI, ZEIT_ZUSAMMENHANG, KEIN_PREIS, robotsSperrt, robotsGruppen, robotsErlaubt, robotsAuswerten, get EIGENE_NAMEN() { return eigeneNamen(); }, zuText, seiteAuswerten, leereSignale, abrufen, ipIntern };

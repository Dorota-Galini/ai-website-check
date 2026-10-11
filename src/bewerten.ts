// KI-Check, Teil 3: Ampel je Kundenfrage, DE und PL. Entstanden am
// 09./10.10.2026.
//
// Erst feste Regeln aus den Signalen (sammeln.ts), dann, wenn es sie gibt,
// die belegten KI-Antworten (kunde.ts). Eine KI-Antwort zählt nur mit
// geprüftem Zitat. Formular, Buchung, WhatsApp und antippbare Nummer stehen
// sicher im Quelltext; dort hat die Regel das letzte Wort.
//
// Ton: Herr Entwurf spricht als Kunde in Ich-Form. „Habe ich nicht gefunden“,
// nie „fehlt“: Wir lesen nur den Quelltext und können etwas übersehen.
// Polnisch: Herr Entwurf heißt dort Pan Szkic (wie im Chat). Die polnischen
// Sätze sind von einer Muttersprachlerin gegengelesen (11.10.2026).
import type { Beleg, Signale } from './sammeln.ts';
import { FRAGEN_SCHLUESSEL, type Frage, type KiAntwort, type KiBericht } from './kunde.ts';

export type Sprache = 'de' | 'pl';
export type Ampel = 'gruen' | 'gelb' | 'rot' | 'offen';

export interface Punkt {
  frage: Frage;
  titel: string;
  ampel: Ampel;
  satz: string;
  belege: Beleg[];
  quelle: 'regeln' | 'ki';
  /** Der Beleg ist Herrn Entwurfs Notiz („Formular mit 9 Feldern …“), kein wörtliches Zitat. */
  belegIstNotiz?: boolean;
  /** Die Frage passt zu diesem Anbieter nicht (z. B. Öffnungszeiten bei Software). Zählt nicht mit. */
  passtNicht?: boolean;
  /** Regel und KI sind sich nicht einig. Nur fürs Protokoll, nie für Besucher. */
  widerspruch?: string;
}

export interface EindruckPunkt {
  thema: 'google' | 'handy' | 'aktualitaet' | 'vorlagen' | 'links';
  titel: string;
  ampel: Ampel;
  text: string;
  /** Kurzform für die Sammelzeile „Außerdem in Ordnung“. */
  kurz: string;
  belege?: string[];
  /** Notiz zur Station im Kundenweg (z. B. wo die Handy-Einstellung steht). */
  beleg?: { text: string; seite: string; notiz?: boolean };
  /** ohneBeschreibung: Die Beschreibung ist unser eigener Hinweis, nicht Text der Seite. */
  vorschau?: { titel: string; adresse: string; beschreibung: string; ohneBeschreibung?: boolean };
}

export interface Lesbarkeit {
  ampel: Ampel;
  saetze: { ampel: Ampel; text: string }[];
}

export interface Ergebnis {
  adresse: string;
  punkte: Punkt[];
  eindruck: EindruckPunkt[];
  lesbarkeit: Lesbarkeit;
  /** Grüne Antworten. */
  gefunden: number;
  /** Fragen, die zu diesem Anbieter passen (ohne „passt nicht“). */
  zaehlbar: number;
}

// ── Texte ───────────────────────────────────────────────────────────────

type FormularInfo = Signale['formulare'][number];

/** Polnische Mehrzahl: 1 link, 2 linki, 5 linków. */
function plMehrzahl(n: number, eins: string, wenige: string, viele: string): string {
  if (n === 1) return eins;
  const e = n % 10;
  const z = n % 100;
  return e >= 2 && e <= 4 && (z < 12 || z > 14) ? wenige : viele;
}

const T = {
  de: {
    fragen: {
      leistungen: 'Was macht ihr genau, und macht ihr das, was ich brauche?',
      preise: 'Was kostet das ungefähr?',
      zeiten: 'Wann habt ihr offen oder wann erreiche ich jemanden?',
      erreichen: 'Wie erreiche ich euch vom Handy aus?',
      anfragen: 'Kann ich direkt anfragen oder einen Termin machen?',
      ort: 'Wo seid ihr, und kommt ihr auch zu mir?',
      vertrauen: 'Kann ich euch vertrauen? Sehe ich echte Arbeiten, Kundenstimmen oder Nachweise?',
    } satisfies Record<Frage, string>,
    nurMitKi: 'Das kann Herr Entwurf nur mit KI beurteilen, und die war diesmal nicht dabei.',
    kiOhneBeleg: 'Dazu habe ich etwas gelesen, die Stelle aber nicht wörtlich wiedergefunden. Deshalb lasse ich die Frage offen.',
    kiOhneAntwort: 'Darauf habe ich diesmal keine sichere Antwort gefunden.',
    preiseGefunden: (z: string) => `Ich habe Preise gefunden, zum Beispiel ${z}.`,
    preiseNurPdf: (t: string) => `Preise stehen nur in einer PDF-Datei (${t}).`,
    preiseHinweis: (z: string) => `Konkrete Preise habe ich nicht gefunden, nur ${z}.`,
    preiseKeine: 'Ich habe keine Preise gefunden, auch keine Richtwerte.',
    zeitenDa: (z: string) => `Die Zeiten stehen da: ${z}.`,
    zeitenFrei: (z: string) => `Feste Zeiten habe ich nicht gefunden, aber einen Hinweis: ${z}.`,
    zeitenVereinbarung: (z: string) => `Ich weiß nur ${z}. Wann jemand ans Telefon geht, habe ich nicht gefunden.`,
    zeitenKeine: 'Ich habe nicht gefunden, wann ihr offen habt oder erreichbar seid.',
    telAntippbar: 'Die Nummer lässt sich am Handy antippen.',
    whatsappAuch: 'Per WhatsApp kann ich auch schreiben.',
    telNurText: 'Die Nummer steht da, aber ich kann sie am Handy nicht antippen. Ich muss sie abschreiben.',
    nurMail: 'Ich habe nur eine E-Mail-Adresse gefunden, keine Telefonnummer.',
    keinKontakt: 'Ich habe weder eine Telefonnummer noch eine E-Mail-Adresse gefunden.',
    buchung: 'Ich kann online einen Termin buchen.',
    formular: 'Es gibt ein Formular, über das ich anfragen kann.',
    formularNotiz: (f: FormularInfo) => (f.dienst
      ? `eingebundenes Formular von ${f.dienst}`
      : `Formular${f.ueberschrift ? ` „${f.ueberschrift}“` : ''} mit ${f.felder} ${f.felder === 1 ? 'Feld' : 'Feldern'}${f.pflicht ? `, davon ${f.pflicht} ${f.pflicht === 1 ? 'Pflichtfeld' : 'Pflichtfelder'}` : ''}`),
    perWhatsapp: 'Ich kann per WhatsApp anfragen.',
    nurAnrufen: 'Ein Formular oder eine Terminbuchung habe ich nicht gefunden. Ich müsste anrufen oder eine E-Mail schreiben.',
    keinWeg: 'Ich habe keinen Weg gefunden, euch eine Anfrage zu schicken.',
    anschrift: (z: string) => `Die Anschrift steht da: ${z}.`,
    anschriftDaten: 'Die Anschrift steht in den Angaben für Suchmaschinen.',
    anschriftImpressum: (z: string) => `Die Anschrift habe ich nur im Impressum gefunden: ${z}.`,
    anschriftKeine: 'Eine Anschrift habe ich nicht gefunden.',
    nichtGelesen: (namen: string) => `Die Seite ${namen} konnte ich nicht lesen, deshalb kann ich dazu nichts Sicheres sagen.`,
    nichtGelesenRobots: (namen: string) => `Die Seite ${namen} sperrt die robots.txt für Programme wie mich. Daran halte ich mich, deshalb kann ich dazu nichts sagen.`,
    seitennamen: { kontakt: 'Kontakt', preise: 'Preise', termin: 'Termin', zeiten: 'Öffnungszeiten', leistungen: 'Leistungen', impressum: 'Impressum' } as Record<string, string>,
    und: ' und ',
    // Erster Eindruck
    googleTitel: 'So steht ihr bei Google',
    googleLeer: (t: string) => `Im Suchergebnis steht als Überschrift nur „${t}“. Daran erkennt niemand, wer ihr seid und was ihr macht.`,
    googleOhneTitel: 'Die Seite hat keinen Titel. Google muss sich selbst eine Überschrift ausdenken.',
    googleVornLeer: (t: string) => `Die Überschrift im Suchergebnis fängt mit „${t}“ an. Vorn sollte stehen, was ihr macht und wo.`,
    googlePasst: 'Die Überschrift passt.',
    googleOhneBeschreibung: ' Eine Beschreibung fehlt, dann zeigt Google irgendeinen Satz von der Seite darunter.',
    googleLang: (n: number) => `Die Überschrift ist ${n} Zeichen lang. Google zeigt etwa 60, der Rest wird abgeschnitten.`,
    googleGut: 'Überschrift und Beschreibung sind gesetzt und sagen, worum es geht.',
    googleKeineBeschreibung: '(keine Beschreibung, Google nimmt dann irgendeinen Satz von der Seite)',
    googleKurz: 'Eintrag bei Google passt',
    handyTitel: 'Auf dem Handy',
    handyGut: 'Die Seite ist fürs Handy eingerichtet.',
    handyNein: 'Die Seite ist nicht fürs Handy eingerichtet. Dort erscheint sie verkleinert wie am Rechner, und man muss mit zwei Fingern ziehen, um etwas zu lesen.',
    handyKurz: 'fürs Handy eingerichtet',
    handyBeleg: 'die Einstellung fürs Handy (viewport) im Kopf der Startseite',
    aktuellTitel: 'Wirkt die Seite gepflegt?',
    aktuellAlt: (j: number) => `Unten auf der Seite steht © ${j}. Wer das sieht, fragt sich, ob hier noch jemand nach dem Rechten schaut.`,
    aktuellGut: (j: number) => `Unten auf der Seite steht © ${j}, das passt.`,
    aktuellKurz: (j: number) => `© ${j} im Fuß`,
    vorlagenTitel: 'Reste aus der Vorlage',
    vorlagenJa: 'Auf der Seite stehen noch Platzhalter aus der Vorlage. Kunden stolpern darüber, und ein KI-Assistent gibt so etwas womöglich als echte Angabe weiter.',
    vorlagenNein: 'Platzhalter aus einer Vorlage habe ich nicht gefunden.',
    vorlagenKurz: 'keine Platzhalter aus Vorlagen',
    linksTitel: 'Führen die Links wohin?',
    linksKaputt: (n: number) => (n === 1 ? 'Ein Link führt auf eine Fehlerseite.' : `${n} Links führen auf eine Fehlerseite.`),
    linksGut: (n: number) => `Alle ${n} Links, die ich angeklickt habe, führen auf eine Seite.`,
    linksKurz: (n: number) => `alle ${n} geprüften Links führen auf eine Seite`,
    linkBeleg: (text: string, url: string, status: number) => `${text || 'Link'}: ${url} (Fehler ${status})`,
    // Lesbarkeit
    robotsKlassisch: (l: string) => `In der robots.txt sind auch normale Suchmaschinen ausgesperrt (${l}). Dann findet euch dort kaum jemand.`,
    robotsKi: (l: string) => `In der robots.txt sind KI-Suchen ausgesperrt (${l}). Wer ChatGPT, Claude oder Perplexity nach einem Betrieb fragt, bekommt euch dann seltener genannt.`,
    nurMitWww: (d: string) => `Ohne „www“ davor ist die Seite nicht erreichbar. Wer nur ${d} eintippt, landet im Leeren.`,
    noindex: 'Die Startseite bittet Suchmaschinen, sie nicht aufzunehmen (noindex).',
    ohneJs: 'Ohne JavaScript ist die Startseite fast leer. Viele KI-Leser sehen dann so gut wie nichts.',
    frames: 'Die Seite ist aus Rahmen (Frames) gebaut. Das ist eine sehr alte Bauweise, Suchmaschinen kommen mit den Unterseiten schlecht zurecht.',
    ohneHttps: 'Die Seite läuft ohne https. Browser zeigen dann „nicht sicher“ an.',
    schemaFehlt: 'Es fehlen die Eckdaten in Maschinensprache (schema.org: Name, Anschrift, Telefon, Zeiten). Damit lesen Google und KI-Assistenten sie sicherer.',
    schemaTeils: (f: string[]) => `Eckdaten in Maschinensprache gibt es, ohne ${f.join(', ')}.`,
    schemaGut: 'Die Eckdaten stehen auch in Maschinensprache (schema.org) da.',
    schemaTeile: { tel: 'Telefon', anschrift: 'Anschrift', zeiten: 'Zeiten' },
    training: (l: string) => `Zur Info: Fürs KI-Training gesperrt sind ${l}. Das ist eine eigene Entscheidung und schadet bei Kundenanfragen nicht.`,
  },
  pl: {
    fragen: {
      leistungen: 'Czym dokładnie się zajmujecie i czy zrobicie to, czego potrzebuję?',
      preise: 'Ile to mniej więcej kosztuje?',
      zeiten: 'Kiedy jesteście otwarci albo kiedy ktoś odbiera?',
      erreichen: 'Jak skontaktuję się z wami z telefonu?',
      anfragen: 'Czy mogę od razu wysłać zapytanie albo umówić termin?',
      ort: 'Gdzie jesteście i czy przyjedziecie do mnie?',
      vertrauen: 'Czy mogę wam zaufać? Widzę prawdziwe realizacje, opinie klientów albo dowody?',
    } satisfies Record<Frage, string>,
    nurMitKi: 'To Pan Szkic oceni tylko z pomocą AI, a tym razem jej nie było.',
    kiOhneBeleg: 'Coś na ten temat przeczytałem, ale nie znalazłem tego miejsca dosłownie. Dlatego zostawiam to pytanie otwarte.',
    kiOhneAntwort: 'Tym razem nie znalazłem na to pewnej odpowiedzi.',
    preiseGefunden: (z: string) => `Znalazłem ceny, na przykład ${z}.`,
    preiseNurPdf: (t: string) => `Ceny są tylko w pliku PDF (${t}).`,
    preiseHinweis: (z: string) => `Konkretnych cen nie znalazłem, tylko ${z}.`,
    preiseKeine: 'Nie znalazłem cen ani orientacyjnych kwot.',
    zeitenDa: (z: string) => `Godziny są podane: ${z}.`,
    zeitenFrei: (z: string) => `Stałych godzin nie znalazłem, ale jest wskazówka: ${z}.`,
    zeitenVereinbarung: (z: string) => `Wiem tylko tyle: ${z}. Kiedy ktoś odbiera telefon, nie znalazłem.`,
    zeitenKeine: 'Nie znalazłem, kiedy jesteście otwarci ani kiedy można się do was dodzwonić.',
    telAntippbar: 'Numer da się wybrać jednym dotknięciem na telefonie.',
    whatsappAuch: 'Mogę też napisać na WhatsApp.',
    telNurText: 'Numer jest podany, ale na telefonie nie da się go wybrać dotknięciem. Muszę go przepisać.',
    nurMail: 'Znalazłem tylko adres e-mail, bez numeru telefonu.',
    keinKontakt: 'Nie znalazłem ani numeru telefonu, ani adresu e-mail.',
    buchung: 'Mogę zarezerwować termin online.',
    formular: 'Jest formularz, przez który mogę wysłać zapytanie.',
    formularNotiz: (f: FormularInfo) => (f.dienst
      ? `osadzony formularz z ${f.dienst}`
      : `formularz${f.ueberschrift ? ` „${f.ueberschrift}”` : ''}: ${f.felder} ${plMehrzahl(f.felder, 'pole', 'pola', 'pól')}${f.pflicht ? `, w tym ${f.pflicht} ${plMehrzahl(f.pflicht, 'obowiązkowe', 'obowiązkowe', 'obowiązkowych')}` : ''}`),
    perWhatsapp: 'Mogę zapytać przez WhatsApp.',
    nurAnrufen: 'Formularza ani rezerwacji terminu nie znalazłem. Musiałbym zadzwonić albo napisać e-mail.',
    keinWeg: 'Nie znalazłem sposobu, żeby wysłać wam zapytanie.',
    anschrift: (z: string) => `Adres jest podany: ${z}.`,
    anschriftDaten: 'Adres jest w danych dla wyszukiwarek.',
    anschriftImpressum: (z: string) => `Adres znalazłem tylko w nocie prawnej (Impressum): ${z}.`,
    anschriftKeine: 'Nie znalazłem adresu.',
    nichtGelesen: (namen: string) => `Nie udało mi się przeczytać strony ${namen}, więc nie mogę tu nic pewnego powiedzieć.`,
    nichtGelesenRobots: (namen: string) => `Strona ${namen} jest zablokowana w pliku robots.txt dla programów takich jak ja. Stosuję się do tego, więc nie mogę tu nic powiedzieć.`,
    seitennamen: { kontakt: 'Kontakt', preise: 'Cennik', termin: 'Termin', zeiten: 'Godziny otwarcia', leistungen: 'Usługi', impressum: 'Nota prawna' } as Record<string, string>,
    und: ' i ',
    googleTitel: 'Tak widzi was Google',
    googleLeer: (t: string) => `W wynikach wyszukiwania jako nagłówek stoi tylko „${t}”. Nikt z tego nie pozna, kim jesteście i czym się zajmujecie.`,
    googleOhneTitel: 'Strona nie ma tytułu. Google musi sam wymyślić nagłówek.',
    googleVornLeer: (t: string) => `Nagłówek w wynikach zaczyna się od „${t}”. Na początku powinno stać, czym się zajmujecie i gdzie.`,
    googlePasst: 'Nagłówek pasuje.',
    googleOhneBeschreibung: ' Brakuje opisu, więc Google pokaże pod nim dowolne zdanie ze strony.',
    googleLang: (n: number) => `Nagłówek ma ${n} znaków. Google pokazuje około 60, resztę ucina.`,
    googleGut: 'Nagłówek i opis są ustawione i mówią, o co chodzi.',
    googleKeineBeschreibung: '(brak opisu, Google weźmie wtedy dowolne zdanie ze strony)',
    googleKurz: 'wpis w Google pasuje',
    handyTitel: 'Na telefonie',
    handyGut: 'Strona jest przygotowana na telefon.',
    handyNein: 'Strona nie jest przygotowana na telefon. Wyświetla się tam pomniejszona jak na komputerze i trzeba ją rozciągać dwoma palcami, żeby coś przeczytać.',
    handyKurz: 'przygotowana na telefon',
    handyBeleg: 'ustawienie dla telefonów (viewport) w nagłówku strony głównej',
    aktuellTitel: 'Czy strona wygląda na zadbaną?',
    aktuellAlt: (j: number) => `Na dole strony stoi © ${j}. Kto to widzi, zastanawia się, czy ktoś jeszcze o nią dba.`,
    aktuellGut: (j: number) => `Na dole strony stoi © ${j}, to się zgadza.`,
    aktuellKurz: (j: number) => `© ${j} w stopce`,
    vorlagenTitel: 'Pozostałości z szablonu',
    vorlagenJa: 'Na stronie zostały jeszcze teksty zastępcze z szablonu. Klienci się o nie potykają, a asystent AI może podać je dalej jako prawdziwe dane.',
    vorlagenNein: 'Nie znalazłem tekstów zastępczych z szablonu.',
    vorlagenKurz: 'bez tekstów zastępczych z szablonu',
    linksTitel: 'Czy linki dokądś prowadzą?',
    linksKaputt: (n: number) => (n === 1 ? 'Jeden link prowadzi do strony z błędem.' : `${n} ${plMehrzahl(n, 'link prowadzi', 'linki prowadzą', 'linków prowadzi')} do strony z błędem.`),
    linksGut: (n: number) => `Wszystkie ${n} ${plMehrzahl(n, 'link', 'linki', 'linków')}, które kliknąłem, ${plMehrzahl(n, 'prowadzi', 'prowadzą', 'prowadzą')} do strony.`,
    linksKurz: (n: number) => `wszystkie ${n} ${plMehrzahl(n, 'sprawdzony link prowadzi', 'sprawdzone linki prowadzą', 'sprawdzonych linków prowadzi')} do strony`,
    linkBeleg: (text: string, url: string, status: number) => `${text || 'Link'}: ${url} (błąd ${status})`,
    robotsKlassisch: (l: string) => `W pliku robots.txt zablokowane są też zwykłe wyszukiwarki (${l}). Wtedy prawie nikt was tam nie znajdzie.`,
    robotsKi: (l: string) => `W pliku robots.txt zablokowane są wyszukiwarki AI (${l}). Kto pyta ChatGPT, Claude albo Perplexity o firmę, rzadziej usłyszy o was.`,
    nurMitWww: (d: string) => `Bez „www” na początku strona się nie otwiera. Kto wpisze tylko ${d}, trafi w próżnię.`,
    noindex: 'Strona główna prosi wyszukiwarki, żeby jej nie uwzględniały (noindex).',
    ohneJs: 'Bez JavaScriptu strona główna jest prawie pusta. Wiele programów AI nie zobaczy wtedy prawie nic.',
    frames: 'Strona jest zbudowana z ramek (frames). To bardzo stary sposób, wyszukiwarki słabo sobie radzą z podstronami.',
    ohneHttps: 'Strona działa bez https. Przeglądarki pokazują wtedy „niezabezpieczona”.',
    schemaFehlt: 'Brakuje podstawowych danych w języku maszyn (schema.org: nazwa, adres, telefon, godziny). Dzięki nim Google i asystenci AI odczytują je pewniej.',
    schemaTeils: (f: string[]) => `Dane w języku maszyn są, ale bez: ${f.join(', ')}.`,
    schemaGut: 'Podstawowe dane są też w języku maszyn (schema.org).',
    schemaTeile: { tel: 'telefonu', anschrift: 'adresu', zeiten: 'godzin' },
    training: (l: string) => `Dla informacji: do trenowania AI zablokowane są ${l}. To osobna decyzja i nie szkodzi przy zapytaniach klientów.`,
  },
};

type Texte = (typeof T)['de'];

// ── Regeln ──────────────────────────────────────────────────────────────

const zitat = (b: Beleg | undefined, sprache: Sprache) =>
  b ? (sprache === 'pl' ? `„${b.text.replace(/^[„"]|[”“"]$/g, '')}”` : `„${b.text.replace(/^[„"]|[“"]$/g, '')}“`) : '';
const istImpressum = (b: Beleg, s: Signale) => s.seiten.find((x) => x.url === b.seite)?.art === 'impressum';

function nachRegeln(s: Signale, sprache: Sprache): Punkt[] {
  const t: Texte = T[sprache];
  const z = (b?: Beleg) => zitat(b, sprache);
  // Kein doppelter Punkt, wenn das Zitat schon mit einem Satzzeichen endet.
  const p = (frage: Frage, ampel: Ampel, satz: string, belege: Beleg[] = [], notiz = false): Punkt => ({
    frage, titel: t.fragen[frage], ampel, satz: satz.replace(/([.!?…])([“”])\./g, '$1$2'), belege: belege.slice(0, 3), quelle: 'regeln',
    ...(notiz ? { belegIstNotiz: true } : {}),
  });
  const punkte: Punkt[] = [];

  punkte.push(p('leistungen', 'offen', t.nurMitKi));

  if (s.preise.length) punkte.push(p('preise', 'gruen', t.preiseGefunden(z(s.preise[0])), s.preise));
  else if (s.preisDateien.length) punkte.push(p('preise', 'gelb', t.preiseNurPdf(s.preisDateien[0].text), s.preisDateien, true));
  else if (s.preisHinweise.length) punkte.push(p('preise', 'gelb', t.preiseHinweis(z(s.preisHinweise[0])), s.preisHinweise));
  else punkte.push(p('preise', 'rot', t.preiseKeine));

  if (s.oeffnungszeiten.length) punkte.push(p('zeiten', 'gruen', t.zeitenDa(z(s.oeffnungszeiten[0])), s.oeffnungszeiten));
  else if (s.zeitenFrei.length) punkte.push(p('zeiten', 'gelb', t.zeitenFrei(z(s.zeitenFrei[0])), s.zeitenFrei));
  else if (s.nachVereinbarung.length) punkte.push(p('zeiten', 'gelb', t.zeitenVereinbarung(z(s.nachVereinbarung[0])), s.nachVereinbarung));
  else punkte.push(p('zeiten', 'rot', t.zeitenKeine));

  const tel = s.telefonKlickbar.length > 0;
  const wa = s.whatsapp.length > 0;
  if (tel || wa) {
    punkte.push(p('erreichen', 'gruen', [tel ? t.telAntippbar : '', wa ? t.whatsappAuch : ''].filter(Boolean).join(' '), [...s.telefonKlickbar, ...s.whatsapp], true));
  } else if (s.telefonImText.length) {
    punkte.push(p('erreichen', 'gelb', t.telNurText, s.telefonImText));
  } else if (s.emailKlickbar.length || s.emailImText.length) {
    punkte.push(p('erreichen', 'gelb', t.nurMail, [...s.emailKlickbar, ...s.emailImText]));
  } else {
    punkte.push(p('erreichen', 'rot', t.keinKontakt));
  }

  if (s.buchung.length) punkte.push(p('anfragen', 'gruen', t.buchung, s.buchung, true));
  else if (s.formular.length) {
    // Im Bericht steht die Überschrift des Formulars und wie viele Felder es hat, nicht die Liste der Beschriftungen.
    // Das größte zuerst: Auf vielen Seiten steht vor dem Anfrageformular noch ein
    // kleines (Chat, Suche mit Textfeld), und belegt wird nur das erste.
    const formulare = s.formulare.length ? [...s.formulare].sort((a, b) => b.felder - a.felder).map((f) => ({ seite: f.seite, text: t.formularNotiz(f) })) : s.formular;
    punkte.push(p('anfragen', 'gruen', t.formular, formulare, true));
  }
  else if (wa) punkte.push(p('anfragen', 'gruen', t.perWhatsapp, s.whatsapp, true));
  else if (tel || s.telefonImText.length || s.emailKlickbar.length || s.emailImText.length) punkte.push(p('anfragen', 'gelb', t.nurAnrufen));
  else punkte.push(p('anfragen', 'rot', t.keinWeg));

  const draussen = s.anschrift.filter((b) => !istImpressum(b, s));
  if (draussen.length) punkte.push(p('ort', 'gruen', t.anschrift(z(draussen[0])), draussen));
  else if (s.strukturiert.mitAnschrift) punkte.push(p('ort', 'gruen', t.anschriftDaten));
  else if (s.anschrift.length) punkte.push(p('ort', 'gelb', t.anschriftImpressum(z(s.anschrift[0])), s.anschrift));
  else punkte.push(p('ort', 'rot', t.anschriftKeine));

  punkte.push(p('vertrauen', 'offen', t.nurMitKi));
  return punkte;
}

const VON_STATUS: Record<'gefunden' | 'teilweise' | 'nicht_gefunden', Ampel> = { gefunden: 'gruen', teilweise: 'gelb', nicht_gefunden: 'rot' };
// „Passt nicht“ ist nur bei diesen Fragen erlaubt (Software, Online-Shop).
const KANN_NICHT_PASSEN: Frage[] = ['zeiten', 'ort', 'anfragen'];

function zusammen(regel: Punkt, ki: KiAntwort | undefined, kiLief: boolean, t: Texte): Punkt {
  if (!ki) {
    // Die KI lief, hat zu dieser Frage aber nichts gesagt: dann nicht „nur mit KI“ behaupten.
    return kiLief && (regel.frage === 'leistungen' || regel.frage === 'vertrauen') ? { ...regel, satz: t.kiOhneAntwort } : regel;
  }
  if (ki.status === 'passt_nicht') {
    return KANN_NICHT_PASSEN.includes(regel.frage)
      ? { ...regel, ampel: 'offen', satz: ki.antwort, belege: [], quelle: 'ki', passtNicht: true }
      : { ...regel, widerspruch: 'KI sagt passt_nicht, bei dieser Frage nicht erlaubt' };
  }
  const kiAmpel = VON_STATUS[ki.status];
  const kiBeleg: Beleg[] = ki.belegt ? [{ seite: ki.seite, text: ki.zitat }] : [];
  const kiPunkt: Punkt = { ...regel, ampel: kiAmpel, satz: ki.antwort, belege: kiBeleg, quelle: 'ki', belegIstNotiz: false };

  if (regel.frage === 'leistungen' || regel.frage === 'vertrauen') {
    // Ohne belegtes Zitat glauben wir „gefunden“ nicht.
    return ki.status === 'nicht_gefunden' || ki.belegt ? kiPunkt : { ...regel, ampel: 'offen', satz: t.kiOhneBeleg, widerspruch: 'KI-Zitat nicht im Material' };
  }
  // KI behauptet etwas, kann es aber nicht belegen: Regel gilt.
  if (ki.status !== 'nicht_gefunden' && !ki.belegt) {
    return { ...regel, widerspruch: `KI sagt ${ki.status}, Zitat nicht im Material` };
  }
  // Antippen kann nur der Quelltext beantworten.
  if (regel.frage === 'erreichen' && kiAmpel === 'gruen' && regel.ampel !== 'gruen') {
    return { ...kiPunkt, ampel: 'gelb', satz: `${ki.antwort} ${regel.satz}` };
  }
  // Formular, Buchung, WhatsApp und antippbare Nummer stehen sicher im
  // Quelltext. Sieht die KI weniger, gilt die Regel.
  if ((regel.frage === 'anfragen' || regel.frage === 'erreichen') && regel.ampel === 'gruen' && kiAmpel !== 'gruen') {
    return { ...regel, widerspruch: `KI ${kiAmpel}, Quelltext grün` };
  }
  if (kiAmpel === regel.ampel) return kiBeleg.length ? kiPunkt : { ...kiPunkt, belege: regel.belege, belegIstNotiz: regel.belegIstNotiz };
  // Regel fand etwas, KI nicht: unklar, ehrlich gelb.
  if (regel.ampel === 'gruen' && kiAmpel === 'rot') return { ...regel, ampel: 'gelb', widerspruch: 'Regel grün, KI nicht gefunden' };
  return { ...kiPunkt, widerspruch: `Regel ${regel.ampel}, KI ${kiAmpel}` };
}

// Welche nicht gelesene Unterseite welche Frage betrifft.
const BETRIFFT: Partial<Record<string, Frage[]>> = {
  kontakt: ['zeiten', 'erreichen', 'anfragen', 'ort'],
  preise: ['preise'],
  termin: ['anfragen'],
  zeiten: ['zeiten'],
  leistungen: ['leistungen', 'preise'],
};

/** Fehlt eine Unterseite, wird aus „nicht gefunden“ ein ehrliches „konnte ich nicht lesen“. */
function lueckenBeachten(p: Punkt, s: Signale, sprache: Sprache): Punkt {
  if (p.ampel === 'gruen' || p.passtNicht) return p;
  const t: Texte = T[sprache];
  const fehlt = s.nichtGelesen.filter((x) => BETRIFFT[x.art]?.includes(p.frage));
  if (!fehlt.length) return p;
  const namen = [...new Set(fehlt.map((x) => zitat({ seite: '', text: t.seitennamen[x.art] ?? x.art }, sprache)))].join(t.und);
  const nurRobots = fehlt.every((x) => x.grund === 'robots');
  return { ...p, ampel: 'offen', satz: nurRobots ? t.nichtGelesenRobots(namen) : t.nichtGelesen(namen), belege: [] };
}

// ── Was Kunden sofort sehen ─────────────────────────────────────────────

// Titel, die nichts über den Betrieb sagen (KI-Check 10.10.2026: „Homepage“).
const LEERER_TITEL = /^(home|homepage|startseite|start|willkommen|herzlich willkommen|welcome|index|untitled|unbenannt|neue seite|new page|my site|meine website|website|seite|strona główna|strona|witamy)$/i;

function ersterEindruck(s: Signale, sprache: Sprache): EindruckPunkt[] {
  const t: Texte = T[sprache];
  const liste: EindruckPunkt[] = [];
  const domain = (s.adresse ?? s.eingabe).replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Google. Rot nur, wenn der ganze Titel leer ist („Homepage“). Steht das
  // leere Wort nur vorn („Homepage - Muster Elektrotechnik“), ist es gelb.
  const titel = s.google.titel?.trim() ?? '';
  const beschreibung = s.google.beschreibung?.trim() ?? '';
  const teile = titel.split(/\s*[|–-]\s*/).filter(Boolean);
  const titelLeer = !titel || teile.every((x) => LEERER_TITEL.test(x));
  const titelVornLeer = !titelLeer && LEERER_TITEL.test(teile[0] ?? '');
  const ohneBeschreibung = beschreibung ? '' : t.googleOhneBeschreibung;
  const vorschau = { titel: titel || domain, adresse: domain, beschreibung: beschreibung || t.googleKeineBeschreibung, ...(beschreibung ? {} : { ohneBeschreibung: true }) };
  const g = (ampel: Ampel, text: string): EindruckPunkt => ({ thema: 'google', titel: t.googleTitel, ampel, text, kurz: t.googleKurz, vorschau });
  if (titelLeer) liste.push(g('rot', titel ? t.googleLeer(titel) : t.googleOhneTitel));
  else if (titelVornLeer) liste.push(g('gelb', t.googleVornLeer(teile[0]) + ohneBeschreibung));
  else if (!beschreibung) liste.push(g('gelb', t.googlePasst + ohneBeschreibung));
  else if (titel.length > 65) liste.push(g('gelb', t.googleLang(titel.length)));
  else liste.push(g('gruen', t.googleGut));

  liste.push({
    thema: 'handy', titel: t.handyTitel, kurz: t.handyKurz,
    ...(s.handyAnsicht
      ? { ampel: 'gruen', text: t.handyGut, beleg: { text: t.handyBeleg, seite: s.adresse ?? s.eingabe, notiz: true } }
      : { ampel: 'rot', text: t.handyNein }),
  });

  if (s.jahrImFuss) {
    const alt = new Date().getFullYear() - s.jahrImFuss >= 2;
    liste.push({ thema: 'aktualitaet', titel: t.aktuellTitel, kurz: t.aktuellKurz(s.jahrImFuss), ampel: alt ? 'gelb' : 'gruen', text: alt ? t.aktuellAlt(s.jahrImFuss) : t.aktuellGut(s.jahrImFuss) });
  }

  liste.push(s.vorlagenreste.length
    ? { thema: 'vorlagen', titel: t.vorlagenTitel, kurz: t.vorlagenKurz, ampel: 'rot', text: t.vorlagenJa, belege: s.vorlagenreste.map((b) => b.text) }
    : { thema: 'vorlagen', titel: t.vorlagenTitel, kurz: t.vorlagenKurz, ampel: 'gruen', text: t.vorlagenNein });

  if (s.linksGeprueft > 0) {
    const n = s.kaputteLinks.length;
    liste.push(n
      ? { thema: 'links', titel: t.linksTitel, kurz: t.linksKurz(s.linksGeprueft), ampel: 'rot', text: t.linksKaputt(n), belege: s.kaputteLinks.map((l) => t.linkBeleg(l.text, l.url.replace(/^https?:\/\/(www\.)?/, ''), l.status)) }
      : { thema: 'links', titel: t.linksTitel, kurz: t.linksKurz(s.linksGeprueft), ampel: 'gruen', text: t.linksGut(s.linksGeprueft) });
  }
  return liste;
}

// ── Können KI-Assistenten die Seite lesen? ──────────────────────────────

function lesbarkeit(s: Signale, sprache: Sprache): Lesbarkeit {
  const t: Texte = T[sprache];
  const saetze: Lesbarkeit['saetze'] = [];
  const klassischeNamen = ['Googlebot', 'Bingbot', 'Applebot'];
  const ki = s.robots.sucheGesperrt.filter((l) => !klassischeNamen.includes(l));
  const klassisch = s.robots.sucheGesperrt.filter((l) => klassischeNamen.includes(l));
  if (klassisch.length) saetze.push({ ampel: 'rot', text: t.robotsKlassisch(klassisch.join(', ')) });
  if (ki.length) saetze.push({ ampel: 'rot', text: t.robotsKi(ki.join(', ')) });
  if (s.nurMitWww) saetze.push({ ampel: 'gelb', text: t.nurMitWww(s.eingabe.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')) });
  // s.wackelig steht bewusst NICHT im Bericht: Im Testlauf vom 09.10.2026
  // brachen Verbindungen zu Seiten eines großen Hosters nur über IPv6 ab, über IPv4 nie.
  // Das kann an unserer Leitung liegen und wäre dem Betrieb gegenüber unfair.
  if (s.noindex) saetze.push({ ampel: 'rot', text: t.noindex });
  if (s.ohneJavaScriptLeer) saetze.push({ ampel: 'rot', text: t.ohneJs });
  if (s.frames) saetze.push({ ampel: 'gelb', text: t.frames });
  if (s.https === false) saetze.push({ ampel: 'gelb', text: t.ohneHttps });
  if (!s.strukturiert.ortsbetrieb) {
    saetze.push({ ampel: 'gelb', text: t.schemaFehlt });
  } else {
    const fehlt = [
      !s.strukturiert.mitTelefon && t.schemaTeile.tel,
      !s.strukturiert.mitAnschrift && t.schemaTeile.anschrift,
      !s.strukturiert.mitZeiten && t.schemaTeile.zeiten,
    ].filter((x): x is string => !!x);
    saetze.push({ ampel: fehlt.length ? 'gelb' : 'gruen', text: fehlt.length ? t.schemaTeils(fehlt) : t.schemaGut });
  }
  if (s.robots.trainingGesperrt.length) saetze.push({ ampel: 'offen', text: t.training(s.robots.trainingGesperrt.join(', ')) });
  const ampel: Ampel = saetze.some((x) => x.ampel === 'rot') ? 'rot' : saetze.some((x) => x.ampel === 'gelb') ? 'gelb' : 'gruen';
  return { ampel, saetze };
}

export function bewerten(s: Signale, ki: KiBericht | undefined, sprache: Sprache): Ergebnis {
  const punkte = nachRegeln(s, sprache)
    .map((r) => lueckenBeachten(zusammen(r, ki?.antworten[r.frage], !!ki, T[sprache]), s, sprache));
  // Reihenfolge wie FRAGEN_SCHLUESSEL, falls jemand nachRegeln umstellt.
  punkte.sort((a, b) => FRAGEN_SCHLUESSEL.indexOf(a.frage) - FRAGEN_SCHLUESSEL.indexOf(b.frage));
  return {
    adresse: s.adresse ?? s.eingabe,
    punkte,
    eindruck: ersterEindruck(s, sprache),
    lesbarkeit: lesbarkeit(s, sprache),
    gefunden: punkte.filter((x) => x.ampel === 'gruen').length,
    zaehlbar: punkte.filter((x) => !x.passtNicht).length,
  };
}

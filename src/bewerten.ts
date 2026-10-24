// KI-Check, Teil 3: Ampel je Kundenfrage, DE, PL und EN. Entstanden am
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
import { nummerKern, uhrzeiten, type Beleg, type Signale } from './sammeln.ts';
import { FRAGEN_SCHLUESSEL, type Frage, type KiAntwort, type KiBericht } from './kunde.ts';

export type Sprache = 'de' | 'pl' | 'en';
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
  /** Seit 24.10.2026: Die Regel kann etwas übersehen haben (Baukasten, Formular per JavaScript). Die KI darf dann nicht auf „rot“ setzen. */
  vorbehalt?: boolean;
}

export interface EindruckPunkt {
  thema: 'google' | 'handy' | 'aktualitaet' | 'vorlagen' | 'links' | 'vorschau' | 'bilder' | 'widersprueche' | 'postfach';
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

/** Seit 24.10.2026: die zehnte Frage aus der Branche, nur mit KI. Zählt nicht in „x von y“. */
export interface Branchenpunkt {
  frage: string;
  ampel: Ampel;
  satz: string;
  beleg?: { text: string; seite: string };
}

export interface Ergebnis {
  adresse: string;
  punkte: Punkt[];
  branchenfrage?: Branchenpunkt;
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
    kiFolgt: 'Das beurteilt Herr Entwurf gleich noch mit KI.',
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
    nichtAufStart: (seite: string) => ` Sie steht aber erst auf der Seite ${seite}. Auf der Startseite habe ich keine Nummer gefunden.`,
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
    keinWegQuelltext: 'Im Quelltext habe ich keinen Weg gefunden, euch eine Anfrage zu schicken.',
    jsFormular: (dienst: string) => `Es gibt ein Formular von ${dienst}. Es wird erst per JavaScript geladen, deshalb sehe ich die Felder nicht.`,
    baukastenVorbehalt: (b: string) => ` Die Seite ist mit ${b} gebaut. Dort erscheinen Formulare oft erst per JavaScript, ich kann eins übersehen haben.`,
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
    // SEO-Grundlagen, seit 22.10.2026
    googleOhneOrt: (ort: string) => ` „${ort}“ steht weder in der Überschrift noch in der Beschreibung. Wer in der Nähe sucht, sieht so nicht gleich, dass ihr dort seid.`,
    googleOhneH1: ' Die Startseite hat keine Hauptüberschrift (h1). Google und KI-Assistenten erkennen damit schlechter, worum es geht.',
    handyTitel: 'Auf dem Handy',
    handyGut: 'Die Seite ist fürs Handy eingerichtet.',
    handyNein: 'Die Seite ist nicht fürs Handy eingerichtet. Dort erscheint sie verkleinert wie am Rechner, und man muss mit zwei Fingern ziehen, um etwas zu lesen.',
    handyKurz: 'fürs Handy eingerichtet',
    handyBeleg: 'die Einstellung fürs Handy (viewport) im Kopf der Startseite',
    // Seit 24.10.2026: Titel aller Seiten, Länge der Beschreibung, Handy genauer, Vorschau beim Teilen.
    titelGleich: (n: number) => ` Alle ${n} gelesenen Seiten haben dieselbe Überschrift. Bei Google stehen sie dann wie Kopien untereinander, und niemand sieht, welche zu Preisen oder Kontakt führt.`,
    beschreibungLang: (n: number) => ` Die Beschreibung ist ${n} Zeichen lang. Google zeigt etwa 155, der Rest wird abgeschnitten.`,
    beschreibungKurz: ' Die Beschreibung ist sehr kurz. Ein, zwei Sätze dazu, was ihr macht und wo, helfen mehr.',
    handyFesteBreite: 'Die Seite ist auf eine feste Breite eingestellt. Am Handy erscheint sie dann verkleinert wie am Rechner.',
    handyZoom: ' Vergrößern mit zwei Fingern ist gesperrt. Wer schlecht sieht, kann die Schrift dann nicht größer ziehen.',
    handySchwer: (mb: string) => ` Schon der Quelltext der Startseite ist ${mb} MB groß, ohne Bilder. Im mobilen Netz dauert das Laden spürbar.`,
    handySkripte: (n: number) => ` Die Startseite lädt ${n} Skriptdateien. Das bremst ältere Handys.`,
    vorschauTitel: 'Wenn jemand euren Link per WhatsApp schickt',
    vorschauGut: 'Beim Teilen per WhatsApp erscheinen Bild, Titel und Text. So sieht der Empfänger gleich, worum es geht.',
    vorschauOhneBild: 'Ein Vorschaubild für WhatsApp und Facebook (og:image) habe ich nicht gefunden. Wer euren Link weiterschickt, sieht dann nur den Titel, ohne Bild.',
    vorschauKurz: 'Vorschau beim Teilen mit Bild',
    vertrauenBewertung: (wo: string) => `Ich habe Bewertungen von Kunden gefunden: ${wo}.`,
    vertrauenSterne: 'Bewertungen mit Sternen stehen in den Angaben für Suchmaschinen.',
    vertrauenNachweis: (z: string) => `Ich habe einen Nachweis gefunden: ${z}.`,
    vertrauenHinweis: (z: string) => `Ich habe einen Hinweis gefunden: ${z}. Ob dahinter echte Arbeiten oder Kundenstimmen stehen, kann ich ohne KI nicht sicher sagen.`,
    bilderTitel: 'Bilder',
    bilderStock: (n: number) => `${n === 1 ? 'Ein Bild stammt' : `${n} Bilder stammen`} von einer Bildagentur. Daran ist nichts falsch. Eigene Fotos von euch und euren Arbeiten wirken aber glaubwürdiger, gerade wenn ein Kunde überlegt, ob er euch vertrauen kann.`,
    bilderOhneAlt: (k: number, n: number) => `${k} von ${n} Bildern haben keine Beschreibung (alt). KI-Assistenten und Vorleseprogramme wissen dann nicht, was darauf zu sehen ist.`,
    bilderGut: 'Die Bilder haben Beschreibungen (alt), und Bilder von Bildagenturen habe ich nicht erkannt.',
    bilderKurz: 'Bilder mit Beschreibung',
    aktuellTitel: 'Wirkt die Seite gepflegt?',
    aktuellAlt: (j: number) => `Unten auf der Seite steht © ${j}. Wer das sieht, fragt sich, ob hier noch jemand nach dem Rechten schaut.`,
    aktuellGut: (j: number) => `Unten auf der Seite steht © ${j}, das passt.`,
    aktuellKurz: (j: number) => `© ${j} im Fuß`,
    // Seit 24.10.2026: neueste Meldung und Abgleich mit den Angaben für Suchmaschinen.
    meldungAlt: (wann: string) => `Die neueste Meldung, die ich gefunden habe, ist vom ${wann}. Wer das sieht, fragt sich, ob hier noch jemand nach dem Rechten schaut.`,
    meldungAuchAlt: (wann: string) => ` Auch die neueste Meldung ist vom ${wann}.`,
    meldungGut: (wann: string) => `Die neueste Meldung ist vom ${wann}, das passt.`,
    meldungKurz: (wann: string) => `neueste Meldung vom ${wann}`,
    monate: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    widerspruchTitel: 'Passt alles zusammen?',
    telLinkFalsch: 'Ein Telefon-Link zeigt eine andere Nummer an, als er beim Antippen wählt.',
    schemaTelFremd: (n: string) => `In den Angaben für Suchmaschinen steht die Nummer ${n}, auf der Seite selbst habe ich sie nicht gefunden. Google zeigt dann womöglich eine andere Nummer als ihr.`,
    schemaPlzFremd: (plz: string, seite: string) => `In den Angaben für Suchmaschinen steht die Postleitzahl ${plz}, auf der Seite ${seite}.`,
    schemaZeitenFremd: (z: string) => `Die Zeiten in den Angaben für Suchmaschinen (${z}) finde ich auf der Seite nicht wieder. Google zeigt dann womöglich andere Öffnungszeiten als ihr.`,
    widerspruchGut: 'Die Angaben für Suchmaschinen passen zu dem, was auf der Seite steht.',
    widerspruchKurz: 'Angaben für Suchmaschinen passen zur Seite',
    postfachTitel: 'E-Mail-Adresse',
    postfachFehlt: (adresse: string, domain: string) => `Für ${domain} habe ich keinen Eintrag für ein Postfach (MX) gefunden. Mails an ${adresse} kommen dann womöglich nicht an. Das sollte euer Anbieter einmal prüfen.`,
    postfachGut: (domain: string) => `Für ${domain} ist ein Postfach eingerichtet (MX).`,
    postfachKurz: 'Postfach für eure E-Mail-Adresse eingerichtet',
    freemail: (anbieter: string) => `Eure E-Mail-Adresse läuft über ${anbieter}. Das funktioniert, aber eine Adresse mit eurer eigenen Domain wirkt für Kunden geschäftlicher.`,
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
    sitemapFehlt: 'Eine Sitemap habe ich nicht gefunden. Mit ihr finden Google und Bing alle Unterseiten schneller.',
    llmsTxt: 'Es gibt eine llms.txt, also eine Kurzfassung der Seite eigens für KI-Assistenten.',
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
    kiFolgt: 'To Pan Szkic oceni za chwilę z pomocą AI.',
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
    nichtAufStart: (seite: string) => ` Jest jednak dopiero na stronie ${seite}. Na stronie głównej nie znalazłem żadnego numeru.`,
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
    keinWegQuelltext: 'W kodzie strony nie znalazłem sposobu, żeby wysłać wam zapytanie.',
    jsFormular: (dienst: string) => `Jest formularz z ${dienst}. Ładuje się dopiero przez JavaScript, więc nie widzę jego pól.`,
    baukastenVorbehalt: (b: string) => ` Strona jest zbudowana w ${b}. Formularze pojawiają się tam często dopiero przez JavaScript, mogłem jakiś przeoczyć.`,
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
    googleOhneOrt: (ort: string) => ` „${ort}” nie pojawia się ani w nagłówku, ani w opisie. Kto szuka w okolicy, nie zobaczy od razu, że tam jesteście.`,
    googleOhneH1: ' Strona główna nie ma głównego nagłówka (h1). Google i asystenci AI gorzej rozpoznają, o czym jest strona.',
    handyTitel: 'Na telefonie',
    handyGut: 'Strona jest przygotowana na telefon.',
    handyNein: 'Strona nie jest przygotowana na telefon. Wyświetla się tam pomniejszona jak na komputerze i trzeba ją rozciągać dwoma palcami, żeby coś przeczytać.',
    handyKurz: 'przygotowana na telefon',
    handyBeleg: 'ustawienie dla telefonów (viewport) w nagłówku strony głównej',
    titelGleich: (n: number) => ` Wszystkie ${n} ${plMehrzahl(n, 'przeczytana strona ma', 'przeczytane strony mają', 'przeczytanych stron ma')} ten sam nagłówek. W Google wyglądają wtedy jak kopie jedna pod drugą i nikt nie widzi, która prowadzi do cennika albo kontaktu.`,
    beschreibungLang: (n: number) => ` Opis ma ${n} znaków. Google pokazuje około 155, resztę ucina.`,
    beschreibungKurz: ' Opis jest bardzo krótki. Jedno, dwa zdania o tym, czym się zajmujecie i gdzie, pomogą bardziej.',
    handyFesteBreite: 'Strona ma ustawioną stałą szerokość. Na telefonie wyświetla się wtedy pomniejszona jak na komputerze.',
    handyZoom: ' Powiększanie dwoma palcami jest zablokowane. Kto słabo widzi, nie może wtedy powiększyć tekstu.',
    handySchwer: (mb: string) => ` Już sam kod strony głównej ma ${mb} MB, bez zdjęć. Przy internecie mobilnym ładowanie wyraźnie trwa.`,
    handySkripte: (n: number) => ` Strona główna ładuje ${n} ${plMehrzahl(n, 'plik', 'pliki', 'plików')} ze skryptami. To spowalnia starsze telefony.`,
    vorschauTitel: 'Gdy ktoś wyśle wasz link na WhatsAppie',
    vorschauGut: 'Przy udostępnianiu na WhatsAppie pojawia się zdjęcie, tytuł i opis. Odbiorca od razu widzi, o co chodzi.',
    vorschauOhneBild: 'Nie znalazłem obrazka podglądu dla WhatsAppa i Facebooka (og:image). Kto przekaże wasz link dalej, zobaczy tylko tytuł, bez zdjęcia.',
    vorschauKurz: 'podgląd przy udostępnianiu ze zdjęciem',
    vertrauenBewertung: (wo: string) => `Znalazłem opinie klientów: ${wo}.`,
    vertrauenSterne: 'Oceny w gwiazdkach są w danych dla wyszukiwarek.',
    vertrauenNachweis: (z: string) => `Znalazłem potwierdzenie: ${z}.`,
    vertrauenHinweis: (z: string) => `Znalazłem wskazówkę: ${z}. Czy kryją się za tym prawdziwe realizacje albo opinie klientów, bez AI nie mogę powiedzieć na pewno.`,
    bilderTitel: 'Zdjęcia',
    bilderStock: (n: number) => `${n === 1 ? 'Jedno zdjęcie pochodzi' : `${n} ${plMehrzahl(n, 'zdjęcie pochodzi', 'zdjęcia pochodzą', 'zdjęć pochodzi')}`} z banku zdjęć. Nie ma w tym nic złego. Własne zdjęcia was i waszych realizacji są jednak bardziej wiarygodne, zwłaszcza gdy klient zastanawia się, czy może wam zaufać.`,
    bilderOhneAlt: (k: number, n: number) => `${k} z ${n} zdjęć nie ma opisu (alt). Asystenci AI i czytniki ekranu nie wiedzą wtedy, co na nich widać.`,
    bilderGut: 'Zdjęcia mają opisy (alt), a zdjęć z banków zdjęć nie rozpoznałem.',
    bilderKurz: 'zdjęcia z opisem',
    aktuellTitel: 'Czy strona wygląda na zadbaną?',
    aktuellAlt: (j: number) => `Na dole strony stoi © ${j}. Kto to widzi, zastanawia się, czy ktoś jeszcze o nią dba.`,
    aktuellGut: (j: number) => `Na dole strony stoi © ${j}, to się zgadza.`,
    aktuellKurz: (j: number) => `© ${j} w stopce`,
    meldungAlt: (wann: string) => `Najnowszy wpis, jaki znalazłem, jest z ${wann}. Kto to widzi, zastanawia się, czy ktoś jeszcze o nią dba.`,
    meldungAuchAlt: (wann: string) => ` Także najnowszy wpis jest z ${wann}.`,
    meldungGut: (wann: string) => `Najnowszy wpis jest z ${wann}, to się zgadza.`,
    meldungKurz: (wann: string) => `najnowszy wpis z ${wann}`,
    monate: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
    widerspruchTitel: 'Czy wszystko się zgadza?',
    telLinkFalsch: 'Link telefoniczny pokazuje inny numer niż ten, który wybiera po dotknięciu.',
    schemaTelFremd: (n: string) => `W danych dla wyszukiwarek jest numer ${n}, a na samej stronie go nie znalazłem. Google może wtedy pokazać inny numer niż wy.`,
    schemaPlzFremd: (plz: string, seite: string) => `W danych dla wyszukiwarek jest kod pocztowy ${plz}, a na stronie ${seite}.`,
    schemaZeitenFremd: (z: string) => `Godzin z danych dla wyszukiwarek (${z}) nie znajduję na stronie. Google może wtedy pokazać inne godziny otwarcia niż wy.`,
    widerspruchGut: 'Dane dla wyszukiwarek zgadzają się z tym, co jest na stronie.',
    widerspruchKurz: 'dane dla wyszukiwarek zgadzają się ze stroną',
    postfachTitel: 'Adres e-mail',
    postfachFehlt: (adresse: string, domain: string) => `Dla ${domain} nie znalazłem wpisu skrzynki pocztowej (MX). Maile na ${adresse} mogą wtedy nie docierać. Warto, żeby wasz dostawca to sprawdził.`,
    postfachGut: (domain: string) => `Dla ${domain} skrzynka pocztowa jest ustawiona (MX).`,
    postfachKurz: 'skrzynka pocztowa dla waszego adresu e-mail ustawiona',
    freemail: (anbieter: string) => `Wasz adres e-mail jest na ${anbieter}. To działa, ale adres z waszą własną domeną wygląda dla klientów bardziej profesjonalnie.`,
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
    sitemapFehlt: 'Nie znalazłem mapy strony (sitemap). Dzięki niej Google i Bing szybciej znajdują wszystkie podstrony.',
    llmsTxt: 'Jest plik llms.txt, czyli skrót strony przygotowany specjalnie dla asystentów AI.',
    training: (l: string) => `Dla informacji: do trenowania AI zablokowane są ${l}. To osobna decyzja i nie szkodzi przy zapytaniach klientów.`,
  },
  en: {
    fragen: {
      leistungen: 'What exactly do you do, and do you do what I need?',
      preise: 'Roughly what does it cost?',
      zeiten: 'When are you open, or when can I reach someone?',
      erreichen: 'How do I reach you from my phone?',
      anfragen: 'Can I send an inquiry or book an appointment right away?',
      ort: 'Where are you, and do you come to me?',
      vertrauen: 'Can I trust you? Do I see real work, customer reviews or credentials?',
    } satisfies Record<Frage, string>,
    nurMitKi: 'Mr Sketch can only judge this with AI, and it was not used this time.',
    kiOhneBeleg: 'I read something about this but could not find the exact passage again. So I leave this question open.',
    kiOhneAntwort: 'I did not find a reliable answer to this one this time.',
    preiseGefunden: (z: string) => `I found prices, for example ${z}.`,
    preiseNurPdf: (t: string) => `Prices are only in a PDF file (${t}).`,
    preiseHinweis: (z: string) => `I found no actual prices, only ${z}.`,
    preiseKeine: 'I found no prices, not even rough figures.',
    zeitenDa: (z: string) => `The hours are there: ${z}.`,
    zeitenFrei: (z: string) => `I found no fixed hours, but a hint: ${z}.`,
    zeitenVereinbarung: (z: string) => `All I know is ${z}. I did not find when someone answers the phone.`,
    zeitenKeine: 'I did not find when you are open or when I can reach you.',
    telAntippbar: 'I can tap the number on my phone to call.',
    whatsappAuch: 'I can also write on WhatsApp.',
    telNurText: 'The number is there, but I cannot tap it on my phone. I have to type it in.',
    nurMail: 'I only found an email address, no phone number.',
    keinKontakt: 'I found neither a phone number nor an email address.',
    buchung: 'I can book an appointment online.',
    formular: 'There is a form I can use to send an inquiry.',
    formularNotiz: (f: FormularInfo) => (f.dienst
      ? `embedded form from ${f.dienst}`
      : `form${f.ueberschrift ? ` “${f.ueberschrift}”` : ''} with ${f.felder} ${f.felder === 1 ? 'field' : 'fields'}${f.pflicht ? `, ${f.pflicht} of them required` : ''}`),
    perWhatsapp: 'I can send an inquiry via WhatsApp.',
    nurAnrufen: 'I found no form and no online booking. I would have to call or write an email.',
    keinWeg: 'I found no way to send you an inquiry.',
    anschrift: (z: string) => `The address is there: ${z}.`,
    anschriftDaten: 'The address is in the data for search engines.',
    anschriftImpressum: (z: string) => `I only found the address in the legal notice (Impressum): ${z}.`,
    anschriftKeine: 'I did not find an address.',
    nichtGelesen: (namen: string) => `I could not read the page ${namen}, so I cannot say anything reliable about this.`,
    nichtGelesenRobots: (namen: string) => `robots.txt blocks the page ${namen} for programs like me. I respect that, so I cannot say anything about this.`,
    seitennamen: { kontakt: 'Contact', preise: 'Prices', termin: 'Booking', zeiten: 'Opening hours', leistungen: 'Services', impressum: 'Legal notice' } as Record<string, string>,
    und: ' and ',
    googleTitel: 'How you look on Google',
    googleLeer: (t: string) => `In the search results the title is just “${t}”. Nobody can tell from that who you are or what you do.`,
    googleOhneTitel: 'The page has no title. Google has to make one up.',
    googleVornLeer: (t: string) => `The title in the search results starts with “${t}”. What you do and where should come first.`,
    googlePasst: 'The title works.',
    googleOhneBeschreibung: ' There is no description, so Google shows some random sentence from the page below it.',
    googleLang: (n: number) => `The title is ${n} characters long. Google shows about 60, the rest is cut off.`,
    googleGut: 'Title and description are set and say what it is about.',
    googleKeineBeschreibung: '(no description, so Google takes some sentence from the page)',
    googleKurz: 'Google listing works',
    handyTitel: 'On the phone',
    handyGut: 'The page is set up for phones.',
    handyNein: 'The page is not set up for phones. It shows up shrunk like on a computer, and you have to zoom with two fingers to read anything.',
    handyKurz: 'set up for phones',
    handyBeleg: 'the phone setting (viewport) in the head of the start page',
    aktuellTitel: 'Does the site look cared for?',
    aktuellAlt: (j: number) => `At the bottom of the page it says © ${j}. Anyone who sees that wonders whether someone still looks after it.`,
    aktuellGut: (j: number) => `At the bottom of the page it says © ${j}, which is fine.`,
    aktuellKurz: (j: number) => `© ${j} in the footer`,
    vorlagenTitel: 'Leftovers from the template',
    vorlagenJa: 'There is still placeholder text from the template on the page. Customers stumble over it, and an AI assistant might pass it on as real information.',
    vorlagenNein: 'I found no placeholder text from a template.',
    vorlagenKurz: 'no template placeholders',
    linksTitel: 'Do the links go somewhere?',
    linksKaputt: (n: number) => (n === 1 ? 'One link leads to an error page.' : `${n} links lead to an error page.`),
    linksGut: (n: number) => `All ${n} links I clicked lead to a page.`,
    linksKurz: (n: number) => `all ${n} checked links lead to a page`,
    linkBeleg: (text: string, url: string, status: number) => `${text || 'Link'}: ${url} (error ${status})`,
    robotsKlassisch: (l: string) => `robots.txt also blocks normal search engines (${l}). Then hardly anyone finds you there.`,
    robotsKi: (l: string) => `robots.txt blocks AI search (${l}). People who ask ChatGPT, Claude or Perplexity about a business will hear about you less often.`,
    nurMitWww: (d: string) => `Without “www” in front, the page does not open. Anyone who types just ${d} ends up nowhere.`,
    noindex: 'The start page asks search engines not to include it (noindex).',
    ohneJs: 'Without JavaScript the start page is almost empty. Many AI readers then see next to nothing.',
    frames: 'The page is built with frames. That is a very old technique, and search engines struggle with the sub-pages.',
    ohneHttps: 'The page runs without https. Browsers then show “not secure”.',
    schemaFehlt: 'The key facts are missing in machine-readable form (schema.org: name, address, phone, hours). With them, Google and AI assistants read them more reliably.',
    schemaTeils: (f: string[]) => `Machine-readable key facts are there, but without ${f.join(', ')}.`,
    schemaGut: 'The key facts are also there in machine-readable form (schema.org).',
    schemaTeile: { tel: 'phone', anschrift: 'address', zeiten: 'hours' },
    kiFolgt: 'Mr Sketch will judge this with AI in a moment.',
    nichtAufStart: (seite: string) => ` But it only appears on the page ${seite}. I found no number on the start page.`,
    keinWegQuelltext: 'In the source code I found no way to send you an inquiry.',
    jsFormular: (dienst: string) => `There is a form from ${dienst}. It only loads with JavaScript, so I cannot see its fields.`,
    baukastenVorbehalt: (b: string) => ` The site is built with ${b}. Forms there often only appear with JavaScript, so I may have missed one.`,
    googleOhneOrt: (ort: string) => ` “${ort}” appears neither in the title nor in the description. People searching nearby will not see right away that you are there.`,
    googleOhneH1: ' The start page has no main heading (h1). Google and AI assistants find it harder to tell what it is about.',
    titelGleich: (n: number) => ` All ${n} pages I read have the same title. On Google they look like copies, and nobody can tell which one leads to prices or contact.`,
    beschreibungLang: (n: number) => ` The description is ${n} characters long. Google shows about 155, the rest is cut off.`,
    beschreibungKurz: ' The description is very short. One or two sentences on what you do and where would help more.',
    handyFesteBreite: 'The page is set to a fixed width. On a phone it then shows up shrunk like on a computer.',
    handyZoom: ' Zooming with two fingers is blocked. People with poor eyesight cannot make the text bigger.',
    handySchwer: (mb: string) => ` The source code of the start page alone is ${mb} MB, without images. On mobile data it takes noticeably long to load.`,
    handySkripte: (n: number) => ` The start page loads ${n} script files. That slows down older phones.`,
    vorschauTitel: 'When someone sends your link on WhatsApp',
    vorschauGut: 'When shared on WhatsApp, a picture, title and text appear. The recipient sees right away what it is about.',
    vorschauOhneBild: 'I found no preview image for WhatsApp and Facebook (og:image). Anyone who passes your link on will only see the title, without a picture.',
    vorschauKurz: 'preview with picture when shared',
    vertrauenBewertung: (wo: string) => `I found customer reviews: ${wo}.`,
    vertrauenSterne: 'Star ratings are in the data for search engines.',
    vertrauenNachweis: (z: string) => `I found a credential: ${z}.`,
    vertrauenHinweis: (z: string) => `I found a hint: ${z}. Without AI I cannot say for sure whether real work or customer reviews are behind it.`,
    bilderTitel: 'Images',
    bilderStock: (n: number) => `${n === 1 ? 'One image comes' : `${n} images come`} from a stock photo agency. There is nothing wrong with that. Your own photos of you and your work are more convincing, though, especially when a customer is deciding whether to trust you.`,
    bilderOhneAlt: (k: number, n: number) => `${k} of ${n} images have no description (alt). AI assistants and screen readers then do not know what they show.`,
    bilderGut: 'The images have descriptions (alt), and I did not spot any stock photos.',
    bilderKurz: 'images with descriptions',
    meldungAlt: (wann: string) => `The newest post I found is from ${wann}. Anyone who sees that wonders whether someone still looks after the site.`,
    meldungAuchAlt: (wann: string) => ` The newest post is also from ${wann}.`,
    meldungGut: (wann: string) => `The newest post is from ${wann}, which is fine.`,
    meldungKurz: (wann: string) => `newest post from ${wann}`,
    monate: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    widerspruchTitel: 'Does everything match?',
    telLinkFalsch: 'A phone link shows a different number than the one it dials when tapped.',
    schemaTelFremd: (n: string) => `The data for search engines lists the number ${n}, but I did not find it on the page itself. Google may then show a different number than you do.`,
    schemaPlzFremd: (plz: string, seite: string) => `The data for search engines lists the postcode ${plz}, the page says ${seite}.`,
    schemaZeitenFremd: (z: string) => `I cannot find the hours from the data for search engines (${z}) on the page. Google may then show different opening hours than you do.`,
    widerspruchGut: 'The data for search engines matches what is on the page.',
    widerspruchKurz: 'data for search engines matches the page',
    postfachTitel: 'Email address',
    postfachFehlt: (adresse: string, domain: string) => `I found no mailbox entry (MX) for ${domain}. Emails to ${adresse} may then not arrive. It is worth asking your provider to check.`,
    postfachGut: (domain: string) => `A mailbox (MX) is set up for ${domain}.`,
    postfachKurz: 'mailbox set up for your email address',
    freemail: (anbieter: string) => `Your email address runs on ${anbieter}. That works, but an address on your own domain looks more professional to customers.`,
    sitemapFehlt: 'I did not find a sitemap. With one, Google and Bing find all sub-pages faster.',
    llmsTxt: 'There is an llms.txt, a short version of the site made for AI assistants.',
    training: (l: string) => `For your information: ${l} are blocked from AI training. That is a separate decision and does not hurt customer inquiries.`,
  },
};

type Texte = (typeof T)['de'];

// ── Regeln ──────────────────────────────────────────────────────────────

// Anführungszeichen je Sprache: „…“ deutsch, „…” polnisch, “…” englisch.
const zitat = (b: Beleg | undefined, sprache: Sprache) => {
  if (!b) return '';
  const text = b.text.replace(/^[„"“]|[“”"]$/g, '');
  return sprache === 'pl' ? `„${text}”` : sprache === 'en' ? `“${text}”` : `„${text}“`;
};
const istImpressum = (b: Beleg, s: Signale) => s.seiten.find((x) => x.url === b.seite)?.art === 'impressum';

function nachRegeln(s: Signale, sprache: Sprache, kiFolgt = false): Punkt[] {
  const t: Texte = T[sprache];
  const z = (b?: Beleg) => zitat(b, sprache);
  // Kein doppelter Punkt, wenn das Zitat schon mit einem Satzzeichen endet.
  const p = (frage: Frage, ampel: Ampel, satz: string, belege: Beleg[] = [], notiz = false): Punkt => ({
    frage, titel: t.fragen[frage], ampel, satz: satz.replace(/([.!?…])([“”])\./g, '$1$2'), belege: belege.slice(0, 3), quelle: 'regeln',
    ...(notiz ? { belegIstNotiz: true } : {}),
  });
  const punkte: Punkt[] = [];

  // Im ersten Schritt (seit 24.10.2026) kommt die KI noch: dann „gleich“, nicht „war nicht dabei“.
  const ohneKi = kiFolgt ? t.kiFolgt : t.nurMitKi;
  punkte.push(p('leistungen', 'offen', ohneKi));

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
  // Seit 24.10.2026: Wer am Handy auf der Startseite landet, will die Nummer
  // dort, oben oder im Fuß. Steht sie erst auf einer Unterseite, ist das Mühe.
  const startUrls = s.seiten.filter((x) => x.art === 'start' || x.art === 'rahmen').map((x) => x.url);
  const aufStart = (b: Beleg) => !startUrls.length || startUrls.includes(b.seite);
  const nummerAufStart = [...s.telefonKlickbar, ...s.telefonImText, ...s.whatsapp].some(aufStart);
  if (tel && !nummerAufStart) {
    const art = s.seiten.find((x) => x.url === s.telefonKlickbar[0].seite)?.art ?? '';
    const seite = zitat({ seite: '', text: t.seitennamen[art] ?? art }, sprache);
    punkte.push(p('erreichen', 'gelb', [t.telAntippbar + t.nichtAufStart(seite), wa ? t.whatsappAuch : ''].filter(Boolean).join(' '), [...s.telefonKlickbar, ...s.whatsapp], true));
  } else if (tel || wa) {
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
  // Seit 24.10.2026: Formular per Skript oder Baukasten, dann nie rot.
  else if (s.jsFormulare.length) punkte.push({ ...p('anfragen', 'gelb', t.jsFormular(s.jsFormulare[0].text), s.jsFormulare, true), vorbehalt: true });
  else if (tel || s.telefonImText.length || s.emailKlickbar.length || s.emailImText.length) {
    punkte.push({ ...p('anfragen', 'gelb', t.nurAnrufen + (s.baukasten ? t.baukastenVorbehalt(s.baukasten) : '')), ...(s.baukasten ? { vorbehalt: true } : {}) });
  } else if (s.baukasten) punkte.push({ ...p('anfragen', 'gelb', t.keinWegQuelltext + t.baukastenVorbehalt(s.baukasten)), vorbehalt: true });
  else punkte.push(p('anfragen', 'rot', t.keinWeg));

  const draussen = s.anschrift.filter((b) => !istImpressum(b, s));
  if (draussen.length) punkte.push(p('ort', 'gruen', t.anschrift(z(draussen[0])), draussen));
  else if (s.strukturiert.mitAnschrift) punkte.push(p('ort', 'gruen', t.anschriftDaten));
  else if (s.anschrift.length) punkte.push(p('ort', 'gelb', t.anschriftImpressum(z(s.anschrift[0])), s.anschrift));
  else punkte.push(p('ort', 'rot', t.anschriftKeine));

  // Vertrauen ohne KI (24.10.2026): Bewertungen, Sterne und Nachweise sind
  // grün, „seit 1987“ oder „Referenzen“ nur ein Hinweis. Bilder sieht hier
  // niemand, deshalb ohne Fund weiter „nur mit KI“.
  const portale = [...new Set(s.bewertungen.map((b) => b.text.split(':')[0]))];
  if (s.bewertungen.length) punkte.push(p('vertrauen', 'gruen', t.vertrauenBewertung(portale.join(', ')), s.bewertungen, true));
  else if (s.sterne) punkte.push(p('vertrauen', 'gruen', t.vertrauenSterne));
  else if (s.nachweise.length) punkte.push(p('vertrauen', 'gruen', t.vertrauenNachweis(z(s.nachweise[0])), s.nachweise));
  else if (s.vertrauensHinweise.length) punkte.push(p('vertrauen', 'gelb', t.vertrauenHinweis(z(s.vertrauensHinweise[0])), s.vertrauensHinweise));
  else punkte.push(p('vertrauen', 'offen', ohneKi));
  return punkte;
}

const VON_STATUS: Record<'gefunden' | 'teilweise' | 'nicht_gefunden', Ampel> = { gefunden: 'gruen', teilweise: 'gelb', nicht_gefunden: 'rot' };
// „Passt nicht“ ist nur bei diesen Fragen erlaubt (Software, Online-Shop).
const KANN_NICHT_PASSEN: Frage[] = ['zeiten', 'ort', 'anfragen'];

function zusammen(regel: Punkt, ki: KiAntwort | undefined, kiLief: boolean, t: Texte): Punkt {
  if (!ki) {
    // Die KI lief, hat zu dieser Frage aber nichts gesagt: dann nicht „nur mit KI“ behaupten.
    return kiLief && regel.ampel === 'offen' && (regel.frage === 'leistungen' || regel.frage === 'vertrauen') ? { ...regel, satz: t.kiOhneAntwort } : regel;
  }
  if (ki.status === 'passt_nicht') {
    return KANN_NICHT_PASSEN.includes(regel.frage)
      ? { ...regel, ampel: 'offen', satz: ki.antwort, belege: [], quelle: 'ki', passtNicht: true }
      : { ...regel, widerspruch: 'KI sagt passt_nicht, bei dieser Frage nicht erlaubt' };
  }
  const kiAmpel = VON_STATUS[ki.status];
  const kiBeleg: Beleg[] = ki.belegt ? [{ seite: ki.seite, text: ki.zitat }] : [];
  const kiPunkt: Punkt = { ...regel, ampel: kiAmpel, satz: ki.antwort, belege: kiBeleg, quelle: 'ki', belegIstNotiz: false };

  // Vertrauen mit Regel-Fund (24.10.2026): Die KI darf nur verbessern, mit
  // belegtem Zitat. Sieht sie weniger, gilt die Regel, und es geht ins Protokoll.
  if (regel.frage === 'vertrauen' && regel.ampel !== 'offen') {
    const rang = { rot: 0, offen: 0, gelb: 1, gruen: 2 } as const;
    if (ki.belegt && rang[kiAmpel] >= rang[regel.ampel]) return kiPunkt;
    return { ...regel, widerspruch: ki.belegt || ki.status === 'nicht_gefunden' ? `Regel ${regel.ampel}, KI ${kiAmpel}` : `KI sagt ${ki.status}, Zitat nicht im Material` };
  }
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
  // Die Regel weiß, dass sie wegen JavaScript etwas übersehen kann; die KI liest dasselbe Material.
  if (regel.vorbehalt && kiAmpel === 'rot') return { ...regel, widerspruch: 'KI rot, Regel gelb (Vorbehalt JavaScript)' };
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

/** Der Ort aus der ersten gefundenen Anschrift („…, 49393 Lohne (Oldenburg)“ → „Lohne“). */
export function ortAusAnschrift(s: Signale): string | undefined {
  const ort = s.anschrift[0]?.text.match(/(?:\b\d{5}|\b\d{2}-\d{3}|\b[1-9]\d{3})\s+([A-ZÄÖÜŁŚŻŹĆ][\wäöüßąćęłńóśźż.-]+)/)?.[1];
  return ort && ort.length > 2 ? ort : undefined;
}

// Ab hier wird es am Handy spürbar (24.10.2026). Bewusst großzügig: Nur der
// Quelltext ohne Bilder zählt, und viele Baukästen liegen bei 300 bis 600 KB.
const HANDY_SCHWER_BYTES = 1_000_000;
const HANDY_VIELE_SKRIPTE = 25;

/** Station „Auf dem Handy“: viewport da, keine feste Breite, Zoom frei, nicht zu schwer. */
function handy(s: Signale, t: Texte): EindruckPunkt {
  const basis = { thema: 'handy' as const, titel: t.handyTitel, kurz: t.handyKurz };
  if (!s.handyAnsicht) return { ...basis, ampel: 'rot', text: t.handyNein };
  const beleg = { text: t.handyBeleg, seite: s.adresse ?? s.eingabe, notiz: true };
  // Bei Feste Breite und Zoom-Sperre steht der Wert dabei, damit man die Stelle findet.
  const mitWert = { ...beleg, text: `${t.handyBeleg}: ${s.handy?.viewport ?? ''}` };
  if (s.handy?.festeBreite) return { ...basis, ampel: 'rot', text: t.handyFesteBreite, beleg: mitWert };
  const mb = s.handy && s.handy.bytes >= HANDY_SCHWER_BYTES ? (s.handy.bytes / 1_000_000).toFixed(1).replace('.', ',') : '';
  const zusatz = [
    s.handy?.zoomGesperrt ? t.handyZoom : '',
    mb ? t.handySchwer(mb) : '',
    s.handy && s.handy.skripte >= HANDY_VIELE_SKRIPTE ? t.handySkripte(s.handy.skripte) : '',
  ].join('');
  return { ...basis, ampel: zusatz ? 'gelb' : 'gruen', text: t.handyGut + zusatz, beleg: s.handy?.zoomGesperrt ? mitWert : beleg };
}

/** Gepflegt? © im Fuß und, seit 24.10.2026, die neueste Meldung. Alt heißt: zwei Jahre oder mehr. */
function aktualitaet(s: Signale, t: Texte): EindruckPunkt[] {
  const jetzt = new Date();
  const fussAlt = !!s.jahrImFuss && jetzt.getFullYear() - s.jahrImFuss >= 2;
  const meldung = s.neuesteMeldung ? new Date(`${s.neuesteMeldung}T00:00:00Z`) : undefined;
  const meldungAlt = !!meldung && jetzt.getTime() - meldung.getTime() >= 2 * 365 * 864e5;
  const wann = meldung ? `${t.monate[meldung.getUTCMonth()]} ${meldung.getUTCFullYear()}` : '';
  const basis = { thema: 'aktualitaet' as const, titel: t.aktuellTitel, kurz: s.jahrImFuss ? t.aktuellKurz(s.jahrImFuss) : t.meldungKurz(wann) };
  if (!s.jahrImFuss && !meldung) return [];
  if (fussAlt) return [{ ...basis, ampel: 'gelb', text: t.aktuellAlt(s.jahrImFuss!) + (meldungAlt ? t.meldungAuchAlt(wann) : '') }];
  if (meldungAlt) return [{ ...basis, ampel: 'gelb', text: t.meldungAlt(wann) }];
  return [{ ...basis, ampel: 'gruen', text: s.jahrImFuss ? t.aktuellGut(s.jahrImFuss) : t.meldungGut(wann) }];
}

/**
 * „Passt alles zusammen?“ (24.10.2026): Telefon-Links, die eine andere
 * Nummer zeigen, als sie wählen, und schema.org gegen die Seite (Nummer,
 * PLZ, Uhrzeiten). Verglichen wird nur, wenn beide Seiten etwas haben.
 */
function widersprueche(s: Signale, t: Texte): EindruckPunkt[] {
  const basis = { thema: 'widersprueche' as const, titel: t.widerspruchTitel, kurz: t.widerspruchKurz };
  const saetze: string[] = [];
  const belege: string[] = [];
  if (s.falscheTelLinks.length) {
    saetze.push(t.telLinkFalsch);
    belege.push(...s.falscheTelLinks.map((b) => b.text));
  }
  const w = s.schemaWerte;
  let verglichen = false;
  if (w.telefone.length && s.nummernKerne.length) {
    verglichen = true;
    const fremd = w.telefone.find((n) => !s.nummernKerne.includes(nummerKern(n)));
    if (fremd) saetze.push(t.schemaTelFremd(fremd));
  }
  if (w.plz.length && s.plzAufSeite.length) {
    verglichen = true;
    const fremd = w.plz.find((p) => !s.plzAufSeite.includes(p));
    if (fremd) saetze.push(t.schemaPlzFremd(fremd, s.plzAufSeite.slice(0, 2).join(t.und)));
  }
  const seitenZeiten = s.oeffnungszeiten.flatMap((b) => uhrzeiten(b.text));
  if (w.zeiten.length && seitenZeiten.length) {
    verglichen = true;
    if (!w.zeiten.some((z) => seitenZeiten.includes(z))) saetze.push(t.schemaZeitenFremd(w.zeiten.slice(0, 4).join(', ')));
  }
  if (saetze.length) return [{ ...basis, ampel: 'gelb', text: saetze.join(' '), ...(belege.length ? { belege } : {}) }];
  return verglichen ? [{ ...basis, ampel: 'gruen', text: t.widerspruchGut }] : [];
}

/**
 * ortPruefen: nur mit KI und nur, wenn sie die Frage „Wo seid ihr?“ nicht als
 * unpassend markiert hat. Eine Anschrift steht in jedem Impressum, auch bei
 * Software für ganz Deutschland (Probe 22.10.2026, Seite eines Softwareanbieters).
 */
function ersterEindruck(s: Signale, sprache: Sprache, ortPruefen = false): EindruckPunkt[] {
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
  // SEO-Grundlagen (22.10.2026): Ort aus der Anschrift im Titel oder in der
  // Beschreibung, und eine Hauptüberschrift. Beides macht Grün zu Gelb und
  // hängt einen Satz an, mehr nicht.
  const ort = ortPruefen ? ortAusAnschrift(s) : undefined;
  const ohneOrt = ort && !`${titel} ${beschreibung}`.toLowerCase().includes(ort.toLowerCase()) ? t.googleOhneOrt(ort) : '';
  const ohneH1 = s.hauptueberschrift === false ? t.googleOhneH1 : '';
  // Seit 24.10.2026: Haben alle gelesenen Seiten (mindestens drei) dieselbe
  // Überschrift, und passt die Länge der Beschreibung?
  const seitenTitel = s.seiten.filter((x) => x.art !== 'rahmen').map((x) => x.titel?.trim().toLowerCase() ?? '');
  const alleGleich = seitenTitel.length >= 3 && seitenTitel[0] !== '' && seitenTitel.every((x) => x === seitenTitel[0]) ? t.titelGleich(seitenTitel.length) : '';
  const laenge = beschreibung.length > 170 ? t.beschreibungLang(beschreibung.length) : beschreibung && beschreibung.length < 40 ? t.beschreibungKurz : '';
  const zusatz = ohneOrt + ohneH1 + alleGleich + laenge;
  if (titelLeer) liste.push(g('rot', (titel ? t.googleLeer(titel) : t.googleOhneTitel) + ohneH1 + alleGleich));
  else if (titelVornLeer) liste.push(g('gelb', t.googleVornLeer(teile[0]) + ohneBeschreibung + zusatz));
  else if (!beschreibung) liste.push(g('gelb', t.googlePasst + ohneBeschreibung + zusatz));
  else if (titel.length > 65) liste.push(g('gelb', t.googleLang(titel.length) + zusatz));
  else if (zusatz) liste.push(g('gelb', t.googlePasst + zusatz));
  else liste.push(g('gruen', t.googleGut));

  liste.push(handy(s, t));

  // Vorschau beim Teilen (24.10.2026). Ohne og:image zeigt WhatsApp kein Bild.
  if (s.vorschau) {
    liste.push(s.vorschau.bild
      ? { thema: 'vorschau', titel: t.vorschauTitel, kurz: t.vorschauKurz, ampel: 'gruen', text: t.vorschauGut }
      : { thema: 'vorschau', titel: t.vorschauTitel, kurz: t.vorschauKurz, ampel: 'gelb', text: t.vorschauOhneBild });
  }

  // Bilder (24.10.2026): ohne alt ab drei Bildern und einem Drittel, Bildagenturen sanft.
  const b = s.bilder;
  if (b.gesamt) {
    const ohneAlt = b.gesamt >= 3 && b.ohneAlt / b.gesamt >= 1 / 3 ? t.bilderOhneAlt(b.ohneAlt, b.gesamt) : '';
    const stock = b.stockZahl ? t.bilderStock(b.stockZahl) : '';
    const text = [ohneAlt, stock].filter(Boolean).join(' ');
    liste.push(text
      ? { thema: 'bilder', titel: t.bilderTitel, kurz: t.bilderKurz, ampel: 'gelb', text, ...(b.stock.length ? { belege: b.stock.map((x) => x.text) } : {}) }
      : { thema: 'bilder', titel: t.bilderTitel, kurz: t.bilderKurz, ampel: 'gruen', text: t.bilderGut });
  }

  liste.push(...aktualitaet(s, t), ...widersprueche(s, t));

  // E-Mail (24.10.2026): Postfach zur eigenen Domain, sonst sanft der Freemailer.
  const mail = { thema: 'postfach' as const, titel: t.postfachTitel, kurz: t.postfachKurz };
  if (s.postfach) liste.push(s.postfach.mx ? { ...mail, ampel: 'gruen', text: t.postfachGut(s.postfach.domain) } : { ...mail, ampel: 'gelb', text: t.postfachFehlt(s.postfach.adresse, s.postfach.domain) });
  else if (s.freemail) liste.push({ ...mail, ampel: 'gelb', text: t.freemail(s.freemail) });

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
  if (s.sitemap === false) saetze.push({ ampel: 'gelb', text: t.sitemapFehlt });
  // Seit 24.10.2026. Nur loben, nie anmahnen: llms.txt ist ein junger
  // Vorschlag, keine große KI-Suche hat zugesagt, sie zu lesen.
  if (s.llmsTxt) saetze.push({ ampel: 'gruen', text: t.llmsTxt });
  if (s.robots.trainingGesperrt.length) saetze.push({ ampel: 'offen', text: t.training(s.robots.trainingGesperrt.join(', ')) });
  const ampel: Ampel = saetze.some((x) => x.ampel === 'rot') ? 'rot' : saetze.some((x) => x.ampel === 'gelb') ? 'gelb' : 'gruen';
  return { ampel, saetze };
}

/** Wie bei „Leistungen“: Ohne belegtes Zitat glauben wir „gefunden“ nicht. */
function branchenpunkt(b: NonNullable<KiBericht['branchenfrage']>, t: Texte): Branchenpunkt {
  if (b.status !== 'nicht_gefunden' && !b.belegt) return { frage: b.frage, ampel: 'offen', satz: t.kiOhneBeleg };
  return { frage: b.frage, ampel: VON_STATUS[b.status], satz: b.antwort, ...(b.belegt ? { beleg: { text: b.zitat, seite: b.seite } } : {}) };
}

/** kiFolgt: erster von zwei Schritten, die KI kommt gleich (so läuft es online auf galini-studio.de). */
export function bewerten(s: Signale, ki: KiBericht | undefined, sprache: Sprache, optionen: { kiFolgt?: boolean } = {}): Ergebnis {
  const punkte = nachRegeln(s, sprache, !ki && optionen.kiFolgt)
    .map((r) => lueckenBeachten(zusammen(r, ki?.antworten[r.frage], !!ki, T[sprache]), s, sprache));
  // Reihenfolge wie FRAGEN_SCHLUESSEL, falls jemand nachRegeln umstellt.
  punkte.sort((a, b) => FRAGEN_SCHLUESSEL.indexOf(a.frage) - FRAGEN_SCHLUESSEL.indexOf(b.frage));
  return {
    adresse: s.adresse ?? s.eingabe,
    punkte,
    eindruck: ersterEindruck(s, sprache, !!ki && ki.antworten.ort?.status !== 'passt_nicht' && ki.antworten.ort?.status !== undefined),
    lesbarkeit: lesbarkeit(s, sprache),
    ...(ki?.branchenfrage ? { branchenfrage: branchenpunkt(ki.branchenfrage, T[sprache]) } : {}),
    gefunden: punkte.filter((x) => x.ampel === 'gruen').length,
    zaehlbar: punkte.filter((x) => !x.passtNicht).length,
  };
}

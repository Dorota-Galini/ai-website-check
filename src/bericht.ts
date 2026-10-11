// KI-Check: was die Funktion an den Browser schickt. Angelegt am 10.10.2026.
// Die Seite (src/components/ki-check/) baut daraus Ansicht und Druckblatt.
// Bewusst ohne Signale, Material und interne Notizen: Der Besucher bekommt
// nur, was im Bericht steht.
import type { Signale } from './sammeln.ts';
import type { KiBericht } from './kunde.ts';
import type { Ampel, EindruckPunkt, Ergebnis, Lesbarkeit, Sprache } from './bewerten.ts';

/** gesperrt: Die robots.txt der Seite sperrt KI-Assistenten, deshalb ohne KI. */
export type KiStatus = 'ok' | 'pause' | 'limit' | 'fehler' | 'gesperrt';

export interface KiCheckBericht {
  sprache: Sprache;
  /** ISO-Zeit der Prüfung. */
  zeit: string;
  adresse: string;
  domain: string;
  /** Sprache der geprüften Seite (<html lang>), für lang an Zitaten. Fehlt, wenn die Seite keine angibt. */
  seitenSprache?: string;
  punkte: { frage: string; titel: string; ampel: Ampel; satz: string; passtNicht?: boolean; beleg?: { text: string; seite: string; notiz?: boolean } }[];
  gefunden: number;
  zaehlbar: number;
  eindruck: EindruckPunkt[];
  lesbarkeit: Lesbarkeit;
  ki: { branche: string; auftrag: string; eindruck: string; tipps: string[] } | null;
  kiStatus: KiStatus;
  /** Gelesene Seiten ohne die Startseite, als Seitenart (kontakt, preise …). */
  weitereSeiten: string[];
  nichtGelesen: string[];
}

export function berichtBauen(e: Ergebnis, s: Signale, ki: KiBericht | null, kiStatus: KiStatus, sprache: Sprache): KiCheckBericht {
  const adresse = s.adresse ?? s.eingabe;
  return {
    sprache,
    zeit: new Date().toISOString(),
    adresse,
    domain: adresse.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    ...(s.sprache ? { seitenSprache: s.sprache } : {}),
    punkte: e.punkte.map((p) => ({
      frage: p.frage,
      titel: p.titel,
      ampel: p.ampel,
      satz: p.satz,
      ...(p.passtNicht ? { passtNicht: true } : {}),
      ...(p.belege[0] ? { beleg: { text: p.belege[0].text, seite: p.belege[0].seite, ...(p.belegIstNotiz ? { notiz: true } : {}) } } : {}),
    })),
    gefunden: e.gefunden,
    zaehlbar: e.zaehlbar,
    eindruck: e.eindruck,
    lesbarkeit: e.lesbarkeit,
    ki: ki ? { branche: ki.branche, auftrag: ki.auftrag, eindruck: ki.eindruck, tipps: ki.tipps } : null,
    kiStatus,
    weitereSeiten: [...new Set(s.seiten.filter((x) => x.art !== 'start' && x.art !== 'rahmen').map((x) => x.art))],
    nichtGelesen: s.nichtGelesen.map((x) => x.art),
  };
}

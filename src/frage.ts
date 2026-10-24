// Die Kundenfrage für „Nennt die KI deinen Betrieb?“ (22.10.2026). Eigene
// Datei ohne SDK, weil sie auch im Browser läuft: Die Seite zeigt die Frage
// vor dem Klick, der Server stellt genau dieselbe (online auf galini-studio.de).
//
// Suchbegriff und Ort kommen aus der KI-Auswertung einer fremden Website.
// Seit der Sicherheitsprüfung vom 22.10.2026 (Fund 2) sind deshalb nur
// wenige Wörter aus Buchstaben erlaubt, keine Sätze, Ziffern, Punkte oder
// Schrägstriche. Dass sie auf der Seite auch vorkommen, prüft kunde.ts.

/** Nur Buchstaben, Ziffern und wenige Zeichen, höchstens 50 Zeichen. */
export function saeubern(t: string): string {
  return t.replace(/[^\p{L}\p{N} .&()/'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
}

/** Höchstens vier Wörter aus Buchstaben und Bindestrich; sonst null. */
export function suchbegriffPruefen(t: string): string | null {
  const s = t.replace(/\s+/g, ' ').trim();
  const woerter = s.split(' ');
  if (!s || s.length > 40 || woerter.length > 4) return null;
  return woerter.every((w) => /^\p{L}[\p{L}-]*$/u.test(w)) ? s : null;
}

/** Höchstens drei Wörter aus Buchstaben, Bindestrich und Klammern, etwa „Lohne (Oldenburg)“; sonst null. */
export function ortPruefen(t: string): string | null {
  const s = t.replace(/\s+/g, ' ').trim();
  if (!s || s.length > 40 || s.split(' ').length > 3) return null;
  return /^\p{L}[\p{L}() -]*$/u.test(s) ? s : null;
}

/** Die Kundenfrage in der Sprache der geprüften Website; null, wenn etwas fehlt oder nicht passt. */
export function frageBauen(sicht: { suchbegriff: string; ort: string }, seitenSprache?: string): string | null {
  const was = suchbegriffPruefen(sicht.suchbegriff);
  const wo = ortPruefen(sicht.ort);
  if (!was || was.length < 2 || !wo || wo.length < 2) return null;
  if (seitenSprache?.startsWith('pl')) return `${was} w ${wo} lub w okolicy: kogo możesz mi polecić?`;
  if (seitenSprache?.startsWith('en')) return `${was} in or near ${wo}: which providers can you recommend?`;
  return `${was} in ${wo} oder in der Nähe: Welche Anbieter kannst du mir empfehlen?`;
}

/**
 * Gegenprobe mit dem gelesenen Material: Ein Wort des Suchbegriffs (ab vier
 * Buchstaben, verglichen werden die ersten sechs) und der Ort (erstes Wort)
 * müssen auf der Website stehen. Sonst kommt die Frage womöglich nur aus
 * einer untergeschobenen Anweisung.
 */
export function aufSeiteBelegt(sicht: { suchbegriff: string; ort: string }, material: string): boolean {
  const m = material.toLowerCase();
  const stamm = (w: string) => w.toLowerCase().slice(0, Math.min(6, w.length));
  const was = sicht.suchbegriff.split(/\s+/).filter((w) => w.length >= 4).some((w) => m.includes(stamm(w)));
  const ortWort = sicht.ort.replace(/\(.*$/, '').trim().split(/\s+/)[0] ?? '';
  return was && ortWort.length >= 3 && m.includes(ortWort.toLowerCase());
}

# AI Website Check (KI-Check), deutsche Fassung der Anleitung

**Eine KI geht die Website eines kleinen Betriebs durch wie ein Kunde und muss jede Aussage mit einem Zitat belegen.**

Live: <https://galini-studio.de/ki-check/> · Polnisch: <https://galini-studio.de/pl/sprawdz-strone/>

Ein Kunde, der etwas erledigen will (Auto zur Inspektion, Dach reparieren), geht eine Website in einer typischen Reihenfolge durch. Finde ich euch bei Google? Kann ich die Seite am Handy lesen? Was macht ihr, was kostet das? Wann erreiche ich jemanden, kann ich die Nummer antippen? Wo seid ihr? Kann ich euch vertrauen? Kann ich anfragen?

Der KI-Check geht diese neun Stationen durch und zeigt, wo ein Kunde **hängen bleibt**. In unter einer Minute, mit Bericht als Seite und als PDF. Gebaut für kleine Betriebe in Deutschland, auf Deutsch und Polnisch, als kostenloses Werkzeug auf der Website eines kleinen Webstudios.

## Die wichtigste Regel: ohne Zitat keine Aussage

Sprachmodelle lesen eine unübersichtliche Betriebsseite gut und merken, was auch ein Mensch merken würde. Sie klingen aber auch sicher bei Dingen, die gar nicht dastehen. Deshalb ist die Arbeit geteilt:

1. **Sammeln, ohne KI** (`src/sammeln.ts`). Liest die Startseite und bis zu sechs Unterseiten so, wie viele KI-Assistenten sie sehen: den Quelltext ohne JavaScript. Dabei holt es die harten Fakten heraus: antippbare Nummern, WhatsApp, Formulare mit Feldzahl, Buchungsdienste, Zeiten, Preise, Anschrift, schema.org, robots.txt, kaputte Links und Reste aus Vorlagen.
2. **Lesen wie ein Kunde, mit KI** (`src/kunde.ts`). Claude bekommt den gesammelten Text und beantwortet sieben Kundenfragen in festem Format. **Jede Antwort muss die Seite wörtlich zitieren.** Der Server prüft jedes Zitat gegen das Material. Ohne geprüftes Zitat zählt die Antwort nicht.
3. **Entscheiden** (`src/bewerten.ts`). Zuerst die Regeln, dann die belegten KI-Antworten. Wo der Quelltext sicher ist (Formular, Buchung, antippbare Nummer), hat die Regel das letzte Wort. Immer „habe ich nicht gefunden“, nie „fehlt“.

## Funktioniert das?

Vor dem Start an 13 Seiten getestet, jedes Ergebnis von Hand geprüft (`docs/EVALUATION.md`, auf Englisch, ohne Betriebsnamen):

- Die Regeln allein lagen 62 von 65 Mal richtig.
- Zwei Runden mit KI: Kein erfundenes Zitat kam durch.
- Rund 7.700 Tokens rein und 1.200 raus je Seite, ein paar Cent je Prüfung.

## Vorsichtig gebaut

- Liest nur und schickt nie etwas ab.
- Hält sich an die robots.txt. Gesperrte Seiten liest er nicht. Sperrt die Datei KI-Assistenten, gibt es den Bericht ohne KI.
- Nur öffentliche Server, Grenzen für Zeit, Größe und Weiterleitungen.
- Ehrlich bei Lücken: Kam eine Seite nicht, steht das im Bericht.

## Ausprobieren

```bash
npm install
npx tsx src/cli.ts beispiel.de --lang de    # Bericht auf Deutsch (en ist Standard, pl Polnisch)
npm test
```

Ohne `ANTHROPIC_API_KEY` nur die festen Regeln (kostenlos), mit Schlüssel auch die KI.

## Als Werkzeug für Claude (MCP)

Der Check läuft auch als MCP-Server mit einem Werkzeug, `check_website` (Adresse, Sprache, KI an oder aus). Dann kann man Claude Desktop oder Claude Code einfach fragen: „Prüf beispiel.de wie ein Kunde.“ Wie man ihn einträgt, steht in der englischen Anleitung (`README.md`, Abschnitt „Use it from Claude (MCP)“). Bitte eine eigene Kennung mit Kontakt setzen (`KI_CHECK_KENNUNG`, siehe `.env.example`).

## Über mich

Dorota Mikolajczyk, Galini Studio in Lohne. Ich baue Websites und Automationen für kleine Betriebe, auf Deutsch und Polnisch. Der KI-Check ist mein kostenloser Türöffner. Gebaut mit Claude Code.

## Lizenz

PolyForm Noncommercial 1.0.0: lesen, ausprobieren, daraus lernen ja, gewerblich nutzen nein. Für gewerbliche Nutzung bitte fragen.

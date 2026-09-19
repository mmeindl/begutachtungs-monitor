/**
 * Der Schlüssel, unter dem eine Erläuterungspassage und eine Zeile der
 * Textgegenüberstellung denselben Paragraphen meinen
 * (docs/architecture.md §12.30).
 *
 * Geteilt, weil beide Seiten ihn bilden müssen: der Server, wenn er die
 * Passagen auflöst (`server/utils/explanationsJoin.ts`), und die Seite, wenn
 * sie sie zur gerenderten §-Gruppe nachschlägt. Zwei Fassungen desselben
 * Schlüssels wären zwei Gelegenheiten, dass sie auseinanderlaufen — und das
 * Ergebnis wäre kein Fehler, sondern eine Begründung, die schweigt.
 *
 * EIGENE NAMEN, mit Absicht. Es gibt im Haus schon zwei Bauteile derselben
 * Form: `tguOracle.paragraphKey(id, law)` und `annexCheck.annexParagraphKey(law,
 * para)`. Deren Kommentar sagt, warum sie verschieden heißen — „zwei
 * Funktionen desselben Namens und derselben Form, deren Argumente in
 * umgekehrter Reihenfolge stehen, ist genau das, was ein Auto-Import still
 * und falsch auflöst". Diese hier heißen deshalb wieder anders und stellen
 * das Gesetz nach vorn, wie der jüngere der beiden.
 */

/**
 * Bezeichnung → Nummer: „§ 54c." aus dem Gliederungssymbol der Beilage und
 * „§ 54c" aus einer Passagenüberschrift ergeben beide „54c".
 *
 * Dieselbe Form wie `tguOracle.paraIdOfGld`, das auf der anderen Seite der
 * Beilage dasselbe tut; es lebt in `server/utils` und ist von der Seite aus
 * nicht erreichbar. Null, wo kein Paragraph steht — eine Anlagenüberschrift
 * („Anlage 1 zu § 6 …") ist keine Paragraphenbezeichnung und trägt
 * ausgerechnet ein „§" mit sich, deshalb ist der Anker am Anfang die ganze
 * Regel.
 */
export function explanationParaId(designation: string | null): string | null {
  // Case-insensitive und danach kleingeschrieben: Beide Seiten des
  // Nachschlagens gehen durch diese Funktion, also entscheidet sie die
  // Schreibweise für beide — „§ 54c." und „§ 54C" dürfen nicht zwei
  // verschiedene Paragraphen sein.
  const m = /^\s*§+\s*(\d+[a-z]*)\b/i.exec(designation ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/** Gesetz und Paragraph als ein Schlüssel. Das leere Gesetz ist ein echter Wert. */
export function explanationKey(law: string | null, paraId: string): string {
  return `${law ?? ''}#${paraId}`
}

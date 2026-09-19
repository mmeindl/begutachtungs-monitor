/**
 * Was von der eigenen konsolidierten Lesefassung angezeigt werden darf
 * (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, damit vitest es direkt ausführt.
 *
 * Hier steht eine einzige Entscheidung, und sie steht hier, weil sie eine
 * Entscheidung *ist*: Ein Paragraph, den die Engine erzeugt hat, geht nur
 * dann auf die Seite, wenn drei unabhängige Dinge zusammenkommen. Die
 * Lektion, aus der dieses Modul entstanden ist, ist Befund 0 derselben
 * Sektion — die urteilende Hälfte eines Prüfstands lag in `scripts/`, wurde
 * deshalb von keinem Typecheck und keinem Test erfasst, und meldete ein
 * Vierteljahr zu gute Zahlen.
 *
 * DIE DREI SIGNALE, und warum keines allein reicht:
 *
 *  1. **Keine Verweigerung.** Sagt verlässlich, dass die Engine *nichts*
 *     getan hat — und nichts darüber, ob das Getane richtig ist. Gemessen:
 *     von 261 geprüften Paragraphen wichen die 190 ohne Verweigerung mit
 *     exakt der Gesamtquote ab (12,6 %, 09.09.2026). Ein Tor, das „alles
 *     Unverweigerte" zeigt, veröffentlicht stille Fehler.
 *  2. **Plausibel** (`applyGuard.ts`). Umfang, Fugen, Marker, unerklärte
 *     Wörter — ein Filter am Rand, keine Verifikation. Er sieht per
 *     Konstruktion nicht, was falsch gelesen und dann konsequent angewendet
 *     wurde.
 *  3. **Vom Anhang bestätigt** (`tguOracle.ts`). Das einzige unabhängige
 *     Signal: die Textgegenüberstellung des Ressorts, am ersten Tag der
 *     Begutachtung geschrieben, ohne Kenntnis unserer Engine. Von 140
 *     plausiblen Paragraphen, zu denen der Anhang etwas sagt, widerspricht
 *     er 34 (24 %, Produktionspfad, 40 Entwürfe, 19.09.2026) — das ist der
 *     gemessene Preis dafür, ohne ihn zu veröffentlichen.
 *
 * Daraus folgt die unbequeme Eigenschaft dieses Tors, die auf die Seite
 * gehört und nicht in eine Fußnote: **Wo das Ressort keine lesbare
 * Gegenüberstellung veröffentlicht, zeigt diese Sektion nichts** — nicht,
 * weil die Engine dort schlechter wäre, sondern weil niemand widerspricht.
 * Die Deckung des Tors ist die Deckung des Anhangs (41 % der Paragraphen mit
 * Anhang, 0 % ohne, per Konstruktion).
 */

import type { Instruction } from './lawApply'
import type { ConsolidatedWithheldCause } from '../../shared/types'

/**
 * Warum ein erzeugter Paragraph nicht angezeigt wird.
 *
 * - `verweigert` — mindestens eine Anweisung an diesem § ließ sich nicht
 *   sicher ausführen.
 * - `nicht-geladen` — unsere eigene Obergrenze, nicht das Urteil der Engine:
 *   Ein Sammelgesetz nennt mehr Gesetze und Paragraphen, als eine Seite laden
 *   darf. Ein eigener Grund, weil die Bilanz unter der Liste sonst unsere
 *   Grenze als Verweigerung der Engine ausgäbe — und das ist dieselbe
 *   Verwechslung, gegen die dieses ganze Modul geschrieben ist.
 * - `unplausibel` — das Ergebnis hat die Plausibilitätssignale nicht bestanden.
 * - `kein-anhang` — der Entwurf trägt keine lesbare Textgegenüberstellung.
 * - `anhang-schweigt` — es gibt eine, aber zu diesem § sagt sie nichts Prüfbares.
 * - `anhang-widerspricht` — sie widerspricht dem Ergebnis der Engine.
 */
export type WithholdCause = ConsolidatedWithheldCause

/**
 * Die Sätze, die auf der Seite stehen. Kein „Fehler", kein „ungeprüft":
 * Jeder benennt, WER hier nicht mitspielt — wir, oder das Dokument des
 * Ressorts. Der Leser kann das unterscheiden, und es ist nicht dasselbe.
 */
export const WITHHOLD_LABEL: Record<WithholdCause, string> = {
  'verweigert': 'Eine Anweisung ließ sich nicht sicher anwenden',
  'nicht-geladen': 'Der Entwurf ändert mehr Paragraphen, als wir für eine Seite laden',
  'unplausibel': 'Das Ergebnis hat unsere Plausibilitätsprüfung nicht bestanden',
  'kein-anhang': 'Keine lesbare Textgegenüberstellung, an der wir das Ergebnis prüfen könnten',
  'anhang-schweigt': 'Die Textgegenüberstellung sagt zu diesem Paragraphen nichts Prüfbares',
  'anhang-widerspricht': 'Die Textgegenüberstellung des Ressorts widerspricht unserem Ergebnis',
}

/** Das Urteil des Anhangs, wie `tguOracle.oracleVerdict` es fällt, plus „es gibt keinen". */
export type GateOracle = 'bestätigt' | 'widersprochen' | 'stumm' | 'fremd' | 'kein Anhang'

export interface GateInput {
  /** Eine Anweisung an diesem § wurde verweigert (`lawApply`/`instructionsFromUnits`). */
  refused: boolean
  /** `applyGuard.guardParagraph().plausible` */
  plausible: boolean
  oracle: GateOracle
}

/**
 * Zeigen oder nicht — und wenn nicht, warum.
 *
 * Die Reihenfolge der Gründe ist die Reihenfolge der Verantwortung: zuerst,
 * was die Engine selbst zugibt (Verweigerung), dann, was unsere Signale
 * finden, erst danach das fremde Dokument. Ein Paragraph, den die Engine
 * verweigert hat UND dem der Anhang widerspricht, wird als verweigert
 * gezählt — sonst sähe die Statistik aus, als läge es am Ressort.
 */
export function gateParagraph({ refused, plausible, oracle }: GateInput): { show: boolean; cause: WithholdCause | null } {
  if (refused) return { show: false, cause: 'verweigert' }
  if (!plausible) return { show: false, cause: 'unplausibel' }
  if (oracle === 'bestätigt') return { show: true, cause: null }
  if (oracle === 'kein Anhang') return { show: false, cause: 'kein-anhang' }
  if (oracle === 'widersprochen') return { show: false, cause: 'anhang-widerspricht' }
  // „stumm" (der Anhang führt den § nicht) und „fremd" (seine geltende
  // Fassung steht so nicht im RIS-Text) sind für den Leser dasselbe: es gibt
  // hier keine zweite Meinung. Unterschieden werden sie im Prüfstand.
  return { show: false, cause: 'anhang-schweigt' }
}

/** Die Gründe als gezählte Liste, häufigster zuerst — die Reihenfolge der Anzeige. */
export function withheldSummary(causes: readonly WithholdCause[]): { cause: WithholdCause; label: string; count: number }[] {
  const tally = new Map<WithholdCause, number>()
  for (const c of causes) tally.set(c, (tally.get(c) ?? 0) + 1)
  return [...tally]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, count]) => ({ cause, label: WITHHOLD_LABEL[cause], count }))
}


// ---------------------------------------------------------------------------
// Die Bezugsgröße der Anzeige
// ---------------------------------------------------------------------------

/**
 * Die Nummer aus einer Paragraphenbezeichnung: „§ 285b." → „285b".
 */
export function paraId(label: string): string | null {
  return /(\d+[a-z]*(?:\.\d+)?)/.exec(label)?.[1] ?? null
}

/**
 * §-Reihenfolge, wie das Gesetz sie druckt: § 22 vor § 197, § 285b vor
 * § 285c. Eine Zeichenkettensortierung stellt „§ 197" vor „§ 22" — auf einer
 * Seite, die Gesetzestext zeigt, liest sich das wie ein Defekt.
 */
export function byParagraphOrder(a: string, b: string): number {
  const num = (id: string): number => Number.parseInt(id, 10) || 0
  return num(a) - num(b) || a.localeCompare(b, 'de')
}

/**
 * Welche Paragraphen ein Artikel des Entwurfs anfasst — der **Nenner** der
 * Anzeige („gezeigt sind 32 von 61").
 *
 * Gezählt wird, bevor irgendetwas scheitern kann: aus den gelesenen
 * Anweisungen UND aus den verweigerten Zeilen. Eine Verweigerung ist gerade
 * kein Grund, den Paragraphen aus dem Nenner zu nehmen — sonst schrumpfte die
 * Bezugsgröße genau um das, was wir nicht können, und „12 von 12" stünde über
 * einer Liste, die die Hälfte des Entwurfs verschweigt.
 *
 * Eine Anweisung, die einen § *einfügt*, zählt mit: Er ist nach dem Entwurf
 * Teil des Gesetzes, auch wenn es ihn im geltenden Bestand nicht gibt.
 */
export function addressedParagraphs(
  instructions: readonly Instruction[],
  refusedLines: readonly string[],
): string[] {
  const out = new Set<string>()
  for (const { op, payload } of instructions) {
    const address = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    if (address?.para) {
      const id = paraId(address.para)
      if (id) out.add(id)
    }
    if ((op.kind === 'insertAfter' || op.kind === 'append') && op.child === 'para') {
      for (const p of payload) if (p.id) out.add(p.id)
    }
  }
  for (const line of refusedLines) {
    const id = /§+\s*(\d+[a-z]*)/.exec(line)?.[1]
    if (id) out.add(id)
  }
  return [...out].sort(byParagraphOrder)
}

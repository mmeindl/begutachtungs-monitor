/**
 * „Hat sich die Begründung geändert?" — der Vergleich der Erläuterungen,
 * Paragraph für Paragraph (docs/architecture.md §12.10b).
 *
 * PURE MODULE — relative imports only, damit vitest es direkt ausführt.
 * Die Nuxt-Seite steht in `reasoningDiffService.ts`.
 *
 * AM PARAGRAPHEN GERECHNET, AN DER ANORDNUNG GEZEIGT. Die Erläuterungen sind
 * nach Paragraphen gegliedert, die Gegenüberstellung nach
 * Novellierungsanordnungen — und mehrere Ziffern ändern regelmäßig denselben
 * Paragraphen (8/ME: 33 Anordnungen auf 17 Paragraphen, § 11 allein sechsmal).
 * Wer je Anordnung zählt, zählt dieselbe Begründung mehrfach und nennt das
 * Ergebnis dann „Paragraphen". Also: ein Vergleich je Paragraph in
 * `paragraphs`, und `units` sagt, welche Anordnung auf welchen zeigt — der
 * Schlüssel bleibt `unitKey`, wie bei den §-Namen (`paraTitleService.ts`),
 * damit kein zweiter Schlüssel entsteht, an dem Prüfung und Anzeige
 * auseinanderlaufen können.
 *
 * MEHRDEUTIGE NUMMERN BLEIBEN WEG. Eine Passage des Besonderen Teils trägt die
 * Nummer des Paragraphen, nicht sein Gesetz. In einem Sammelgesetz ändern zwei
 * Artikel aber je einen § 15 (8/ME: Staatsschutz- und Nachrichtendienst-Gesetz
 * und Bundesverwaltungsgerichtsgesetz), und beide Passagen liegen unter
 * derselben Nummer. Angezeigt würde dann die Begründung des einen Gesetzes
 * unter dem Paragraphen des anderen. Wo zwei Artikel dieselbe Nummer
 * adressieren, zeigt diese Schicht deshalb nichts — dieselbe Regel wie bei den
 * §-Namen: ein falscher Bezug ist schlechter als keiner.
 */
import type { LawDiffUnit, ReasoningDiffEntry } from '../../../shared/types'
import { unitKey } from '../../../shared/utils/diffKey'
import { diffTokens } from '../diff/wordDiff'
import { addressedParagraphOf } from '../lawtext/instructionAddress'
// The key of `passagesByParagraph`, and the same reading the page looks up
// with. Its `\b` changes nothing for the designations `parseAddress` builds:
// 0 of 4.215 differ over the offline corpus (22.09.2026). It bites only on a
// raw Gliederungssymbol such as § 365m1, which never reaches here.
import { explanationParaId } from '../../../shared/utils/explanationKey'

/** Unterhalb davon sind es Satzzeichen und Leerraum, keine Überarbeitung. */
const CHANGED_AT = 0.02
/** Ein Entwurf begründet selten mehr; die Schranke hält einen Ausreißer von der Seite fern. */
// Nicht exportiert: Die Auto-Imports von Nitro teilen einen Namensraum, und
// `MAX_PARAGRAPHS` gibt es in `annexCheck.ts` schon.
const MAX_PARAGRAPHS = 120

export interface ReasoningComparison {
  /** `unitKey` → „§ 11": welche Änderung auf welchen Paragraphen zeigt. */
  units: Record<string, string>
  /** „§ 11" → der Vergleich seiner Begründung, einmal je Paragraph. */
  paragraphs: Record<string, ReasoningDiffEntry>
  stats: { compared: number; changed: number }
}

/**
 * Die Paragraphennummern, die in mehr als einem Artikel des Entwurfs
 * vorkommen — siehe Kopf. Gerechnet über alle Einheiten, auch die
 * unveränderten: Ob eine Nummer zweimal vergeben ist, hängt nicht daran, was
 * sich zwischen den beiden Fassungen geändert hat.
 */
function ambiguousParagraphs(units: readonly LawDiffUnit[]): Set<string> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    if (!para) continue
    const seen = articles.get(para) ?? new Set<string>()
    seen.add(unit.article ?? '')
    articles.set(para, seen)
  }
  return new Set([...articles].filter(([, seen]) => seen.size > 1).map(([para]) => para))
}

/**
 * Der Vergleich, aus den Einheiten der Gegenüberstellung und den Passagen
 * beider Fassungen (Paragraphennummer → Text).
 *
 * Verglichen wird nur, wo BEIDE Seiten eine Begründung führen. Fehlt eine, ist
 * das keine geänderte Begründung, sondern eine Lücke im Dokument — und die als
 * „geändert" zu zeigen wäre falsch.
 */
export function compareReasoning(
  units: readonly LawDiffUnit[],
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): ReasoningComparison {
  const ambiguous = ambiguousParagraphs(units)
  const out: ReasoningComparison = { units: {}, paragraphs: {}, stats: { compared: 0, changed: 0 } }
  const skipped = new Set<string>()

  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    const id = explanationParaId(para)
    if (!para || !id || ambiguous.has(para) || skipped.has(para)) continue

    if (!out.paragraphs[para]) {
      if (Object.keys(out.paragraphs).length >= MAX_PARAGRAPHS) continue
      const a = before.get(id) ?? ''
      const b = after.get(id) ?? ''
      if (!a || !b) {
        skipped.add(para)
        continue
      }
      const { similarity, segments } = diffTokens(a, b)
      const drift = 1 - similarity
      const changed = drift >= CHANGED_AT
      out.paragraphs[para] = {
        paragraph: para,
        drift,
        changed,
        segments: changed ? segments : null,
        // Beide Fassungen im Ganzen, aber nur wo der Wortvergleich an seiner
        // Schranke abgebrochen hat: sonst stünde die aufgeklappte Begründung
        // leer da, weil `segments` fehlt (gesehen an § 11 und § 15 von 8/ME).
        // Dieselbe Form wie oben im Vergleich, wo dasselbe passieren kann.
        fromText: changed && !segments ? a : null,
        toText: changed && !segments ? b : null,
      }
    }
    out.units[unitKey(unit)] = para
  }

  const entries = Object.values(out.paragraphs)
  out.stats = { compared: entries.length, changed: entries.filter((e) => e.changed).length }
  return out
}

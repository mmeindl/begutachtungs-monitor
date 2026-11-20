/**
 * The § `/genauigkeit` walks through its steps (`WEG_BEISPIEL`) is typed
 * into the page, and its sentences are in the present tense: „Die Prüfung
 * ist bestanden", „Beim Entwurf 116/ME steht unter § 6a der ganze
 * Paragraph". The page's test holds the typed strings against each other
 * only; nothing held them against the draft's page.
 *
 * A measuring round asks that draft anyway (`accounting.ts`), so it holds
 * the telling against the answer (20.11.2026): the § is shown as a whole
 * paragraph, on the annex's confirmation and not on the second reading, with
 * exactly the change the page prints. A deviation is a failure of the
 * draft's report, and the builder refuses a round with failures.
 */
import type { ConsolidatedParagraph, LawDiffSegment } from '../../shared/types'
import { WEG_BEISPIEL } from '../../shared/utils/genauigkeit'

interface Example {
  para: string
  law: string
  result: readonly LawDiffSegment[]
}

/** What changes, in order, without the unchanged text around it (the page prints that shortened). */
const changed = (segments: readonly LawDiffSegment[]): string =>
  segments.filter((s) => s.type !== 'equal').map((s) => `${s.type}:${s.text.trim()}`).join('|')

/** Where the draft's answer does not carry the example as the page tells it, one sentence each. */
export function wegBeispielFailures(kons: { paragraphs: readonly ConsolidatedParagraph[] }, example: Example = WEG_BEISPIEL): string[] {
  const id = example.para.replace(/^§\s*/, '')
  const where = `beispiel: ${example.para} ${example.law}`
  const para = kons.paragraphs.find((p) => p.id === id && (p.annexLaw ?? '').includes(example.law))
  if (!para) return [`${where} ist nicht als ganzer Paragraph gezeigt, /genauigkeit sagt es`]
  const failures: string[] = []
  if (para.draftWitness?.length) failures.push(`${where} ist nach der zweiten Lesung gezeigt, /genauigkeit sagt „Die Prüfung ist bestanden"`)
  if (changed(para.segments) !== changed(example.result)) failures.push(`${where} zeigt eine andere Änderung als /genauigkeit: ${changed(para.segments)}`)
  return failures
}

/**
 * Die Erläuterungen, wie das **Parlament** sie veröffentlicht — Word-HTML
 * statt typisiertem RIS-XML (docs/architecture.md §12.10).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * WOZU EIN ZWEITER LESER. `explanations.ts` liest das RIS-XML des Entwurfs,
 * und für den Entwurf ist das die bessere Quelle: typisiert, benannte Teile,
 * keine Rateschritte. Die Erläuterungen der **Regierungsvorlage** gibt es
 * dort aber nicht — das RIS führt keine parlamentarischen Dokumente. Wer
 * fragen will, ob das Ressort seine Begründung zwischen Entwurf und Vorlage
 * geändert hat, braucht beide Seiten, und die einzige Quelle, die beide
 * Seiten führt, ist das Parlament.
 *
 * **Deshalb liest dieser Parser BEIDE Seiten, auch den Entwurf.** Ein
 * Vergleich XML gegen Word-HTML misst zuerst die beiden Konverter und erst
 * danach den Inhalt — dieselbe Lehre wie bei der Textgegenüberstellung
 * (§12.12, sechste Messung). Gleiche Quelle, gleicher Parser, und was übrig
 * bleibt, ist die Änderung.
 *
 * **Die Adresse einer Passage kommt aus `explanations.ts`** (`addressOf`,
 * `isAddressHeading`) und wird hier nicht zum zweiten Mal erfunden: „Zu Z 4
 * (§ 54c Abs. 1a und 1b):" muss auf beiden Seiten denselben Paragraphen
 * bedeuten, sonst hängt die Begründung am falschen §.
 */
import { addressOf, isAddressHeading } from './explanations'
import { normalizeText } from './lawtext/normalize'
import { parseParliamentHtml } from './lawtext/parliamentHtml'
// One reading of a designation for both sides of the lookup. Its `\b` changes
// nothing for what `addressOf` builds: 0 of 4.215 designations differ over the
// offline corpus (22.09.2026).
import { explanationParaId } from '../../shared/utils/explanationKey'

/** Eine Passage des Besonderen Teils, an ihrer Adresse. */
export interface HtmlPassage {
  /** Die Überschrift, wie das Ressort sie gedruckt hat. */
  heading: string
  /** „§ 54c" — die Paragraphen, die die Überschrift nennt. */
  paragraphs: string[]
  /** Die Absätze der Passage, in Druckreihenfolge. */
  text: string[]
}

export interface HtmlExplanations {
  /** Der Allgemeine Teil, Absatz für Absatz. */
  general: string[]
  /** Die Passagen des Besonderen Teils. */
  special: HtmlPassage[]
}

/**
 * „B e s o n d e r e r  T e i l" — gesperrt gesetzte Überschriften sind in
 * diesen Dokumenten die Regel, und zwischen den Buchstaben steht Typografie,
 * kein Text (§12.29). Verglichen wird deshalb ohne Leerzeichen.
 */
function partKind(text: string): 'general' | 'special' | null {
  const flat = normalizeText(text).replace(/\s+/g, '').toLowerCase().replace(/[:.]+$/, '')
  if (/^besondererteil/.test(flat)) return 'special'
  if (/^allgemeinerteil/.test(flat)) return 'general'
  return null
}

/**
 * Ein Erläuterungen-Dokument des Parlaments, geteilt in Allgemeinen Teil und
 * die Passagen des Besonderen Teils.
 *
 * Ohne eigene Überschrift „Besonderer Teil" beginnt der besondere Teil bei
 * der ersten Adressüberschrift — ein Fünftel der Dokumente macht es so
 * (`explanations.ts`, derselbe Befund am XML).
 */
export function parseExplanationsHtml(html: string): HtmlExplanations {
  const general: string[] = []
  const special: HtmlPassage[] = []
  let inSpecial = false
  let current: HtmlPassage | null = null

  for (const block of parseParliamentHtml(html)) {
    const text = normalizeText(block.text).trim()
    if (!text) continue

    const part = partKind(text)
    if (part) {
      inSpecial = part === 'special'
      current = null
      continue
    }

    if (isAddressHeading(text)) {
      current = { heading: text, paragraphs: addressOf(text).paragraphs, text: [] }
      special.push(current)
      inSpecial = true
      continue
    }

    if (inSpecial && current) current.text.push(text)
    else if (!inSpecial) general.push(text)
    // Ein Absatz im besonderen Teil, der unter keiner Adresse steht, gehört
    // keinem Paragraphen — er wird nicht dem zuletzt gesehenen zugeschlagen.
  }
  return { general, special }
}

/** Die Passagen unter „§ 54c" → ihrer Nummer, wie `shared/utils/explanationKey` sie bildet. */
export function passagesByParagraph(doc: HtmlExplanations): Map<string, HtmlPassage[]> {
  const out = new Map<string, HtmlPassage[]>()
  for (const passage of doc.special) {
    for (const para of passage.paragraphs) {
      const id = explanationParaId(para)
      if (!id) continue
      out.set(id, [...(out.get(id) ?? []), passage])
    }
  }
  return out
}

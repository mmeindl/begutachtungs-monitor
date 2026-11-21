/**
 * What a law-text reader leaves out of a document (21.11.2026): the words of
 * the document's body that no block the reader returns carries
 * (`station.ts --zensus`).
 *
 * PURE MODULE — relative imports only.
 *
 * The unit census (`unitCensus.ts`) counts instruction lines, by its scope.
 * A reader that drops a paragraph outside its pattern — Parliament's reader
 * takes only classed `<p>` (`parliamentHtml.ts`), RIS's only its block
 * elements (`risXml.ts`) — loses it on both sides of a comparison, and no
 * comparison can show it. This holds the blocks against the body word by
 * word, in order: every body word a block still owes is consumed, the rest
 * is lost, and consecutive lost words are one run to read.
 *
 * The body is what the reader is meant to read: Parliament's from `<body>`
 * on, RIS's `nutzdaten` without the page header, footer and layout data the
 * reader drops on purpose, an image named as the reader names it. What
 * stays lost beyond that is a document's title page, a table of contents
 * outside the classes, or law text.
 */
import { compareWords } from '../../server/utils/diff/wordDiff'
import { stripTags } from '../../server/utils/lawtext/normalize'
import { FIGURE_MARK } from '../../shared/utils/figureMark'

export interface ReaderLoss {
  /** Words of the body. */
  bodyWords: number
  /** Words of the blocks, text and Gliederungssymbol. */
  blockWords: number
  /** Body words no block carries. */
  lost: number
  /** The lost words as runs, longest first (at most `MAX_RUNS`). */
  runs: string[]
}

const MAX_RUNS = 12

/** The body of Parliament's Word HTML, as text. */
export function htmlBodyText(html: string): string {
  const at = html.search(/<body[^>]*>/i)
  return stripTags((at >= 0 ? html.slice(at) : html).replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' '))
}

/** The body of a RIS document, as text: its `nutzdaten`, without what `parseRisXml` drops on purpose. */
export function risBodyText(xml: string): string {
  const start = xml.indexOf('<nutzdaten')
  const end = xml.lastIndexOf('</nutzdaten>')
  const body = start >= 0 && end > start ? xml.slice(start, end) : xml
  return stripTags(
    body
      .replace(/<kzinhalt[\s\S]*?<\/kzinhalt>/g, ' ')
      .replace(/<fzinhalt[\s\S]*?<\/fzinhalt>/g, ' ')
      .replace(/<layoutdaten[\s\S]*?<\/layoutdaten>/g, ' ')
      .replace(/<binary\b[\s\S]*?<\/binary>/g, ` ${FIGURE_MARK} `)
      .replace(/<gdash\s*\/>/g, '-')
      .replace(/<nbsp\s*\/>/g, ' ')
      .replace(/<amp\s*\/>/g, '&amp;'),
  )
}

/** The body's words that no block carries, in order. */
export function readerLoss(body: string, blocks: readonly { text: string; gld: string | null }[]): ReaderLoss {
  const owed = new Map<string, number>()
  let blockWords = 0
  for (const b of blocks) {
    for (const w of compareWords(`${b.gld ?? ''} ${b.text}`)) {
      owed.set(w, (owed.get(w) ?? 0) + 1)
      blockWords++
    }
  }
  const words = compareWords(body)
  const runs: string[][] = []
  let run: string[] = []
  let lost = 0
  for (const w of words) {
    const n = owed.get(w) ?? 0
    if (n > 0) {
      owed.set(w, n - 1)
      if (run.length) runs.push(run)
      run = []
    } else {
      lost++
      run.push(w)
    }
  }
  if (run.length) runs.push(run)
  return {
    bodyWords: words.length,
    blockWords,
    lost,
    runs: runs.sort((a, b) => b.length - a.length).slice(0, MAX_RUNS).map((r) => r.join(' ')),
  }
}

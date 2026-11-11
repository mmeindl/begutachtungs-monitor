/**
 * WHICH EU act a Land's draft names in its own law text (04.11.2026).
 *
 * PURE MODULE — a PDF's page texts in, acts out; no Nitro globals, relative
 * imports only. The service (`landEuService.ts`) and the corpus script
 * (`scripts/corpus/euLaender.ts`) hand in the same pages.
 *
 * TWO READINGS OF ONE PART.
 *
 *  1. The blocks: `lawBlocksFromPdfPages` cuts the law text the way the
 *     Länder's § comparison does, and the Bund's reader takes them
 *     (`readUmsetzungshinweis`) — a § headed „Umsetzungshinweis", a sentence
 *     „Mit diesem Gesetz wird die Richtlinie … umgesetzt".
 *  2. The QUOTED HINT: a Novelle that adds an act to the hint in force does
 *     so as a quoted Ziffer — „15.2. In der Z 11 wird … folgende Z 12
 *     angefügt: „12. Richtlinie 2024/1385/EU zur Bekämpfung von Gewalt
 *     gegen Frauen …"" (Salzburg 34413), „Nach § 79a Z 10 wird eingefügt:
 *     „10a. Richtlinie (EU) 2019/1152 …"" (34550), „§ 1 Abs. 1 Z 6 lautet:
 *     „6. Art. 15 und 16 der Richtlinie (EU) 2018/2001 …"" (Oberösterreich
 *     16110, its EU-Begleitregelungs- und Umsetzungsgesetz). Neither a
 *     hint word nor „umgesetzt" stands in the block — the § the instruction
 *     names IS the hint, in the law in force — so the reader of (1) cannot
 *     see it, and nor can it read the part as plain text. What marks it is
 *     the form: a quoted, numbered Ziffer that OPENS with an EU act
 *     („<n>. Richtlinie …", „<n>. Art. … der Richtlinie …"). A national law
 *     lists bare acts as Ziffern only in its Umsetzungshinweis or in a list
 *     of its references; a quote that introduces its list as references
 *     („Dieses Gesetz verweist auf folgende Rechtsakte …") is skipped, and a
 *     bare Ziffer replacing one in such a list is the residual risk, read
 *     over the corpus.
 *
 * ONLY THE LAW TEXT. Oberösterreich prints its Erläuterungen before the law
 * in the same PDF, Salzburg, Burgenland and Wien after it — Burgenland and
 * Wien with a Vorblatt between, whose EU section reads „Es werden folgende
 * Rechtsakte … umgesetzt" — and prose must never become a law-text act. The
 * part runs from the promulgation clause („Der Oö. Landtag hat
 * beschlossen:", „… wird verordnet:"; `ENACTING_RE`, or the title „Gesetz
 * vom …" where a draft leaves the clause out, as the block reader takes
 * it) to the first line that opens what follows a law: the Erläuterungen'
 * title (`TITLE_RE`, `AFTER_LAW_RE`), a Textgegenüberstellung or a Vorblatt
 * (`END_RE`'s document markers — not its clauses, which open a law). The
 * blocks of (1) are cut from this part too: the block reader alone ends at
 * the Erläuterungen and reads a Vorblatt as law.
 */
import { uniqueActs, type EuAct } from './actCitations'
import { quotedHintSignal, quotedZiffern, readUmsetzungshinweis, strongestSignal, type LawSignal, type LawWindow, type QuotedHint } from './umsetzungshinweis'
import { AFTER_LAW_RE, ENACTING_RE, lawBlocksFromPdfPages, NOISE_RE } from '../laender/draftPdfLaw'
import { END_RE, TITLE_RE } from '../laender/landExplanations'

/** The title a draft carries where it leaves the promulgation clause out (`lawBlocksFromPdfPages`). */
const LAW_TITLE_RE = /^(?:Landes)?(?:[Gg]esetz|Verordnung)\s+vom\b/
/** `END_RE`'s clauses open a law; its other markers close one. */
const CLAUSE_RE = /hat (?:beschlossen|verordnet)/

function endsLaw(line: string): boolean {
  return TITLE_RE.test(line) || AFTER_LAW_RE.test(line) || (END_RE.test(line) && !CLAUSE_RE.test(line))
}

/**
 * The law text's lines — from the promulgation clause to what follows the
 * law — or null where the PDF has no clause and no title to start from.
 */
export function landLawPart(pages: readonly string[]): string[] | null {
  const lines = pages.flatMap((p) => p.split('\n')).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !NOISE_RE.test(l))
  const enacting = lines.findIndex((l) => ENACTING_RE.test(l))
  const start = enacting >= 0 ? enacting : lines.findIndex((l) => LAW_TITLE_RE.test(l))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && endsLaw(l))
  // The law's own title stands up to six lines above its clause; the block reader names an Artikel by it.
  return lines.slice(Math.max(0, start - 6), end < 0 ? lines.length : end)
}

/**
 * Every quoted Ziffer of the law text that opens with an EU act. `lines`
 * are the law text's (`landLawPart`). The Ziffern of each quote are read by
 * the reader the Bund shares (`quotedZiffern`): the acts of each with the
 * title references left out („Richtlinie 2024/1712/EU zur Änderung der
 * Richtlinie 2011/36/EU" names 2024/1712), a quote that introduces its list
 * as references skipped.
 */
export function quotedHints(lines: readonly string[]): QuotedHint[] {
  const text = lines.join('\n')
  return [...text.matchAll(/[„»]([^“«]{1,4000})[“«]/g)].flatMap((quote) => quotedZiffern(quote[1]!))
}

/** What a Land's law text says about EU law. */
export interface LandLawReading {
  /** The law text could be bounded and cut into blocks. */
  read: boolean
  signal: LawSignal | null
  /** The strongest signal of a window or quoted hint that names an act (`UmsetzungshinweisReading.actSignal`). */
  actSignal: LawSignal | null
  /** Every act named — the blocks' first, then the quoted hints'. */
  acts: EuAct[]
  windows: LawWindow[]
  /** The quoted hints found (`quotedHints`). */
  quoted: QuotedHint[]
  /** The acts only the quoted hints name. */
  quotedOnly: EuAct[]
}

/** The law text of a Land's draft PDF, read both ways. */
export function readLandLaw(pages: readonly string[]): LandLawReading {
  const part = landLawPart(pages)
  const blocks = part ? lawBlocksFromPdfPages([part.join('\n')]) : null
  if (!part || !blocks) return { read: false, signal: null, actSignal: null, acts: [], windows: [], quoted: [], quotedOnly: [] }
  const law = readUmsetzungshinweis(blocks)
  const quoted = quotedHints(part)
  const quotedActs = uniqueActs(quoted.map((q) => q.acts))
  const quotedOnly = quotedActs.filter((a) => !law.acts.some((b) => b.celex === a.celex))
  const quotedSignal = quotedHintSignal(quotedActs)
  return {
    read: true,
    signal: law.signal === 'umsetzung' || law.signal === 'durchfuehrung' ? law.signal : quotedSignal ?? law.signal,
    actSignal: strongestSignal([law.actSignal, quotedSignal].filter((k): k is LawSignal => k !== null)),
    acts: uniqueActs([law.acts, quotedActs]),
    windows: law.windows,
    quoted,
    quotedOnly,
  }
}

/**
 * A Land's draft against its Kundmachung, § by § (22.10.2026): the draft
 * from the Land's PDF (`draftPdfLaw`), the Kundmachung from the
 * Landesgesetzblatt's RIS XML, and the comparison the Bund's drafts use
 * (`diffLawUnits`). Measured before it was built — docs/architecture.md
 * §12.44.
 *
 * PURE MODULE — the PDF's pages and the XML come in as text.
 *
 * Two adjustments, both on the Land's path only:
 * - The Landesgesetzblatt sets its Artikel as `<ueberschrift typ="art">`,
 *   which the RIS parser does not map. The Bund's BGBl uses the same type in
 *   older documents; mapping it there too is a change to the federal engine
 *   and waits for its own measurement (annex drift baseline).
 * - Quote marks are dropped on both sides after the units are cut, and a
 *   compound split at a line end is closed up. The PDF has „§ 5 where the
 *   XML keeps the opening quote in an element the parser leaves out;
 *   compared as they come, every quoted § read as changed.
 */
import type { LawDiffUnit } from '#shared/types'
import { articlePairs, diffLawUnits } from '../diff/lawDiff'
import { parseLawUnitsFromRis, segmentUnits, type LawUnit } from '../lawtext/lawUnits'
import { lawBlocksFromPdfPages } from './draftPdfLaw'

const QUOTES_RE = /[„“”"»«]/g

/* Quotes out, and a compound split at a line end closed up again
   („Median- Entgelthöhe" in the XML): a hyphen, a space, a capital. „Land-
   und Forstwirtschaft" keeps its space — the next word is lower case. */
function clean(text: string): string {
  return text.replace(QUOTES_RE, '').replace(/(\p{L})- (?=\p{Lu})/gu, '$1-').replace(/\s+/g, ' ').trim()
}

function unquoted(units: LawUnit[]): LawUnit[] {
  return units.map((u) => ({ ...u, text: clean(u.text), blocks: u.blocks.map((b) => ({ ...b, text: clean(b.text) })) }))
}

/** The Kundmachung's units, from the Landesgesetzblatt's RIS XML. */
export function lgblUnits(xml: string): LawUnit[] {
  return parseLawUnitsFromRis(xml.replace(/<ueberschrift typ="art"/g, '<ueberschrift typ="g1"'))
}

/** The draft's units, from its PDF's pages; null where no legal text was found. */
export function landDraftUnits(pages: readonly string[]): LawUnit[] | null {
  const blocks = lawBlocksFromPdfPages(pages)
  return blocks ? segmentUnits(blocks) : null
}

export function diffLandDraft(draft: LawUnit[], kundmachung: LawUnit[]): LawDiffUnit[] {
  return diffLawUnits(unquoted(draft), unquoted(kundmachung))
}

/**
 * The Artikel only one side has: a law the Landtag added to the package
 * (16113, the Deregulierungsgesetz 2026: nine laws in the draft, fifteen in
 * the Landesgesetzblatt), or one it dropped. Paired as the comparison pairs
 * them (`articlePairs`), by title before number.
 */
export function packageChanges(draft: LawUnit[], kundmachung: LawUnit[]): { added: string[]; dropped: string[] } {
  const pairs = articlePairs(draft, kundmachung)
  const paired = new Set(pairs.map((p) => p.to).filter((a): a is string => a !== null))
  const added = [...new Set(kundmachung.map((u) => u.article).filter((a): a is string => a !== null && !paired.has(a)))]
  const dropped = pairs.filter((p) => p.from !== null && p.to === null).map((p) => p.from!)
  return { added, dropped }
}

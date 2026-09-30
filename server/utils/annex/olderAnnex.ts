/**
 * The Gegenüberstellung under an older name — „begtxt", „GGUe",
 * „Textüberstellung" — decided by what the document contains
 * (docs/architecture.md §12.13, „Die älteren Formen", 30.09.2026).
 *
 * PURE MODULE — relative imports only, so the harness runs the same decision
 * the request path does (`scripts/harness/annexPdf.ts`).
 *
 * The name picks the candidate (`pickOlderTextComparisons` in
 * `ris/risRecord.ts`), the content confirms it, and the confirmation is the
 * one the readers already stand on: the mandated header pair „Geltende
 * Fassung" / „Vorgeschlagene Fassung". The PDF reader refuses a document
 * without it anyway (`parseAnnexPdf`); the table reader does not — it falls
 * back on the row shape when the header is missing, which is right for a
 * document the ressort NAMED a Gegenüberstellung and not for one whose name
 * only says „maybe". So on the table path the header pair is asked for here.
 *
 * A candidate that fails is answered exactly as before the candidates
 * existed: as a record without a Gegenüberstellung. The one measured case is
 * a real annex the table reader cannot read — the Stabilitätsgesetz 2012
 * prints an empty spacer column before the two — and it keeps today's
 * answer rather than gaining a sentence about a document we did not read.
 */
import { printsHeaderPair, type ComparisonParse } from './comparisonRows'

/**
 * Is this read of an older-name document a Gegenüberstellung?
 *
 * `xml` is the document the table reader read; null on the PDF path, where
 * rows exist only if the parser found the header pair.
 */
export function holdsAsAnnex(parsed: ComparisonParse, readFrom: 'table' | 'pdf', xml: string | null): boolean {
  if (parsed.rows.length === 0) return false
  if (readFrom === 'pdf') return true
  return xml !== null && printsHeaderPair(xml)
}

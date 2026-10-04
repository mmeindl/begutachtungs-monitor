/**
 * The credit line under the § comparison (`LawDiffSection`): what it shows,
 * per document, and grouped by version — out of the component on
 * 04.10.2026, so the publisher tags can be pinned by a test.
 *
 * Who published each document, never the licence: what may be claimed hangs
 * on publisher and station and stands once, in the Impressum
 * (`#shared/utils/provenance`, 02.10.2026).
 */
import type { LawDiffResponse, LawStationId, Publisher, ReasoningDiffResponse, TraceLink } from '#shared/types'
import { LAW_STATION_LABEL, type LawStationPair } from '#shared/utils/lawStations'
import { documentSource, mixedPublishers, parliamentDocumentSource, PUBLISHER_NAME_DE, risSource, type SourceEntry } from '#shared/utils/provenance'

/** One compared version in the credit line: its name, its text, its Erläuterungen. */
export interface LawDiffCreditSide {
  station: LawStationId
  label: string
  text: TraceLink | null
  textTag: string
  reasoning: TraceLink | null
  reasoningTag: string
}

const REASONING_DE: Partial<Record<LawStationId, string>> = {
  me: 'Erläuterungen zum Ministerialentwurf',
  rv: 'Erläuterungen zur Regierungsvorlage',
}

/** A side's Erläuterungen for the credit line — only where the comparison of them ran. */
function reasoningDocFor(reasoning: ReasoningDiffResponse | null | undefined, station: LawStationId): TraceLink | null {
  /* The two Erläuterungen, one per side. The service sends them as
   * [Entwurf, Regierungsvorlage] (`reasoningDiffService`), and only where both
   * were found. */
  const docs = reasoning?.sources?.length === 2 ? reasoning.sources : null
  const stats = reasoning?.stats
  // Uncompared passages are text on the page too, so their documents are credited.
  if (!stats || stats.compared + (stats.uncompared ?? 0) === 0 || !docs) return null
  if (station === 'me') return docs[0] ?? null
  if (station === 'rv') return docs[1] ?? null
  return null
}

/**
 * `sources`: what this comparison shows, per document, for its credit line
 * (`#shared/utils/provenance`): each side's text where it was read, the
 * Erläuterungen where their comparison ran — those are always Parliament's
 * copies — and the § names from RIS (`namedCount`, the names on screen).
 *
 * `sides`: one entry per compared version: its name, its text, its
 * Erläuterungen — and, where the line mixes publishers, whose each is. The
 * Erläuterungen are always Parliament's copy, the text may be RIS's, so a
 * side whose two documents differ names the publisher at each link.
 */
export function lawDiffCredits(
  data: LawDiffResponse | null | undefined,
  reasoning: ReasoningDiffResponse | null | undefined,
  pair: LawStationPair,
  namedCount: number,
): { sources: SourceEntry[]; sides: LawDiffCreditSide[] } {
  const sources: SourceEntry[] = []
  if (data?.available) {
    for (const side of [{ station: pair.from, publisher: data.fromSource }, { station: pair.to, publisher: data.toSource }]) {
      if (side.publisher) sources.push(documentSource(LAW_STATION_LABEL[side.station], side.station, side.publisher))
      const reasoningName = REASONING_DE[side.station]
      if (reasoningName && reasoningDocFor(reasoning, side.station)) sources.push(parliamentDocumentSource(reasoningName, side.station))
    }
    if (namedCount) sources.push(risSource('Paragraphenüberschriften'))
  }

  if (!data) return { sources, sides: [] }
  const mixed = mixedPublishers(sources)
  const tag = (p: Publisher | null) => (mixed && p ? ` (${PUBLISHER_NAME_DE[p]})` : '')
  const sides = [
    { station: pair.from, text: data.fromDocument, textBy: data.fromSource },
    { station: pair.to, text: data.toDocument, textBy: data.toSource },
  ].flatMap(({ station, text, textBy }) => {
    const doc = reasoningDocFor(reasoning, station)
    if (!text && !doc) return []
    const by = [...new Set([text ? textBy : null, doc ? 'parlament' as const : null].filter((p) => p !== null))]
    const oneBy = by.length === 1 ? by[0]! : null
    return [{
      station,
      label: `${LAW_STATION_LABEL[station]}${tag(oneBy)}`,
      text,
      textTag: oneBy ? '' : tag(textBy),
      reasoning: doc,
      reasoningTag: oneBy ? '' : tag('parlament'),
    }]
  })
  return { sources, sides }
}

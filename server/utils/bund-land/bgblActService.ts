/**
 * A Grundsatzgesetz's Kundmachung from RIS — its record and the Frist
 * clause in its text. Nuxt-aware glue around
 * `bundesgesetzblatt.ts`.
 *
 * The record comes through the exact `Bgblnummer` search the § comparison's
 * BGBl station already caches (`fetchBgblByNumber`); the Frist clause from
 * the Kundmachung's HTML, one read per act; the sentence is kept as long
 * as a published document, since a Bundesgesetzblatt does not change.
 */
import { DERIVED_CACHE } from '../cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { fetchBgblByNumber } from '../ris/bgblService'
import { upstreamText, type UpstreamPolicy } from '../upstream/fetch'
import { bgblActOf, bgblCitationDe, fristClauseOf, type BgblAct } from './bundesgesetzblatt'
import type { BgblICitation as BgblCitation } from '../../../shared/types/bundLand'

const HTML_POLICY: UpstreamPolicy = { timeoutMs: 20_000, retries: 2, backoffMs: (attempt) => 600 * attempt, upstreamHostsOnly: true, maxBytes: 16 * 1024 * 1024 }

/** The act's record, or null where RIS knows no such Kundmachung. Throws where RIS does not answer. */
export const getBgblAct = defineCachedFunction(
  async (year: number, number: number): Promise<BgblAct | null> => {
    const result = await fetchBgblByNumber(bgblCitationDe({ year, number }))
    const refs = [result?.OgdDocumentResults?.OgdDocumentReference ?? []].flat()
    const act = refs.map(bgblActOf).find((a) => a && a.nummer === bgblCitationDe({ year, number })) ?? null
    return act
  },
  { name: 'bund-land-bgbl', base: DERIVED_CACHE, getKey: (year: number, number: number) => `${year}-${number}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** The record for a citation the reader found. */
export function bgblActFor(c: BgblCitation): Promise<BgblAct | null> {
  return getBgblAct(c.year, c.number)
}

/** The Frist clause of an act, verbatim, or null where it has none. Throws where RIS does not answer. */
export const getFristClause = defineCachedFunction(
  // Only the sentence is kept: the HTML (up to a megabyte for a Sammelgesetz) is read and dropped.
  async (html: string): Promise<string | null> => fristClauseOf(await upstreamText(html, HTML_POLICY)),
  { name: 'bund-land-frist', base: DERIVED_CACHE, getKey: (html: string) => html, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/**
 * A Land's Erläuterungen, as its draft page reads them (23.10.2026): from
 * the draft's PDF, or from a document of their own where the Land files
 * them so (Salzburg), parsed by `landExplanations.ts`. The reading itself
 * is `landExplanationsRead.ts` — free of Nitro, so the EU fact and the
 * corpus script share it; this file caches its answer for the page.
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { readLandExplanations } from './landExplanationsRead'
import { landPdfBytes } from './texts/read'
import { cachedPdfPages } from './texts/pdfPagesService'
import type { LandDraftRecord } from './texts/stations'

/**
 * The plain pages through the cached read: the comparison and the Begründungsvergleich read the same draft (`pdfPagesService.ts`).
 * Incomplete where the draft's PDF did not arrive (`draftFailed`): the entries that name only its Ziffern stand without their §§.
 */
export async function landExplanations(land: LandCode, detail: LandDraftRecord): Promise<Gathered<LandExplanationsResponse>> {
  const read = await readLandExplanations(land, detail, landPdfBytes, cachedPdfPages)
  return { value: read.response, complete: !read.draftFailed }
}

/**
 * Held a day in the derived layer: the documents stay, the reader may change.
 * An answer resting on a failed read of the draft is served, not held
 * (`onlyComplete`, as the Bund's `erlaeuterungen-me`): until 20.11.2026 it
 * was kept for the day.
 */
const readCachedLandExplanations = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftRecord): Promise<Gathered<LandExplanationsResponse>> => landExplanations(land, detail),
  { name: 'land-explanations-2', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false, validate: onlyComplete },
)

export async function cachedLandExplanations(land: LandCode, number: string, detail: LandDraftRecord): Promise<LandExplanationsResponse> {
  return (await readCachedLandExplanations(land, number, detail)).value
}

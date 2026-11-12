/**
 * A Land's Erläuterungen, as its draft page reads them (23.10.2026): from
 * the draft's PDF, or from a document of their own where the Land files
 * them so (Salzburg), parsed by `landExplanations.ts`. The reading itself
 * is `landExplanationsRead.ts` — free of Nitro, so the EU fact and the
 * corpus script share it; this file caches its answer for the page.
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { readLandExplanations } from './landExplanationsRead'
import { landPdfBytes } from './texts/read'
import { cachedPdfPages } from './texts/pdfPagesService'
import type { LandDraftRecord } from './texts/stations'

/** The plain pages through the cached read: the comparison and the Begründungsvergleich read the same draft (`pdfPagesService.ts`). */
export async function landExplanations(land: LandCode, detail: LandDraftRecord): Promise<LandExplanationsResponse> {
  return (await readLandExplanations(land, detail, landPdfBytes, cachedPdfPages)).response
}

/** Held a day in the derived layer: the documents stay, the reader may change. */
export const cachedLandExplanations = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftRecord): Promise<LandExplanationsResponse> => landExplanations(land, detail),
  { name: 'land-explanations', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

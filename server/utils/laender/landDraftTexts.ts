/**
 * What a Land's draft says, read once for every fact drawn from it: the
 * Erläuterungen' reading with the pages it opened, and the draft's own
 * text where that is a document of its own.
 *
 * TWO CALLERS, ONE READ. The EU fact (`eu/landEuService.ts`) and the Bund
 * fact (`bund-land/landBundesrechtService.ts`) read the same pages — the
 * draft page asks both endpoints after its first paint, the prewarm build
 * reads both facts of a draft one after the other. Neither PDF bytes nor
 * pages are cached anywhere else, so without this step each fact fetched
 * the Land's PDFs on its own — at one request a second where a Land's
 * firewall paces us. Here the read is held briefly: the promise while it
 * runs (two concurrent callers share it), the answer a few minutes after.
 *
 * SMALL ON PURPOSE. The pages of a draft are tens to hundreds of kB; the
 * memo holds a handful of drafts and drops them after minutes. It is not a
 * cache of the Länder's documents — the facts' own caches are
 * (`land-eu-recht`, `land-bundesrecht`).
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import type { LandEuInput } from '../eu/landEuReading'
import { readLandExplanations } from './landExplanationsRead'
import { pdfPages } from './texts/read'
import type { LandDraftRecord } from './texts/stations'

export interface LandDraftTexts {
  /** The Erläuterungen' answer, as their section reads them. */
  erl: LandExplanationsResponse
  /** What the facts read: the documents, the pages, the Erläuterungen' parts, the draft's text. */
  input: LandEuInput
  /** False where the draft's PDF was asked for and did not arrive — no fact from it is stored. */
  complete: boolean
}

/** How long a read is held after it arrived, and how many. */
const HOLD_MS = 5 * 60 * 1000
const HOLD_MAX = 8

const held = new Map<string, { at: number; read: Promise<LandDraftTexts> }>()

/** The key: the Land and the documents read, so a replaced document is a new read. */
function keyOf(land: LandCode, detail: LandDraftRecord): string {
  return `${land}|${detail.draft.documents.map((d) => d.url).sort().join(' ')}`
}

async function read(land: LandCode, detail: LandDraftRecord): Promise<LandDraftTexts> {
  const r = await readLandExplanations(land, detail)
  const erl = r.response
  // The draft's text: read with the Erläuterungen, or — where they could
  // not be parsed and the draft is a document of its own — now, once.
  let complete = !r.draftFailed
  let draftPages = r.draftUrl ? r.pages.get(r.draftUrl) ?? null : null
  if (r.draftUrl && !draftPages && !r.draftFailed) {
    draftPages = await pdfPages(r.draftUrl).catch(() => {
      complete = false
      return null
    })
  }
  return {
    erl,
    complete,
    input: {
      land,
      documents: detail.draft.documents.map((d) => ({ title: d.title, url: safeExternalUrl(d.url) ?? d.url })),
      pages: r.pages,
      explanations: { available: erl.available, general: erl.general, particular: erl.particular, url: erl.document?.url ?? null },
      draft: { url: r.draftUrl, pages: draftPages },
    },
  }
}

/**
 * The texts of one Land draft, shared by the facts drawn from it. A read
 * that throws is not held: the next caller asks again.
 */
export function readLandDraftTexts(land: LandCode, detail: LandDraftRecord, now: number = Date.now()): Promise<LandDraftTexts> {
  for (const [k, v] of held) if (now - v.at > HOLD_MS) held.delete(k)
  const key = keyOf(land, detail)
  const hit = held.get(key)
  if (hit) return hit.read
  const promise = read(land, detail)
  held.set(key, { at: now, read: promise })
  promise.catch(() => held.delete(key))
  while (held.size > HOLD_MAX) held.delete(held.keys().next().value!)
  return promise
}

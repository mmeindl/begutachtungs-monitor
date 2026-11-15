/**
 * The Commission's portal „Ihre Meinung zählt", paced and cached — the one
 * door to it (step 2 of the EU cycle; the reader is `haveYourSay.ts`).
 *
 * GENTLE BY CONSTRUCTION. The interface is undocumented, so every request
 * goes through one pacer: one at a time, 2.5 s apart, process-wide
 * (`SitePacer`, the Länder sites' pacer). A request that would wait longer
 * than twenty seconds for its turn gives up instead of queueing — a
 * crawler walking the act pages must not turn into a stream of requests
 * to the Commission. No retry (`PORTAL_POLICY`).
 *
 * ONLY WHAT WAS READ IS CACHED, never what arrived. The portal's record
 * names officials with their mail addresses; the caches below hold the
 * search's ids and the parsed initiative (`parseInitiative`'s fixed list
 * of fields), so no cache layer, on disk or in memory, ever holds a name.
 * A day: a closed period's facts do not change, an open one's count does.
 * A failure is thrown and so never cached.
 *
 * ON DEMAND, NO PREWARM. Only an act's page asks, for that act: at most
 * four requests (the search, and up to three initiatives to prove the
 * join), once a day per act. The plan's prewarm of every act of the map
 * (about 170 requests) is not built: nobody may ever open most of them.
 */
import type { EuConsultation, EuInitiative } from '../../../shared/types/eu'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { SitePacer } from '../laender/session'
import { upstreamJson } from '../upstream/fetch'
import { PORTAL_FIRST_YEAR, PORTAL_GAP_MS, PORTAL_MAX_WAIT_MS, PORTAL_POLICY, PORTAL_READER_VERSION, PORTAL_SEARCH_HITS, carriesReference, comReferenceOf, initiativeUrl, parseInitiative, parseSearch, searchUrl } from './haveYourSay'

const pacer = new SitePacer(PORTAL_GAP_MS, 0, PORTAL_MAX_WAIT_MS)

async function portalJson(url: string): Promise<unknown> {
  await pacer.turn()
  return upstreamJson<unknown>(url, PORTAL_POLICY)
}

/** The ids a search by COM number found — the ids only, a day. */
const searchCached = defineCachedFunction(
  async (comReference: string): Promise<number[]> => parseSearch(await portalJson(searchUrl(comReference))),
  { name: 'eu-portal-suche', getKey: (comReference: string) => `${comReference}|p${PORTAL_READER_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/** One initiative as the reader's fixed list of fields — a day. */
const initiativeCached = defineCachedFunction(
  async (id: number): Promise<EuInitiative> => parseInitiative(await portalJson(initiativeUrl(id))),
  { name: 'eu-portal-initiative', getKey: (id: number) => `${id}|p${PORTAL_READER_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * The consultation behind an act, by the COM number of its proposal — the
 * earliest proposal that has one. Never throws: what could not be read is
 * the state `ungelesen`, and each state is its own sentence on the page
 * (`EuConsultation`).
 */
export async function consultationOf(proposalReferences: readonly (string | null)[]): Promise<EuConsultation> {
  const com = proposalReferences.map(comReferenceOf).find((c) => c !== null) ?? null
  if (!com) return { state: 'kein-vorschlag' }
  if (com.year < PORTAL_FIRST_YEAR) return { state: 'vor-portal', reference: com.text }
  try {
    const ids = await searchCached(com.text)
    for (const id of ids.slice(0, PORTAL_SEARCH_HITS)) {
      const initiative = await initiativeCached(id)
      if (carriesReference(initiative, com.text)) return { state: 'gefunden', reference: com.text, initiative }
    }
    return { state: 'nicht-gefunden', reference: com.text }
  } catch {
    return { state: 'ungelesen', reference: com.text }
  }
}

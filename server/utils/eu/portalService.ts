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
 *
 * THE OPEN WINDOWS (step 3, 15.11.2026): one request a day for the list of
 * every initiative with an open window (one page of 100 held all 49), and
 * one per initiative page a reader opens. Nothing is stored beyond the
 * day's cache: a closed window is read again from the portal when its page
 * is asked, so the plan's fact store for once-open initiatives is not
 * built.
 */
import type { EuConsultation, EuInitiative } from '../../../shared/types/eu'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { SitePacer } from '../laender/session'
import { UpstreamHttpError, upstreamJson } from '../upstream/fetch'
import { PORTAL_FIRST_YEAR, PORTAL_GAP_MS, PORTAL_MAX_WAIT_MS, PORTAL_POLICY, PORTAL_READER_VERSION, PORTAL_SEARCH_HITS, carriesReference, comReferenceOf, initiativeUrl, parseInitiative, parseSearch, readOpenWindows, searchUrl, type PortalOpenWindows, type PortalSearch } from './haveYourSay'

const pacer = new SitePacer(PORTAL_GAP_MS, 0, PORTAL_MAX_WAIT_MS)

async function portalJson(url: string): Promise<unknown> {
  await pacer.turn()
  return upstreamJson<unknown>(url, PORTAL_POLICY)
}

/** The ids a search by COM number found — the ids only, a day. */
const searchCached = defineCachedFunction(
  async (comReference: string): Promise<PortalSearch> => parseSearch(await portalJson(searchUrl(comReference))),
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
    const search = await searchCached(com.text)
    const opened = search.ids.slice(0, PORTAL_SEARCH_HITS)
    for (const id of opened) {
      const initiative = await initiativeCached(id)
      if (carriesReference(initiative, com.text)) return { state: 'gefunden', reference: com.text, initiative }
    }
    // Every hit opened and none carries the number: not in the portal, as far
    // as its search goes. More hits than opened (COM(2025)106: 75, loosely
    // matched even as a phrase): nothing is proven about the rest.
    return { state: 'nicht-gefunden', reference: com.text, exhaustive: search.total <= opened.length }
  } catch {
    return { state: 'ungelesen', reference: com.text }
  }
}

/**
 * Every initiative with an open window, as the reader's fixed list of
 * fields — a day. One key: the list has no parameter but the reader's
 * version.
 */
const openWindowsCached = defineCachedFunction(
  async (): Promise<PortalOpenWindows> => readOpenWindows(portalJson),
  { name: 'eu-portal-offen', getKey: () => `p${PORTAL_READER_VERSION}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * The open windows, or null where the portal could not be read — never an
 * empty list for a failure: an empty list is the portal's statement that
 * nothing is open, and only a successful reading may make it. A window
 * that closed since the list was read is the caller's to drop
 * (`windowsOpenOn`), by its own day.
 */
export async function openWindows(): Promise<PortalOpenWindows | null> {
  try {
    return await openWindowsCached()
  } catch {
    return null
  }
}

/**
 * One initiative by the portal's number, for its page — the same cached
 * read and fixed list of fields as the consultation behind an act. Three
 * answers, as `consultationOf` keeps its states apart: found; `unbekannt`
 * only where the portal answered 404, the one answer that proves there is
 * none (not probed against the portal: what it answers for an unknown
 * number was not measured); `ungelesen` for every other failure. Never
 * throws.
 */
export async function initiativeById(id: number): Promise<{ state: 'gefunden'; initiative: EuInitiative } | { state: 'unbekannt' } | { state: 'ungelesen' }> {
  try {
    return { state: 'gefunden', initiative: await initiativeCached(id) }
  } catch (error) {
    return error instanceof UpstreamHttpError && error.status === 404 ? { state: 'unbekannt' } : { state: 'ungelesen' }
  }
}

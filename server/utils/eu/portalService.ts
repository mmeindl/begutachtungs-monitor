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
 *
 * WHO GAVE FEEDBACK (step 4, 15.11.2026): only when a reader's block nears
 * the viewport, up to five pages of the list of contributions to one
 * publication, through the same pacer — since 16.11.2026 in two steps, page
 * one first, and no page asked twice (`feedbackOf`). The publication must be one of the initiative's
 * windows (`feedbackOf`), so the endpoint is no proxy for any number. The
 * reading holds organisations' names and the links to their contributions
 * (never a counted row's day, number or link), so it is cached in memory alone
 * (`DERIVED_CACHE`, memory in dev and in production) and for six hours
 * (`FEEDBACK_NAMES_TTL_S`): consent to publication can be withdrawn after
 * a window closed.
 */
import type { EuConsultation, EuFeedbackReading, EuInitiative } from '../../../shared/types/eu'
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S, FEEDBACK_NAMES_TTL_S } from '../cache/ttl'
import { SitePacer } from '../laender/session'
import { UpstreamHttpError, upstreamJson } from '../upstream/fetch'
import { FEEDBACK_READER_VERSION, emptyReading, firstPageReading, isWholeReading, readFeedbackRest, readFirstFeedbackPage, type FeedbackPage } from './portalFeedback'
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

/**
 * Who gave feedback to one publication, in two steps (16.11.2026): page one
 * of the portal's list, and the whole reading of up to five pages. Both six
 * hours, in MEMORY ONLY: the derived mount is memory in dev and in
 * production, and neither name is on a list of `tests/cacheLayers.test.ts`
 * that may reach a disk. Keyed by the initiative and the publication — the
 * initiative builds the contributions' links — and the reader's version;
 * whose window it is was proven before the call. No country in the key: the
 * reading knows none.
 *
 * NO PAGE TWICE. The whole reading starts from the cached page one
 * (`feedbackFirstCached`), so a reader whose block asks for page one and then
 * for the whole costs the portal what the whole alone cost before: at most
 * five requests per window, through the one pacer. Both steps also share a
 * request in flight (`shared`), so two readers arriving together ask once.
 *
 * SIX HOURS FROM THE FIRST REQUEST, NOT FROM THE LAST. Page one is cached
 * with the moment it was read; the whole reading carries that moment
 * (`namesReadAt`) and is served only while it is younger than
 * `FEEDBACK_NAMES_TTL_S` — a whole reading built on a page one five hours
 * old lives one more hour, not six.
 */
interface FirstFeedbackPage {
  page: FeedbackPage
  /** When page one was read, ms since the epoch. */
  readAt: number
}

interface CachedFeedbackReading {
  reading: EuFeedbackReading
  /** When the oldest page in it — page one — was read, ms since the epoch. */
  namesReadAt: number
}

const feedbackKey = (initiativeId: number, publicationId: number) => `${initiativeId}-${publicationId}|f${FEEDBACK_READER_VERSION}`
const namesFresh = (readAt: number | undefined): boolean => typeof readAt === 'number' && Date.now() - readAt < FEEDBACK_NAMES_TTL_S * 1000

/** One promise per key while it runs: a second caller waits for the first one's requests instead of making its own. */
const inFlight = new Map<string, Promise<unknown>>()
function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) return running
  const started = run().finally(() => inFlight.delete(key))
  inFlight.set(key, started)
  return started
}

const feedbackFirstCached = defineCachedFunction(
  async (_initiativeId: number, publicationId: number): Promise<FirstFeedbackPage> => ({ page: await readFirstFeedbackPage(portalJson, publicationId), readAt: Date.now() }),
  { name: 'eu-portal-rueckmeldungen-erste', base: DERIVED_CACHE, getKey: feedbackKey, maxAge: FEEDBACK_NAMES_TTL_S, swr: false },
)

const firstPageOf = (initiativeId: number, publicationId: number): Promise<FirstFeedbackPage> =>
  shared(`erste|${feedbackKey(initiativeId, publicationId)}`, () => feedbackFirstCached(initiativeId, publicationId))

const feedbackCached = defineCachedFunction(
  async (initiativeId: number, publicationId: number): Promise<CachedFeedbackReading> => {
    const first = await firstPageOf(initiativeId, publicationId)
    const reading = await readFeedbackRest(portalJson, initiativeId, publicationId, first.page)
    return { reading, namesReadAt: first.readAt }
  },
  {
    name: 'eu-portal-rueckmeldungen', base: DERIVED_CACHE, getKey: feedbackKey, maxAge: FEEDBACK_NAMES_TTL_S, swr: false,
    validate: (entry: { value?: CachedFeedbackReading }) => entry.value !== undefined && namesFresh(entry.value.namesReadAt),
  },
)

/**
 * Which windows have a whole reading in the cache, and since when its names
 * were read: so a request for page one can answer with the whole instead.
 * Keys and moments only, no name; an entry past six hours is ignored and
 * dropped.
 */
const whole = new Map<string, number>()

const wholeReadingOf = async (initiativeId: number, publicationId: number): Promise<EuFeedbackReading> => {
  const key = feedbackKey(initiativeId, publicationId)
  const cached = await shared(`ganz|${key}`, () => feedbackCached(initiativeId, publicationId))
  whole.set(key, cached.namesReadAt)
  return cached.reading
}

export type FeedbackRead = { state: 'gelesen'; reading: EuFeedbackReading } | { state: 'teilweise'; reading: EuFeedbackReading } | { state: 'unbekannt' } | { state: 'ungelesen' }

/** Which step a request asks for: page one first, or the whole reading. */
export type FeedbackStep = 'erste' | 'ganz'

/**
 * Who gave feedback in one window of one initiative. The publication must
 * be a window of that initiative, proven through the initiative's cached
 * read: an initiative the portal proves unknown, or a number that is none
 * of its publications with a feedback period, is `unbekannt` (the route's
 * 404) — so nobody can ask the portal for an arbitrary publication through
 * the monitor. A window the portal counts no contribution for is answered
 * from that count, without a request. Every failure is `ungelesen`, never
 * an empty list. Never throws.
 *
 * `step` „erste": page one as `teilweise` — or `gelesen` where page one is
 * the whole list, or where the whole reading is already cached. „ganz"
 * (the default): the whole reading, built on the cached page one.
 */
export async function feedbackOf(initiativeId: number, publicationId: number, step: FeedbackStep = 'ganz'): Promise<FeedbackRead> {
  const owner = await initiativeById(initiativeId)
  if (owner.state !== 'gefunden') return owner
  const publication = owner.initiative.publications.find((p) => p.id === publicationId && p.feedbackEnd !== null)
  if (!publication) return { state: 'unbekannt' }
  if (publication.feedbackCount === 0) return { state: 'gelesen', reading: emptyReading() }
  try {
    if (step === 'erste') {
      const key = feedbackKey(initiativeId, publicationId)
      const known = whole.get(key)
      if (known !== undefined && !namesFresh(known)) whole.delete(key)
      if (known !== undefined && namesFresh(known)) return { state: 'gelesen', reading: await wholeReadingOf(initiativeId, publicationId) }
      const first = await firstPageOf(initiativeId, publicationId)
      return { state: isWholeReading(first.page) ? 'gelesen' : 'teilweise', reading: firstPageReading(first.page, initiativeId) }
    }
    return { state: 'gelesen', reading: await wholeReadingOf(initiativeId, publicationId) }
  } catch {
    return { state: 'ungelesen' }
  }
}

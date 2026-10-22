/**
 * The Länder the monitor reads, and how one request reads them (22.10.2026).
 *
 * Each Land is read on its own and fails on its own: one Land's relaunch
 * takes that Land's rows away and says so (`LandSourceState`), never the
 * others' and never the Bund's.
 *
 * Layers as `cache/base.ts` prescribes: the PAGES are the fetched payload
 * and are cached; the parses are not, they run per request and cost
 * milliseconds. A failed fetch throws and is therefore not cached — the
 * next request asks again.
 */
import type {
  LandCode,
  LandConsultation,
  LandDraftDetail,
  LandSourceState,
  LaenderResponse,
  LandStatement,
} from '#shared/types'
import { LAND_CODES } from '#shared/utils/laender'
import { todayIso } from '#shared/utils/format'
import { type UpstreamPolicy, upstreamBytes, upstreamText } from '../upstream/fetch'
import { UPSTREAM_LIST_TTL_S } from '../cache/ttl'
import { withinBudget } from '../http/budget'
import {
  SALZBURG_FILING_EMAIL,
  SALZBURG_LISTS,
  SALZBURG_REGISTERS,
  parseSalzburgList,
  parseSalzburgRegister,
  parseSalzburgStatements,
  salzburgDrafts,
  salzburgStatementsUrl,
} from './salzburg'
import { WIEN_LIST, WIEN_NUMBER_RE, WIEN_STATEMENTS, decodeWien, parseWienList, parseWienStatements } from './wien'
import {
  OOE_GESETZE,
  OOE_GESETZE_ARCHIV,
  OOE_GESETZ_ID_RE,
  OOE_VERORDNUNGEN,
  OOE_VERORDNUNG_ID_RE,
  ooeDetailUrl,
  ooeFormUrl,
  parseOoeDetail,
  parseOoeGesetze,
  parseOoeVerordnungen,
  ooeStageOf,
} from './oberoesterreich'

const LAND_POLICY: UpstreamPolicy = {
  timeoutMs: 15_000,
  retries: 1,
  backoffMs: () => 2_000,
  accept: 'text/html',
  maxBytes: 4 * 1024 * 1024,
}

/**
 * The cache key for a URL. Not the URL itself: unstorage cuts a key at its
 * first „?" (`normalizeKey`), and Oberösterreich's Landtag pages differ only
 * in `?jahr=…&nummer=…` — every one of them was served the first one's
 * content (22.10.2026). Encoded, the query is part of the key.
 */
const urlKey = (url: string) => encodeURIComponent(url)

/** One list page, or one draft's page, as the Land served it (UTF-8). */
export const fetchLandPage = defineCachedFunction(
  (url: string): Promise<string> => upstreamText(url, LAND_POLICY),
  { name: 'land-list-page', getKey: urlKey, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/** The same for Wien, which serves ISO-8859-1 and says so only in a meta tag. */
export const fetchLatin1Page = defineCachedFunction(
  async (url: string): Promise<string> => decodeWien((await upstreamBytes(url, LAND_POLICY)).bytes),
  { name: 'land-list-page-latin1', getKey: urlKey, maxAge: UPSTREAM_LIST_TTL_S, swr: false },
)

/**
 * A Land's whole register (Salzburg: every draft since 2004, 1,7 MB and
 * 12,7 s for the Verordnungen on 22.10.2026).
 *
 * THE ONE `swr: true` in this code base, on purpose. `ttl.ts` explains why
 * every other cache refuses it: an expired entry keeps serving the old
 * value. Here that is the right answer — a register a few hours old is
 * still correct for every draft it holds, and a draft too new for it comes
 * from the current list, which is fresh. Without SWR the first request
 * after expiry would wait thirteen seconds.
 */
const REGISTER_TTL_S = 60 * 60 * 6
const REGISTER_POLICY: UpstreamPolicy = { ...LAND_POLICY, timeoutMs: 45_000, maxBytes: 16 * 1024 * 1024 }
export const fetchLandRegister = defineCachedFunction(
  (url: string): Promise<string> => upstreamText(url, REGISTER_POLICY),
  { name: 'land-register-page', getKey: urlKey, maxAge: REGISTER_TTL_S, swr: true },
)

/** How long a LIST waits for what only garnishes it: start dates. */
const GARNISH_BUDGET_MS = 1_500

/**
 * 410 with the Land's reason. The reason travels in the body (`data`), not
 * in the status message: that one is a header, and a header loses every
 * umlaut on the way („verffentlicht", 22.10.2026).
 */
const gone = (reason: string) => createError({ statusCode: 410, statusMessage: 'Gone', data: { reason } })

const unavailable = (land: string) => createError({ statusCode: 503, statusMessage: `${land} gerade nicht abrufbar` })

interface LandReader {
  /** The page a reader is sent to when the Land cannot be read. */
  listUrl: string
  /** Every draft on the Land's current lists, running or not. */
  current: () => Promise<LandConsultation[]>
  /**
   * Every draft the Land still publishes, running and closed — what the
   * lists show for a period (`readLaenderInWindow`). Unlike `current` it
   * waits for a register: a period's list that left out the closed drafts
   * of one Land would claim they do not exist.
   */
  all: () => Promise<LandConsultation[]>
  /** One draft by the Land's number; null when unknown (404). */
  detail: (number: string) => Promise<LandDraftDetail | null>
}

/* ------------------------------------------------------------------ *
 * Salzburg
 * ------------------------------------------------------------------ */

const KINDS = ['gesetz', 'verordnung'] as const

async function salzburgCurrent(): Promise<LandConsultation[]> {
  const lists = await Promise.all(KINDS.map(async (kind) =>
    salzburgDrafts(parseSalzburgList(await fetchLandPage(SALZBURG_LISTS[kind]), SALZBURG_LISTS[kind]), kind)))
  return lists.flat()
}

async function salzburgRegister(): Promise<LandConsultation[]> {
  const registers = await Promise.all(KINDS.map(async (kind) =>
    salzburgDrafts(parseSalzburgRegister(await fetchLandRegister(SALZBURG_REGISTERS[kind]), SALZBURG_REGISTERS[kind]), kind)))
  return registers.flat()
}

/** The register's start date and documents laid onto a current entry. */
function withRegister(current: LandConsultation, registered: LandConsultation | undefined): LandConsultation {
  if (!registered) return current
  const urls = new Set(current.documents.map((d) => d.url))
  return {
    ...current,
    startedAt: registered.startedAt,
    documents: [...current.documents, ...registered.documents.filter((d) => !urls.has(d.url))],
  }
}

const salzburg: LandReader = {
  listUrl: SALZBURG_LISTS.gesetz,
  current: async () => {
    const [current, register] = await Promise.all([
      salzburgCurrent(),
      withinBudget(salzburgRegister(), GARNISH_BUDGET_MS),
    ])
    const byId = new Map((register ?? []).map((d) => [d.id, d]))
    return current.map((d) => withRegister(d, byId.get(d.id)))
  },
  all: async () => {
    const [current, register] = await Promise.all([salzburgCurrent(), salzburgRegister()])
    const running = new Map(current.map((d) => [d.id, d]))
    const merged = register.map((d) => {
      const live = running.get(d.id)
      return live ? withRegister(live, d) : d
    })
    // A draft newer than the register (it is held for hours) still counts.
    const known = new Set(register.map((d) => d.id))
    return [...merged, ...current.filter((d) => !known.has(d.id))]
  },
  detail: async (number) => {
    const id = `sbg-${number}`
    /* Both sources may fail on their own; the page needs one of them. The
     * current list alone knows the Frist, the register alone a closed draft. */
    const [current, register] = await Promise.all([
      salzburgCurrent().catch(() => null),
      salzburgRegister().catch(() => null),
    ])
    if (!current && !register) throw unavailable('Salzburg')
    const running = current?.find((d) => d.id === id)
    const registered = register?.find((d) => d.id === id)
    const draft = running ? withRegister(running, registered) : registered
    if (!draft) {
      // Unknown is a 404 only when BOTH sources answered.
      if (!current || !register) throw unavailable('Salzburg')
      return null
    }
    const statementsUrl = salzburgStatementsUrl(number)
    const statements: LandStatement[] | null = await fetchLandPage(statementsUrl)
      .then((html) => parseSalzburgStatements(html, statementsUrl))
      .catch(() => null)
    return {
      draft: withLandActiveOn([draft])[0]!,
      statements,
      statementsUrl,
      filing: { kind: 'email', address: SALZBURG_FILING_EMAIL, recipient: null },
      summary: null,
      procedure: null,
      retentionNote: null,
      listUrl: SALZBURG_LISTS[draft.kind],
    }
  },
}

/* ------------------------------------------------------------------ *
 * Wien
 * ------------------------------------------------------------------ */

const WIEN_RETENTION = 'Die Stadt Wien veröffentlicht einen Entwurf bis zum Beschluss des Landtags, höchstens ein Jahr lang.'

const wien: LandReader = {
  listUrl: WIEN_LIST,
  current: async () => parseWienList(await fetchLatin1Page(WIEN_LIST)).map((e) => e.draft),
  // The page is everything Wien still publishes: a year back at most.
  all: async () => parseWienList(await fetchLatin1Page(WIEN_LIST)).map((e) => e.draft),
  detail: async (number) => {
    const entries = parseWienList(await fetchLatin1Page(WIEN_LIST))
    const entry = entries.find((e) => e.draft.id === `w-${number}`)
    if (!entry) {
      /* A number Wien no longer lists was a draft once if it lies behind
       * the newest one Wien has numbered: Wien takes its drafts down after
       * a year. Said, as 410. A number beyond that never existed: 404. */
      const newest = entries.map((e) => e.draft.id.slice(2)).sort().at(-1) ?? ''
      if (WIEN_NUMBER_RE.test(number) && number < newest) {
        throw gone(`${WIEN_RETENTION} Diesen Entwurf führt sie nicht mehr.`)
      }
      return null
    }
    const statements: LandStatement[] | null = await fetchLatin1Page(WIEN_STATEMENTS)
      .then((html) => parseWienStatements(html, number))
      .catch(() => null)
    return {
      draft: withLandActiveOn([entry.draft])[0]!,
      statements,
      statementsUrl: statements?.length ? `${WIEN_STATEMENTS}#${number}` : null,
      filing: { kind: 'email', address: entry.address, recipient: entry.recipient },
      summary: null,
      procedure: null,
      retentionNote: WIEN_RETENTION,
      listUrl: WIEN_LIST,
    }
  },
}

/* ------------------------------------------------------------------ *
 * Oberösterreich
 * ------------------------------------------------------------------ */

const OOE_GESETZE_HEADING = /Begutachtungsentw(?:ü|&uuml;)rfe von Landesgesetzen/
const OOE_ARCHIV_HEADING = /Archiv der Begutachtungsentw/

async function ooeCurrent(): Promise<LandConsultation[]> {
  const [gesetze, verordnungen] = await Promise.all([
    fetchLandPage(OOE_GESETZE).then((html) => parseOoeGesetze(html, OOE_GESETZE_HEADING)),
    fetchLandPage(OOE_VERORDNUNGEN).then(parseOoeVerordnungen),
  ])
  return [...gesetze, ...verordnungen]
}

const oberoesterreich: LandReader = {
  listUrl: OOE_GESETZE,
  current: async () => {
    const items = withLandActiveOn(await ooeCurrent())
    /* The start of a running Gesetz's Begutachtung is its first document's
     * date on the Landtag's page — a garnish here, so under a budget. */
    const started = await withinBudget(Promise.all(items
      .filter((d) => d.active && d.kind === 'gesetz')
      .map(async (d) => [d.id, parseOoeDetail(await fetchLandPage(d.url))?.startedAt ?? null] as const)), GARNISH_BUDGET_MS)
    const byId = new Map(started ?? [])
    return items.map((d) => ({ ...d, startedAt: byId.get(d.id) ?? d.startedAt }))
  },
  all: async () => {
    const [current, archive] = await Promise.all([
      ooeCurrent(),
      fetchLandPage(OOE_GESETZE_ARCHIV).then((html) => parseOoeGesetze(html, OOE_ARCHIV_HEADING)),
    ])
    const known = new Set(current.map((d) => d.id))
    const all = [...current, ...archive.filter((d) => !known.has(d.id))]
    /* Each Gesetz's station from its Landtag page (`ooeStageOf`) — at most
     * one page per draft on the Land's lists, 91 on 22.10.2026, cached like
     * every page. A page that fails leaves the station unknown, never the
     * first one. Verordnungen have no Landtag page and no station after
     * their Begutachtung that the monitor reads. */
    return Promise.all(all.map(async (d) => {
      if (d.kind !== 'gesetz') return d
      const stage = await fetchLandPage(d.url)
        .then((html) => {
          const detail = parseOoeDetail(html)
          return detail ? ooeStageOf(detail.procedure) : ('unknown' as const)
        })
        .catch(() => 'unknown' as const)
      return { ...d, stage }
    }))
  },
  detail: async (number) => {
    const verordnung = OOE_VERORDNUNG_ID_RE.exec(number)
    if (verordnung) {
      const draft = (await fetchLandPage(OOE_VERORDNUNGEN).then(parseOoeVerordnungen)).find((d) => d.id === `ooe-${number}`)
      if (!draft) {
        throw gone('Das Land Oberösterreich führt diesen Verordnungsentwurf nicht mehr auf seiner Seite.')
      }
      return {
        draft: withLandActiveOn([draft])[0]!,
        statements: null,
        statementsUrl: null,
        // The Verordnungen page names no address: it stands in the draft.
        filing: { kind: 'document' },
        summary: null,
        procedure: null,
        retentionNote: null,
        listUrl: OOE_VERORDNUNGEN,
      }
    }
    const gesetz = OOE_GESETZ_ID_RE.exec(number)
    if (!gesetz) return null
    const [, jahr, nummer] = gesetz
    const url = ooeDetailUrl(jahr!, nummer!)
    /* The Landtag's page holds everything but the Frist; the Frist stands on
     * the current list or, once closed, on the archive. A page whose Frist
     * neither knows is still the draft — it then shows without one. */
    const [detail, listed] = await Promise.all([
      fetchLandPage(url).then(parseOoeDetail),
      Promise.all([
        fetchLandPage(OOE_GESETZE).then((h) => parseOoeGesetze(h, OOE_GESETZE_HEADING)).catch(() => []),
        fetchLandPage(OOE_GESETZE_ARCHIV).then((h) => parseOoeGesetze(h, OOE_ARCHIV_HEADING)).catch(() => []),
      ]).then((lists) => lists.flat().find((d) => d.id === `ooe-${number}`)),
    ])
    if (!detail) {
      // The Land's lists know it, so the Landtag's system is down, not wrong.
      if (listed) throw unavailable('Oberösterreich')
      return null
    }
    const draft: LandConsultation = {
      id: `ooe-${number}`,
      land: 'ooe',
      kind: 'gesetz',
      title: detail.title || listed?.title || '',
      startedAt: detail.startedAt,
      deadline: listed?.deadline ?? null,
      url,
      documents: detail.documents,
      active: false,
      stage: ooeStageOf(detail.procedure),
    }
    return {
      draft: withLandActiveOn([draft])[0]!,
      statements: detail.statements,
      statementsUrl: url,
      filing: { kind: 'form', url: ooeFormUrl(jahr!, nummer!) },
      summary: detail.summary,
      procedure: detail.procedure,
      retentionNote: null,
      listUrl: OOE_GESETZE,
    }
  },
}

const READERS: Record<LandCode, LandReader> = { sbg: salzburg, w: wien, ooe: oberoesterreich }

/**
 * Whether a Frist runs on `day`: the Land's Frist decides, and a draft
 * without one (closed, read from a register) is not running. Decided per
 * request, never inside a cache (`withRisActiveOn`).
 */
export function withLandActiveOn(items: LandConsultation[], day: string = todayIso()): LandConsultation[] {
  return items.map((item) => ({ ...item, active: item.deadline !== null && item.deadline >= day }))
}

/**
 * Every Land the monitor reads. Only RUNNING Begutachtungen leave here:
 * Wien and Oberösterreich keep expired entries on their lists, and the
 * lists have no view for closed Länder drafts yet (`TODO.md` 5L).
 */
export async function readLaender(): Promise<LaenderResponse> {
  const results = await Promise.allSettled(LAND_CODES.map((land) => READERS[land].current()))
  const items: LandConsultation[] = []
  const sources: LandSourceState[] = LAND_CODES.map((land, i) => {
    const result = results[i]!
    if (result.status === 'fulfilled') items.push(...result.value)
    else console.warn(`[laender] ${land} nicht abrufbar:`, result.reason instanceof Error ? result.reason.message : result.reason)
    return { land, state: result.status === 'fulfilled' ? 'ok' : 'unavailable', listUrl: READERS[land].listUrl }
  })
  return {
    items: withLandActiveOn(items).filter((item) => item.active),
    sources,
  }
}

/**
 * The date that places a Land's draft in a period: the start of its
 * Begutachtung, or — where the Land kept only the end (OÖ's archive and
 * Verordnungen) — the end of its Frist.
 */
export function landDraftDate(d: LandConsultation): string | null {
  return d.startedAt ?? d.deadline
}

/**
 * The Länder's drafts for a Bund Gesetzgebungsperiode, used as a TIME
 * WINDOW (22.10.2026): a Land has its own legislative periods, so a draft
 * belongs to GP XXVIII when its Begutachtung began between 24.10.2024 and
 * that period's end. The lists say so beside the chips.
 */
export async function readLaenderInWindow(
  window: { from: string; to: string | null },
  status: 'open' | 'closed' | 'all',
): Promise<Pick<LaenderResponse, 'items' | 'sources'>> {
  const results = await Promise.allSettled(LAND_CODES.map((land) => READERS[land].all()))
  const items: LandConsultation[] = []
  const sources: LandSourceState[] = LAND_CODES.map((land, i) => {
    const result = results[i]!
    if (result.status === 'fulfilled') items.push(...result.value)
    else console.warn(`[laender] ${land} nicht abrufbar:`, result.reason instanceof Error ? result.reason.message : result.reason)
    return { land, state: result.status === 'fulfilled' ? 'ok' : 'unavailable', listUrl: READERS[land].listUrl }
  })
  const inWindow = withLandActiveOn(items).filter((d) => {
    const date = landDraftDate(d)
    return date !== null && date >= window.from && (window.to === null || date <= window.to)
  })
  return {
    items: inWindow.filter((d) => status === 'all' || (status === 'open') === d.active),
    sources,
  }
}

export function readLandDraft(land: LandCode, number: string): Promise<LandDraftDetail | null> {
  return READERS[land].detail(number)
}

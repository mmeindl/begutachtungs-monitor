/**
 * ME → RV comparison for one consultation (docs/ris-join.md §6).
 *
 * Nuxt-aware glue around the pure modules lawText.ts and lawDiff.ts:
 * finds the two Gesetzestext HTML documents on the ME detail, fetches them
 * (leaf cache per URL, 24 h — published documents do not change), diffs
 * them, caches the result. Unavailability is a normal answer, not an error:
 * GP XXVII and earlier are PDF-only, and a draft without a Regierungsvorlage
 * has nothing to compare yet.
 */
import type { LawDiffResponse, TraceLink } from '#shared/types'
import { diffLawUnits, summarizeDiff } from './lawDiff'
import { parseLawUnits, parseLawUnitsFromRis } from './lawText'
import { mapDocuments, mapTextEvolution, RV_STATION, type RawDocumentGroup } from './mappers'
import { getGegenstand } from './parliament'
import { getRisMapForGp } from './ris'

const HTML_TTL_S = 60 * 60 * 24
const DIFF_TTL_S = 60 * 60 * 24
const HTML_TIMEOUT_MS = 20_000
const HTML_MAX_BYTES = 8 * 1024 * 1024
const USER_AGENT = 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at)'

/** One published Gesetzestext HTML, by URL. Leaf cache. */
export const fetchLawHtml = defineCachedFunction(
  async (url: string): Promise<string> => {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(HTML_TIMEOUT_MS) })
        if (res.status >= 500) {
          lastError = new Error(`Upstream ${res.status} für ${url}`)
          continue
        }
        if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Dokument nicht abrufbar (Status ${res.status})` })
        const length = Number(res.headers.get('content-length') ?? 0)
        if (length > HTML_MAX_BYTES) throw createError({ statusCode: 502, statusMessage: 'Dokument zu groß für den Vergleich' })
        // Parliament serves Word HTML as windows-1252 or utf-8; the header says which.
        const type = res.headers.get('content-type') ?? ''
        const charset = /charset=([\w-]+)/i.exec(type)?.[1]
        const buf = await res.arrayBuffer()
        if (buf.byteLength > HTML_MAX_BYTES) throw createError({ statusCode: 502, statusMessage: 'Dokument zu groß für den Vergleich' })
        return decodeHtml(buf, charset)
      } catch (err) {
        if (isH3Error(err)) throw err
        lastError = err
      }
    }
    throw createError({ statusCode: 502, statusMessage: 'Dokument nicht abrufbar', cause: lastError })
  },
  { name: 'law-html', getKey: (url: string) => url, maxAge: HTML_TTL_S, swr: false },
)

function isH3Error(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'statusCode' in err
}

/** Honour the header charset, else the <meta charset>, else utf-8. */
function decodeHtml(buf: ArrayBuffer, headerCharset: string | undefined): string {
  let charset = headerCharset
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048))
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

interface DiffSources {
  me: TraceLink | null
  rv: TraceLink | null
  hasRv: boolean
}

/** The two Gesetzestext HTMLs of a consultation, or what is missing. */
export function findDiffSources(content: { documents?: RawDocumentGroup[] | null; statements?: { documents?: RawDocumentGroup[] | null } | null }): DiffSources {
  const documents = mapDocuments(content.documents)
  const meDoc = documents.find((d) => d.title.trim() === 'Gesetzestext')
  const meHtml = meDoc?.formats.find((f) => f.type === 'html')?.url ?? null
  const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
  const versions = mapTextEvolution(content.statements?.documents, meUrls)
  const rvVersions = versions.filter((v) => v.station === RV_STATION)
  const rvHtml = rvVersions.find((v) => v.url.endsWith('.html'))?.url ?? null
  return {
    me: meHtml ? { label: 'Ministerialentwurf, Gesetzestext', url: meHtml } : null,
    rv: rvHtml ? { label: 'Regierungsvorlage, Gesetzestext', url: rvHtml } : null,
    hasRv: rvVersions.length > 0,
  }
}

export const getLawDiff = defineCachedFunction(
  async (gp: string, inr: number): Promise<LawDiffResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const content = detail.content ?? {}
    const sources = findDiffSources(content)
    const empty = (reason: string, me: TraceLink | null = sources.me, meSource: LawDiffResponse['meSource'] = null): LawDiffResponse => ({
      gp,
      inr,
      available: false,
      unavailableReason: reason,
      me,
      rv: sources.rv,
      meSource,
      stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
      units: [],
    })
    if (!sources.hasRv) return empty('Es liegt noch keine Regierungsvorlage vor, mit der sich der Entwurf vergleichen ließe.')
    if (!sources.rv) return empty('Der Gesetzestext der Regierungsvorlage liegt nur als PDF vor.')

    // Draft text: Parliament HTML (GP XXVIII on), else the RIS XML of the
    // joined Begut record (GP XXVII and earlier are PDF-only at Parliament).
    let meUnits
    let me = sources.me
    let meSource: LawDiffResponse['meSource'] = 'parlament'
    if (sources.me) {
      meUnits = parseLawUnits(await fetchLawHtml(sources.me.url))
    } else {
      const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
      const xmlUrl = row?.risDocument?.xml ?? null
      if (!row?.risId) return empty('Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor und ist im RIS nicht veröffentlicht.')
      if (!xmlUrl) return empty('Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor, und das RIS bietet ihn nicht als XML an.')
      me = { label: 'Ministerialentwurf, Gesetzestext (RIS)', url: row.risUrl ?? xmlUrl }
      meSource = 'ris'
      meUnits = parseLawUnitsFromRis(await fetchLawHtml(xmlUrl))
    }
    const units = diffLawUnits(meUnits, parseLawUnits(await fetchLawHtml(sources.rv.url)))
    if (units.length === 0) return empty('Der Gesetzestext ließ sich nicht in Paragraphen gliedern.', me, meSource)
    return { gp, inr, available: true, unavailableReason: null, me, rv: sources.rv, meSource, stats: summarizeDiff(units), units }
  },
  { name: 'law-diff', getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DIFF_TTL_S, swr: false },
)

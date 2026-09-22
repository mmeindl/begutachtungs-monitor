/**
 * The § comparison of one consultation, between two stations of its law text
 * (docs/ris-join.md §6, docs/architecture.md §12.18).
 *
 * Nuxt-aware glue around the pure modules lawText.ts and lawDiff.ts: resolves
 * each station to the document Parliament publishes for it, fetches the two
 * the caller asked for (leaf cache per URL, 24 h — published documents do not
 * change), diffs them, caches the result per pair.
 *
 * Unavailability is a normal answer, not an error, and it comes in three
 * kinds the reader can tell apart: the station does not exist yet (no
 * Regierungsvorlage, no Ausschussfassung), its text is published only as a
 * PDF, or the text would not divide into paragraphs.
 *
 * On the PDF kind, one correction to what this file used to claim: "GP XXVII
 * and earlier are PDF-only" is too broad. Measured over three periods
 * (scripts/stations-corpus.ts, 17.09.2026) 276 of 353 GP-XXVII drafts do
 * publish their Gesetzestext as HTML, and every single one of the 296
 * Regierungsvorlagen, 80 Ausschuss- and 59 Plenarfassungen does. PDF-only is
 * a property of the individual document, never of the period — which is why
 * the RIS fallback below is keyed on the document being absent rather than on
 * the GP.
 */
import type { DraftDocument, LawDiffResponse, LawStationId, LawStationOption, TraceLink } from '#shared/types'
import { LAW_STATION_LABEL, LAW_STATION_ORDER, meTextTitleRank } from '#shared/utils/lawStations'
import { diffLawPackage, summarizeDiff } from './lawDiff'
import { parseLawUnits, parseLawUnitsFromRis } from './lawtext/lawUnits'
import { extractBgblLink, findLastRvLink, mapDocuments, mapTextEvolution, parseStages, type RawDocumentGroup } from './parliament/detailJson'
import { getGegenstand } from './parliament/drafts'
import { getRisMapForGp } from './ris/begutCorpus'
import { DERIVED_ANALYSIS_TTL_S } from './cache/ttl'
import {
  upstreamBytes,
  UpstreamHttpError,
  UpstreamTooLargeError,
  type UpstreamPolicy,
} from './upstream/fetch'

/**
 * Its own name, because neither shared one describes it: the value is a
 * published document, but kept for a day and not for a month. Whether it
 * could take `PUBLISHED_DOCUMENT_TTL_S` is a question nobody has measured,
 * and this refactor does not answer it.
 */
const HTML_TTL_S = 60 * 60 * 24
const HTML_TIMEOUT_MS = 20_000
const HTML_MAX_BYTES = 8 * 1024 * 1024
/** Three attempts without a pause between them, as this client always had. */
const HTML_POLICY: UpstreamPolicy = {
  timeoutMs: HTML_TIMEOUT_MS,
  retries: 2,
  maxBytes: HTML_MAX_BYTES,
}

/** One published Gesetzestext HTML, by URL. Leaf cache. */
export const fetchLawHtml = defineCachedFunction(
  async (url: string): Promise<string> => {
    let body: Awaited<ReturnType<typeof upstreamBytes>>
    try {
      body = await upstreamBytes(url, HTML_POLICY)
    } catch (err) {
      if (err instanceof UpstreamTooLargeError) {
        throw createError({ statusCode: 502, statusMessage: 'Dokument zu groß für den Vergleich' })
      }
      if (err instanceof UpstreamHttpError) {
        throw createError({ statusCode: 502, statusMessage: `Dokument nicht abrufbar (Status ${err.status})` })
      }
      throw createError({ statusCode: 502, statusMessage: 'Dokument nicht abrufbar', cause: err })
    }
    // Parliament serves Word HTML as windows-1252 or utf-8; the header says which.
    const charset = /charset=([\w-]+)/i.exec(body.contentType ?? '')?.[1]
    return decodeHtml(body.bytes, charset)
  },
  { name: 'law-html', getKey: (url: string) => url, maxAge: HTML_TTL_S, swr: false },
)

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

/** One station's published law text, as the comparison can use it. */
interface ResolvedLawStation {
  id: LawStationId
  /** The HTML export `parseLawUnits` needs; null when upstream offers only a PDF. */
  html: string | null
  /**
   * Legistisches RIS-XML, gelesen von `parseLawUnitsFromRis`.
   *
   * Zwei Stationen kommen so daher, und aus verschiedenen Gründen: der
   * Entwurf, wenn das Parlament ihn nur als PDF führt (der alte Rückfall),
   * und die Kundmachung, die es beim Parlament überhaupt nicht gibt
   * (§12.33). Deshalb steht das Feld an der Station und nicht mehr als
   * Sondervariable neben `me`.
   */
  xml: string | null
  /** What to link when there is no HTML, so the reader still reaches the text. */
  fallbackUrl: string | null
}

/**
 * Every station this Gegenstand publishes a law text for.
 *
 * The draft's own text comes from its document list, the later ones from
 * `mapTextEvolution` — the same call the detail page makes, so the selector
 * can never offer a station the page does not list. Both sides go through
 * the measured title whitelist in `shared/utils/lawStations.ts` rather than
 * matching words, because upstream types these titles by hand: three
 * GP-XXVI drafts publish "Gesetzestext, Vorblatt und Erläuterungen" as one
 * file, and a prefix match would feed the Erläuterungen to a § parser.
 */
export function findLawStations(content: {
  documents?: RawDocumentGroup[] | null
  statements?: { documents?: RawDocumentGroup[] | null } | null
}): Map<LawStationId, ResolvedLawStation> {
  const out = new Map<LawStationId, ResolvedLawStation>()
  const documents = mapDocuments(content.documents)

  let best: { rank: number; formats: DraftDocument['formats'] } | null = null
  for (const doc of documents) {
    const rank = meTextTitleRank(doc.title)
    if (rank < 0) continue
    if (!best || rank < best.rank) best = { rank, formats: doc.formats }
  }
  if (best) {
    out.set('me', {
      id: 'me',
      html: best.formats.find((f) => f.type === 'html')?.url ?? null,
      xml: null,
      fallbackUrl: best.formats.find((f) => f.type === 'pdf')?.url ?? null,
    })
  }

  // The draft's own document URLs are what upstream repeats while no
  // Regierungsvorlage exists; excluded, so only real later versions survive.
  const meUrls = new Set(documents.flatMap((d) => d.formats.map((f) => f.url)))
  for (const v of mapTextEvolution(content.statements?.documents, meUrls)) {
    if (!v.stationId) continue
    const station = out.get(v.stationId) ?? { id: v.stationId, html: null, xml: null, fallbackUrl: null }
    if (v.url.endsWith('.html')) station.html ??= v.url
    else station.fallbackUrl ??= v.url
    out.set(v.stationId, station)
  }
  return out
}

/**
 * Why a station carries nothing to compare — absent and PDF-only are two
 * different answers, and a reader who is told "only a PDF" knows there is a
 * text to open.
 */
const MISSING_STATION_REASON: Record<LawStationId, string> = {
  me: 'Zu diesem Entwurf ist kein Gesetzestext als eigenes Dokument veröffentlicht.',
  rv: 'Es liegt noch keine Regierungsvorlage vor, mit der sich der Entwurf vergleichen ließe.',
  ausschuss: 'Der Ausschuss hat keine geänderte Fassung des Gesetzestexts veröffentlicht.',
  plenum: 'Im Plenum wurde keine geänderte Fassung des Gesetzestexts veröffentlicht.',
  bgbl: 'Dieser Entwurf ist bisher nicht als Gesetz kundgemacht worden.',
}

export const getLawDiff = defineCachedFunction(
  async (gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<LawDiffResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const content = detail.content ?? {}
    const found = findLawStations(content)

    // The draft's fallback: Parliament serves a PDF for about a fifth of the
    // GP-XXVII drafts (77 of 353, scripts/stations-corpus.ts), and the RIS
    // holds the same text as legistic XML. Only ever the draft side — the
    // parliamentary stations are published as HTML without exception in the
    // three measured periods.
    const meStation = found.get('me')
    let risLink: TraceLink | null = null
    let risRowExists = false
    if (meStation && !meStation.html) {
      const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
      risRowExists = Boolean(row?.risId)
      meStation.xml = row?.risDocument?.xml ?? null
      if (meStation.xml) risLink = { label: 'Ministerialentwurf, Gesetzestext (RIS)', url: row?.risUrl ?? meStation.xml }
    }

    /**
     * Die kundgemachte Fassung — die einzige Station, die nicht beim
     * Parlament liegt (§12.33).
     *
     * Der Weg dorthin ist ein Nachschlagen und keine Suche: Die
     * Regierungsvorlage trägt die Fundstelle strukturiert
     * (`status.bgbllinks`), und das RIS liefert zu dieser Zitierung genau
     * einen Satz. Scheitert irgendetwas davon, fehlt die Station einfach —
     * der Vergleich der anderen vier darf daran nicht hängen.
     */
    let bgblLink: TraceLink | null = null
    try {
      const rvLink = findLastRvLink(parseStages(content.stages))
      if (rvLink) {
        const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
        const nummer = extractBgblLink(rv.content?.status?.bgbllinks)?.number
        const doc = nummer ? await getBgblDocument(nummer) : null
        if (doc?.xml) {
          found.set('bgbl', { id: 'bgbl', html: null, xml: doc.xml, fallbackUrl: doc.html ?? doc.page })
          bgblLink = { label: `${nummer} (RIS)`, url: doc.page }
        }
      }
    } catch {
      // Ohne Kundmachung bleibt es bei den parlamentarischen Stationen.
    }

    const comparable = (id: LawStationId) => Boolean(found.get(id)?.html) || Boolean(found.get(id)?.xml)

    const documentOf = (id: LawStationId): TraceLink | null => {
      const station = found.get(id)
      if (!station) return null
      if (id === 'me' && !station.html && risLink) return risLink
      if (id === 'bgbl' && bgblLink) return bgblLink
      const url = station.html ?? station.fallbackUrl
      return url ? { label: `${LAW_STATION_LABEL[id]}, Gesetzestext`, url } : null
    }

    // Every station this draft has, comparable or not: the selector has to
    // show a PDF-only station as present, or the reader reads its absence as
    // "parliament never touched the text".
    const stations: LawStationOption[] = LAW_STATION_ORDER.filter((id) => found.has(id)).map((id) => ({
      id,
      label: LAW_STATION_LABEL[id],
      comparable: comparable(id),
      document: documentOf(id),
    }))

    const answer = (reason: string | null, extra: Partial<LawDiffResponse> = {}): LawDiffResponse => ({
      gp,
      inr,
      from,
      to,
      available: reason === null,
      unavailableReason: reason,
      fromDocument: documentOf(from),
      toDocument: documentOf(to),
      fromSource: null,
      toSource: null,
      stations,
      stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
      lawsOnlyInTo: [],
      lawsOnlyInFrom: [],
      units: [],
      ...extra,
    })

    for (const id of [to, from]) {
      if (!found.has(id)) return answer(MISSING_STATION_REASON[id])
    }
    if (!comparable(from)) {
      return answer(
        from !== 'me'
          ? `Der Gesetzestext der ${LAW_STATION_LABEL[from]} liegt nur als PDF vor.`
          : risRowExists
            ? 'Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor, und das RIS bietet ihn nicht als XML an.'
            : 'Der Gesetzestext des Entwurfs liegt beim Parlament nur als PDF vor und ist im RIS nicht veröffentlicht.',
      )
    }
    if (!comparable(to)) {
      return answer(`Der Gesetzestext der ${LAW_STATION_LABEL[to]} liegt nur als PDF vor.`)
    }

    // Jede Seite bringt ihr eigenes Format mit, seit die Kundmachung dabei
    // ist: Parlaments-HTML wird von `parseLawUnits` gelesen, RIS-XML von
    // `parseLawUnitsFromRis`. Bis 19.09.2026 stand das XML fest auf der
    // linken Seite, weil nur der Entwurf so kommen konnte.
    const fromHtml = found.get(from)!.html
    const toHtml = found.get(to)!.html
    const fromSource: LawDiffResponse['fromSource'] = fromHtml ? 'parlament' : 'ris'
    const toSource: LawDiffResponse['fromSource'] = toHtml ? 'parlament' : 'ris'
    const [fromDoc, toDoc] = await Promise.all([
      fetchLawHtml(fromHtml ?? found.get(from)!.xml!),
      fetchLawHtml(toHtml ?? found.get(to)!.xml!),
    ])
    const fromUnits = fromHtml ? parseLawUnits(fromDoc) : parseLawUnitsFromRis(fromDoc)
    const toUnits = toHtml ? parseLawUnits(toDoc) : parseLawUnitsFromRis(toDoc)

    const { units, lawsOnlyInTo, lawsOnlyInFrom } = diffLawPackage(fromUnits, toUnits)
    if (units.length === 0) {
      return answer('Der Gesetzestext ließ sich nicht in Paragraphen gliedern.', { fromSource, toSource })
    }
    return answer(null, { fromSource, toSource, stats: summarizeDiff(units), lawsOnlyInTo, lawsOnlyInFrom, units })
  },
  {
    name: 'law-diff',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number, from: LawStationId, to: LawStationId) => `${gp}-${inr}-${from}-${to}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

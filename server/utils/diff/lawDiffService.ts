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

import type { LawDiffResponse, LawStationId, LawStationOption, TraceLink } from '#shared/types'
import { LAW_STATION_LABEL, LAW_STATION_ORDER } from '#shared/utils/lawStations'
import { diffLawPackage, summarizeDiff } from './lawDiff'
import { findLawStations, MISSING_STATION_REASON } from './stationDocuments'
import { parseLawUnits, parseLawUnitsFromRis } from '../lawtext/lawUnits'
import { extractBgblLink, findLastRvLink, parseStages } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import { getRisMapForGp } from '../ris/begutCorpus'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { fetchDocument } from '../upstream/fetchDocument'

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
      fetchDocument(fromHtml ?? found.get(from)!.xml!),
      fetchDocument(toHtml ?? found.get(to)!.xml!),
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

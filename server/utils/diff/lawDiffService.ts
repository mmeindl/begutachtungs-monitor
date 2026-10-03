/**
 * The § comparison of one consultation, between two stations of its law text
 * (docs/ris-join.md §6, docs/architecture.md §12.18).
 *
 * Nuxt-aware glue around the pure modules in `lawtext/` and `diff/lawDiff.ts`:
 * each station to the document Parliament publishes for it, fetches the two
 * the caller asked for (leaf cache per URL, 24 h — published documents do not
 * change), diffs them, caches the result per pair.
 *
 * Unavailability is a normal answer, not an error, and it comes in three
 * kinds the reader can tell apart: the station does not exist yet (no
 * Regierungsvorlage, no Ausschussfassung), its text is published only as a
 * PDF, or the text would not divide into paragraphs.
 *
 * PDF-only is a property of the individual document, never of a period, which
 * is why the RIS fallback below is keyed on the document being absent rather
 * than on the GP. Measured over three periods (scripts/corpus/stationen.ts,
 * 17.09.2026): 276 of 353 GP-XXVII drafts do publish their Gesetzestext as
 * HTML, and every single one of the 296 Regierungsvorlagen, 80 Ausschuss- and
 * 59 Plenarfassungen does.
 */

import type { LawDiffResponse, LawPackageEntry, LawStationId, LawStationOption, TraceLink } from '#shared/types'
import { bgblShort } from '#shared/utils/format'
import { LAW_STATION_LABEL, LAW_STATION_ORDER } from '#shared/utils/lawStations'
import { diffLawPackage, scopeToDraft, summarizeDiff } from './lawDiff'
import { findLawStations, missingStationReason } from './stationDocuments'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../lawtext/lawUnits'
import { bundlesOtherDrafts, extractBgblLink, otherBundledDrafts, findComparisonRvLink, findLastRvLink, findRvLinks, parseStages } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import { getRisMapForGp } from '../ris/begutCorpus'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { fetchDocument } from '../upstream/fetchDocument'

/**
 * The draft's own law text as units, for cutting a later pair to its laws —
 * Parliament's HTML, else the RIS XML the station carries for a PDF-only
 * draft. Null when neither is readable: then nothing is cut.
 */
async function readDraftUnits(station: { html: string | null; xml: string | null } | undefined): Promise<LawUnit[] | null> {
  const url = station?.html ?? station?.xml
  if (!url) return null
  try {
    const doc = await fetchDocument(url)
    const units = station!.html ? parseLawUnits(doc) : parseLawUnitsFromRis(doc)
    return units.length ? units : null
  } catch {
    return null
  }
}

export const getLawDiff = defineCachedFunction(
  async (gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<LawDiffResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const content = detail.content ?? {}
    const found = findLawStations(content)

    // The draft's fallback: Parliament serves a PDF for about a fifth of the
    // GP-XXVII drafts (77 of 353, scripts/corpus/stationen.ts), and the RIS
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
     * The kundgemachte Fassung — the one station that does not live at
     * Parliament (docs/architecture.md §12.33).
     *
     * The way there is a lookup, not a search: the Regierungsvorlage carries
     * the Fundstelle as structured data (`status.bgbllinks`), and RIS returns
     * exactly one record for that citation. If any of it fails the station is
     * simply absent — the comparison of the other four must not hang on it.
     */
    let bgblLink: TraceLink | null = null
    let act: LawDiffResponse['largerAct'] = null
    // Whether the Vorlage bundles this draft with others — read off the same
    // Vorlage detail the Kundmachung comes from, so it costs no request.
    let bundled: boolean | null = null
    let otherDrafts: { gp: string; inr: number }[] = []
    try {
      // The Kundmachung of the Vorlage whose text this comparison reads, not
      // of the latest one: a split draft has one per Vorlage.
      const rvText = found.get('rv')
      const rvLink = findComparisonRvLink(parseStages(content.stages), rvText?.html ?? rvText?.fallbackUrl)
      if (rvLink) {
        const rv = await getGegenstand(rvLink.gp, 'I', rvLink.inr)
        bundled = bundlesOtherDrafts(rv.content?.preconst, gp, inr)
        otherDrafts = otherBundledDrafts(rv.content?.preconst, gp, inr)
        const nummer = extractBgblLink(rv.content?.status?.bgbllinks)?.number
        const doc = nummer ? await getBgblDocument(nummer) : null
        if (doc?.xml && nummer) {
          found.set('bgbl', { id: 'bgbl', html: null, xml: doc.xml, fallbackUrl: doc.html ?? doc.page })
          bgblLink = { label: `${nummer} (RIS)`, url: doc.page }
          act = { citation: bgblShort(nummer), title: doc.kurztitel }
        }
      }
    } catch {
      // Without a Kundmachung the parliamentary stations are all there is.
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
      lawsOutsideDraft: [],
      addedLaws: [],
      droppedLaws: [],
      bundledWithOtherDrafts: bundled === true,
      otherDrafts,
      largerAct: null,
      units: [],
      ...extra,
    })

    // Whether the stage record links a Vorlage, asked apart from the text
    // documents: a Vorlage without an accepted Gesetzestext is not „noch
    // keine Regierungsvorlage" (`missingStationReason`).
    let rvLinked = false
    try {
      rvLinked = findLastRvLink(parseStages(content.stages)) !== null
    } catch {
      // An unreadable stage record claims nothing either way.
    }
    for (const id of [to, from]) {
      if (!found.has(id)) return answer(missingStationReason(id, rvLinked))
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

    // Each side brings its own format now that the Kundmachung is among the
    // stations: Parliament HTML is read by `parseLawUnits`, RIS XML by
    // `parseLawUnitsFromRis`. Until 19.09.2026 the XML sat fixed on the left
    // side, because the draft was the only station that could arrive that way.
    const fromHtml = found.get(from)!.html
    const toHtml = found.get(to)!.html
    const fromSource: LawDiffResponse['fromSource'] = fromHtml ? 'parlament' : 'ris'
    const toSource: LawDiffResponse['fromSource'] = toHtml ? 'parlament' : 'ris'
    const [fromDoc, toDoc] = await Promise.all([
      fetchDocument(fromHtml ?? found.get(from)!.xml!),
      fetchDocument(toHtml ?? found.get(to)!.xml!),
    ])
    let fromUnits = fromHtml ? parseLawUnits(fromDoc) : parseLawUnitsFromRis(fromDoc)
    let toUnits = toHtml ? parseLawUnits(toDoc) : parseLawUnitsFromRis(toDoc)

    /*
     * Between two LATER stations of a Vorlage that bundles this draft with
     * others, only the draft's laws (docs/architecture.md §12.33,
     * 30.09.2026). Both sides then carry the whole Sammelgesetz, every
     * Artikel pairs, and `diffLawPackage` has nothing to cut — 17/ME XXVIII
     * counted 629 units of the Informationsfreiheits-Anpassungsgesetz for a
     * draft that brought 39 of them.
     *
     * Only where Parliament's record says the Vorlage bundles other drafts:
     * a law the Ressort added to its own Vorlage is part of THIS Vorlage, and
     * what the committee did to it belongs in the committee's comparison.
     * Where nothing can be cut — the draft's text unreadable, or its laws
     * the whole text (XXVII 6/ME and 11/ME: one law, two drafts) — the
     * counts stay those of the whole text, and `bundledWithOtherDrafts`
     * lets the page say so.
     */
    let lawsOutsideDraft: LawPackageEntry[] = []
    if (from !== 'me' && bundled === true) {
      const draft = await readDraftUnits(found.get('me'))
      if (draft) {
        const scoped = scopeToDraft(draft, fromUnits, toUnits)
        fromUnits = scoped.from
        toUnits = scoped.to
        lawsOutsideDraft = scoped.outside
      }
    }
    // Named only where the draft is one part of the act; a Kundmachung of
    // the draft's own Vorlage needs no introduction.
    const largerAct = to === 'bgbl' && bundled === true ? act : null

    // A Vorlage built from this draft alone: the laws it adds are the
    // Ressort's own, and stay in the comparison (`keepAddedLaws`). Only for
    // ME→RV — a law that appears later may be a committee's, and a later
    // Vorlage merged in there is no part of this record.
    const keepAddedLaws = from === 'me' && to === 'rv' && bundled === false
    // A law the draft carried and the Vorlage does not is the Ressort's
    // cut only where the draft went into this one Vorlage: a draft split
    // into two (XXVII 21/ME, XXVIII 74/ME) can carry it in the other.
    let rvCount = 0
    try {
      rvCount = new Set(findRvLinks(parseStages(content.stages)).map((l) => `${l.gp}/${l.inr}`)).size
    } catch {
      // An unreadable stage record proves nothing; the law stays named, not shown.
    }
    const keepDroppedLaws = keepAddedLaws && rvCount === 1
    const { units, lawsOnlyInTo, lawsOnlyInFrom, addedLaws, droppedLaws, unpaired } = diffLawPackage(fromUnits, toUnits, { keepAddedLaws, keepDroppedLaws })
    if (unpaired) {
      // Showing the units here would put the whole draft under „entfallen"
      // and the whole later text under „neu" — a claim about the draft the
      // documents do not make (docs/architecture.md §12.18, Nachtrag).
      return answer(
        'Die Artikel der beiden Texte ließen sich keinem gemeinsamen Gesetz zuordnen. Ein Vergleich Paragraph für Paragraph würde deshalb jede Bestimmung als entfallen und als neu zeigen.',
        { fromSource, toSource },
      )
    }
    if (units.length === 0) {
      return answer('Der Gesetzestext ließ sich nicht in Paragraphen gliedern.', { fromSource, toSource })
    }
    return answer(null, {
      fromSource,
      toSource,
      stats: summarizeDiff(units),
      lawsOnlyInTo,
      lawsOnlyInFrom,
      addedLaws,
      droppedLaws,
      lawsOutsideDraft,
      largerAct,
      units,
    })
  },
  {
    name: 'law-diff',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number, from: LawStationId, to: LawStationId) => `${gp}-${inr}-${from}-${to}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

/**
 * The § comparison of one consultation, between two stations of its law text.
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
 *
 * **A failure is not an answer** (22.10.2026). Four reads
 * here ended in a catch, and the answer they left was cached for a day: a
 * RIS timeout became „ist bisher nicht als Gesetz kundgemacht worden" on the
 * Kundmachung's own comparison, a RIS map that did not load became „ist im
 * RIS nicht veröffentlicht", a Vorlage record that did not arrive left
 * `bundled` unknown — so a Sammelgesetz was counted whole, under no note,
 * as if every change in it were the draft's — and the draft's own text not
 * arriving became „lässt sich im Text nicht trennen". Now the reads whose
 * answer the comparison states throw, and the section says it is
 * unavailable right now. Only the Kundmachung beside a pair that does not
 * reach it is optional: that answer goes out without the station and is
 * not stored (`cache/gathered.ts`).
 */

import type { LawDiffResponse, LawPackageEntry, LawStationId, LawStationOption, ProcedureRoot, TraceLink, TreatyKind } from '#shared/types'
import { bgblShort } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { meRoot, rootKey } from '#shared/utils/procedureRoot'
import { LAW_STATION_ORDER, firstTextNameOf, lawStationGenitiveDe, lawStationLabelOf } from '#shared/utils/lawStations'
import { diffLawPackage, scopeToDraft, summarizeDiff } from './lawDiff'
import { findLawStations, missingStationReason, motionTextOf } from './stationDocuments'
import { parseLawUnits, parseLawUnitsFromRis, type LawUnit } from '../lawtext/lawUnits'
import { bgblViaObjection } from '../parliament/bundesratObjection'
import { bundlesOtherDrafts, extractBgblLink, otherBundledDrafts, findComparisonRvLink, findLastRvLink, findRvLinks, parseStages } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import { bundesratVariantOf, pageKindOf, treatyKindOf } from '../parliament/vorlageDetailAssembly'
import { getRisMapForGp } from '../ris/begutCorpus'
import { getBgblDocument } from '../ris/bgblService'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { fetchDocument } from '../upstream/fetchDocument'

/**
 * The draft's own law text as units, for cutting a later pair to its laws —
 * Parliament's HTML, else the RIS XML the station carries for a PDF-only
 * draft. Null when neither is readable: then nothing is cut.
 *
 * The fetch stands OUTSIDE the try, the parse inside it. Null says
 * „Welche Änderungen aus diesem Entwurf stammen, lässt sich im Text nicht
 * trennen" on the page (`outsideDraftNote`), which is a fact about a
 * document we read, never about one that did not arrive.
 */
async function readDraftUnits(station: { html: string | null; xml: string | null } | undefined): Promise<LawUnit[] | null> {
  const url = station?.html ?? station?.xml
  if (!url) return null
  const doc = await fetchDocument(url)
  try {
    const units = station!.html ? parseLawUnits(doc) : parseLawUnitsFromRis(doc)
    return units.length ? units : null
  } catch {
    return null
  }
}

/**
 * The comparison of one pair — cached, and stored only when complete (`getLawDiff`).
 *
 * Rooted on a Gegenstand (10.11.2026): a Ministerialentwurf as always, or a
 * Regierungsvorlage or Antrag that came to the Nationalrat without one. On
 * those two the item IS the Vorlage the draft's branches below look for —
 * its Kundmachung is its own `status.bgbllinks`, it bundles no draft, and
 * there is no draft text to fall back to in RIS.
 */
const readLawDiff = defineCachedFunction(
  async (root: ProcedureRoot, from: LawStationId, to: LawStationId): Promise<Gathered<LawDiffResponse>> => {
    const { gp, inr } = root
    const isMe = root.ityp === 'ME'
    const detail = await getGegenstand(gp, root.ityp, inr)
    const content = detail.content ?? {}
    const found = findLawStations(content, root.ityp)
    // The first text's own name where the item is no Regierungsvorlage but
    // stands at its station — a committee's motion, a motion of the
    // Bundesrat (`firstTextNameOf`, 14.11.2026): every label and sentence
    // below names the `rv` station by it.
    const first = root.ityp === 'I' ? firstTextNameOf({ itemKind: pageKindOf('I', content.doktyp), variant: bundesratVariantOf(content.doktyp) }) : null

    // The draft's fallback: Parliament serves a PDF for about a fifth of the
    // GP-XXVII drafts (77 of 353, scripts/corpus/stationen.ts), and the RIS
    // holds the same text as legistic XML. Only ever the draft side — the
    // parliamentary stations are published as HTML without exception in the
    // three measured periods.
    //
    // No catch on the RIS map: without it there is no telling whether RIS
    // has the text, and the sentence for a PDF-only draft says exactly that
    // („… und ist im RIS nicht veröffentlicht"). The map is the period's,
    // cached and prewarmed; it fails only cold and with RIS down.
    const meStation = found.get('me')
    let risLink: TraceLink | null = null
    let risRowExists = false
    if (isMe && meStation && !meStation.html) {
      const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
      risRowExists = Boolean(row?.risId)
      meStation.xml = row?.risDocument?.xml ?? null
      if (meStation.xml) risLink = { label: 'Ministerialentwurf, Gesetzestext (RIS)', url: row?.risUrl ?? meStation.xml }
    }

    /**
     * The kundgemachte Fassung — the one station that does not live at
     * Parliament.
     *
     * The way there is a lookup, not a search: the Regierungsvorlage carries
     * the Fundstelle as structured data (`status.bgbllinks`), and RIS returns
     * exactly one record for that citation. A Vorlage without a Fundstelle,
     * or a citation RIS has no readable record for, leaves the station absent
     * — an answer. A lookup that FAILS is not one (see the header): the pair
     * that compares against the Kundmachung throws; every other pair goes
     * out without the station and is not stored, because the comparison of
     * the other four must not hang on it.
     */
    let bgblLink: TraceLink | null = null
    let act: LawDiffResponse['largerAct'] = null
    // Whether the Vorlage bundles this draft with others — read off the same
    // Vorlage detail the Kundmachung comes from, so it costs no request.
    let bundled: boolean | null = null
    let otherDrafts: { gp: string; inr: number }[] = []
    // The Fundstelle the Vorlage names, read or not: without a readable RIS
    // text the station is absent, and the sentence for that must not deny it
    // (`missingStationReason`).
    let promulgatedAs: string | null = null
    // False where the Kundmachung's lookup failed and this pair could do
    // without it — the answer is then served and not stored.
    let complete = true
    // The Kundmachung of the Vorlage whose text this comparison reads, not
    // of the latest one: a split draft has one per Vorlage.
    const rvText = found.get('rv')
    const rvLink = isMe ? findComparisonRvLink(parseStages(content.stages), rvText?.html ?? rvText?.fallbackUrl) : null
    if (rvLink || !isMe) {
      // No catch: the record decides `bundled`, and with it what this
      // comparison counts (`scopeToDraft`, `keepAddedLaws`) and whether the
      // page names the act. Parliament not answering throws, as it does for
      // the draft's own record above. A Vorlage or Antrag is its own record.
      const rv = rvLink ? await getGegenstand(rvLink.gp, 'I', rvLink.inr) : detail
      bundled = isMe ? bundlesOtherDrafts(rv.content?.preconst, gp, inr) : false
      otherDrafts = isMe ? otherBundledDrafts(rv.content?.preconst, gp, inr) : []
      // Where the Bundesrat objected, Parliament links the Kundmachung on the
      // Einspruch's own item, not on the law (14.11.2026,
      // `bgblViaObjection`): after a Beharrungsbeschluss it is the text the
      // Nationalrat decided, after a changed decision the changed text — the
      // whole way from the first text to the law either way.
      // A failed read of the Einspruch is handled like the document's below.
      let nummer = extractBgblLink(rv.content?.status?.bgbllinks)?.number ?? null
      if (!nummer) {
        try {
          const item: ProcedureRoot = rvLink ? { gp: rvLink.gp, ityp: 'I', inr: rvLink.inr } : root
          nummer = (await bgblViaObjection(item, rv.content?.phase))?.number ?? null
        } catch (err) {
          if (from === 'bgbl' || to === 'bgbl') throw err
          complete = false
        }
      }
      promulgatedAs = nummer ? bgblShort(nummer) : null
      let doc: Awaited<ReturnType<typeof getBgblDocument>> = null
      if (nummer) {
        try {
          doc = await getBgblDocument(nummer)
        } catch (err) {
          if (from === 'bgbl' || to === 'bgbl') throw err
          complete = false
        }
      }
      if (doc?.xml && nummer) {
        found.set('bgbl', { id: 'bgbl', html: null, xml: doc.xml, fallbackUrl: doc.html ?? doc.page })
        bgblLink = { label: `${nummer} (RIS)`, url: doc.page }
        act = { citation: bgblShort(nummer), title: doc.kurztitel }
      }
    }

    const comparable = (id: LawStationId) => Boolean(found.get(id)?.html) || Boolean(found.get(id)?.xml)

    const documentOf = (id: LawStationId): TraceLink | null => {
      const station = found.get(id)
      if (!station) return null
      if (id === 'me' && !station.html && risLink) return risLink
      if (id === 'bgbl' && bgblLink) return bgblLink
      const url = station.html ?? station.fallbackUrl
      return url ? { label: `${lawStationLabelOf(id, first)}, Gesetzestext`, url } : null
    }

    // Every station this draft has, comparable or not: the selector has to
    // show a PDF-only station as present, or the reader reads its absence as
    // "parliament never touched the text".
    const stations: LawStationOption[] = LAW_STATION_ORDER.filter((id) => found.has(id)).map((id) => ({
      id,
      label: lawStationLabelOf(id, first),
      comparable: comparable(id),
      document: documentOf(id),
    }))

    const answer = (reason: string | null, extra: Partial<LawDiffResponse> = {}): Gathered<LawDiffResponse> => ({
      value: {
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
      },
      complete,
    })

    // Whether the stage record links a Vorlage, asked apart from the text
    // documents: a Vorlage without an accepted Gesetzestext is not „noch
    // keine Regierungsvorlage" (`missingStationReason`).
    let rvLinked = root.ityp === 'I'
    let lastRvLink: ReturnType<typeof findLastRvLink> = null
    try {
      if (isMe) lastRvLink = findLastRvLink(parseStages(content.stages))
      if (isMe) rvLinked = lastRvLink !== null
    } catch {
      // An unreadable stage record claims nothing either way.
    }
    // A linked Vorlage without a Gesetzestext may be a treaty's, whose text
    // the comparison does not read (`missingStationReason`). Asked only on
    // that path; a failed read keeps the plain sentence and is not stored.
    let rvTreaty: TreatyKind | null = null
    if (lastRvLink && !found.has('rv') && (from === 'rv' || to === 'rv')) {
      try {
        rvTreaty = treatyKindOf((await getGegenstand(lastRvLink.gp, 'I', lastRvLink.inr)).content)
      } catch {
        complete = false
      }
    }
    for (const id of [to, from]) {
      if (!found.has(id)) return answer(missingStationReason(id, rvLinked, promulgatedAs, first, first?.kind === 'bundesratsantrag' && motionTextOf(content) !== null, rvTreaty))
    }
    if (!comparable(from)) {
      // A text only as PDF is „nicht lesbar", and the sentence says „nur als
      // PDF": the source chose the form, the comparison does not read it
      // (`shared/utils/gaps.ts`).
      return answer(gapDe(
        'unreadable',
        from !== 'me'
          ? `Den Gesetzestext ${lawStationGenitiveDe(from, first)} gibt es nur als PDF.`
          : risRowExists
            ? 'Den Gesetzestext des Entwurfs führt das Parlament nur als PDF, und das RIS bietet ihn nicht als XML an.'
            : 'Den Gesetzestext des Entwurfs führt das Parlament nur als PDF, das RIS gar nicht.',
      ))
    }
    if (!comparable(to)) {
      return answer(gapDe('unreadable', `Den Gesetzestext ${lawStationGenitiveDe(to, first)} gibt es nur als PDF.`))
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
     * A text that parses into no § at all, said for that text (19.11.2026).
     * `diffLawPackage` calls a comparison unpaired only where both sides have
     * units, so one empty side went through and the page showed the other
     * text whole as „neu" or „entfallen" — every § of 43/ME XXVIII's
     * Vorlage as new, read against a draft page without the template's
     * classes. Asked of the texts as read, before `scopeToDraft`: a later
     * pair cut to the draft's laws may rightly leave one side empty (the
     * committee dropped the draft's law), and that is a finding, not a gap.
     */
    if (!fromUnits.length || !toUnits.length) {
      const side = (id: LawStationId) => `Der Gesetzestext ${lawStationGenitiveDe(id, first)} ließ sich nicht in Paragraphen gliedern.`
      return answer(
        gapDe('unreadable', !fromUnits.length && !toUnits.length ? 'Der Gesetzestext ließ sich nicht in Paragraphen gliedern.' : side(fromUnits.length ? to : from)),
        { fromSource, toSource },
      )
    }

    /*
     * Between two LATER stations of a Vorlage that bundles this draft with
     * others, only the draft's laws (30.09.2026). Both sides then carry the whole Sammelgesetz, every
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
      if (isMe) rvCount = new Set(findRvLinks(parseStages(content.stages)).map((l) => `${l.gp}/${l.inr}`)).size
    } catch {
      // An unreadable stage record proves nothing; the law stays named, not shown.
    }
    const keepDroppedLaws = keepAddedLaws && rvCount === 1
    // `beyondCeiling`: a long § is shown with its changed words marked, not
    // struck and inserted whole (`DiffOptions`, 19.11.2026).
    const { units, lawsOnlyInTo, lawsOnlyInFrom, addedLaws, droppedLaws, unpaired } = diffLawPackage(fromUnits, toUnits, { keepAddedLaws, keepDroppedLaws, beyondCeiling: true })
    if (unpaired) {
      // Showing the units here would put the whole draft under „entfallen"
      // and the whole later text under „neu" — a claim about the draft the
      // documents do not make.
      return answer(
        gapDe('unreadable', 'Die Artikel der beiden Texte ließen sich keinem gemeinsamen Gesetz zuordnen. Ein Vergleich Paragraph für Paragraph würde deshalb jede Bestimmung als entfallen und als neu zeigen.'),
        { fromSource, toSource },
      )
    }
    if (units.length === 0) {
      return answer(gapDe('unreadable', 'Der Gesetzestext ließ sich nicht in Paragraphen gliedern.'), { fromSource, toSource })
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
    // `rootKey` keeps a draft's key what it always was (`${gp}-${inr}`).
    getKey: (root: ProcedureRoot, from: LawStationId, to: LawStationId) => `${rootKey(root)}-${from}-${to}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
    // An answer without the Kundmachung, for want of RIS, is not kept.
    validate: onlyComplete,
  },
)

/**
 * The comparison of one pair, for every caller: the route, the § names and
 * the Begründungsvergleich. The cached half above, unwrapped — the two
 * derived caches that read it use `units` and `available`, which an answer
 * without the Kundmachung carries in full.
 */
export async function getLawDiff(gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<LawDiffResponse> {
  return (await readLawDiff(meRoot(gp, inr), from, to)).value
}

/** The same for any root — a Vorlage or Antrag without a Begutachtung. */
export async function getRootLawDiff(root: ProcedureRoot, from: LawStationId, to: LawStationId): Promise<LawDiffResponse> {
  return (await readLawDiff(root, from, to)).value
}

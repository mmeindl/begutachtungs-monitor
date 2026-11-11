/**
 * Whether a Land's draft implements EU law, which act, and until when —
 * the Bund's fact (`euService.ts`) on the nine Länder's draft pages
 * (04.11.2026).
 *
 * Nuxt-aware glue around pure modules, the Bund's and three of the Länder's:
 *
 *  - WHETHER: the Land's own EU statement — the WFA heading in its
 *    documents, or a headed EU passage of the general part — with the
 *    Vorblatt's weight; else the general part's prose by rule D5
 *    (`landErlaeuterungen.ts`).
 *  - WHICH: the statement's own acts where it names them (Oberösterreich's
 *    section V, Burgenland's Vorblatt), the law text — its blocks and its
 *    quoted hint Ziffern (`landGesetzestext.ts`) — and Oberösterreich's
 *    „Umsetzungshinweis:" per provision (`entryHinweise`). Never from the
 *    prose road.
 *  - UNTIL WHEN: the Cellar, through the Bund's cached door
 *    (`cellarService.ts`) — one entry per CELEX for both.
 *  - WHETHER AN ACT IS NEW (D4): the Land's consolidated law in force on
 *    the first day of the Begutachtung (`landesrecht.ts`), each hit read by
 *    the Bund's `transposesAct`. No per-Paragraph check of the addressed §
 *    as the Bund has: a Land's draft PDF carries no Stammnorm the reader
 *    could resolve, and the search answers the question D4 asks anyway.
 *
 * READS EACH DOCUMENT ONCE. The Erläuterungen' reader
 * (`laender/landExplanationsRead.ts`) hands back the pages it read — the
 * Erläuterungen' document and the draft's, the same one where the Land
 * files both in one PDF — and every reading here runs over those pages.
 * The read is shared with the Bund fact on the same draft
 * (`laender/landDraftTexts.ts`).
 *
 * **A failure is not an answer**. A document that cannot be
 * fetched throws: whether the draft is an EU matter is the question
 * itself. A Cellar or Landesrecht read that fails costs one act its
 * deadline: the answer goes out without it and is not stored
 * (`cache/gathered.ts`).
 */
import type { EuActView, EuRechtResponse, LandCode } from '#shared/types'
import type { EuAct } from './actCitations'
import { deadlineOf } from './cellar'
import { transpositionOf } from './cellarService'
import { askedOfLawInForce, transposesAct, bundesrechtPhrase } from './bundesrecht'
import { headDocumentTransposes, LANDESRECHT_API, landesrechtHits, landesrechtSearchParams, lgblKey, type LrKonsSearchAnswer } from './landesrecht'
import { landIsNew, readLandEu } from './landEuReading'
import { konsJson } from '../ris/konsLaw'
import { fetchParagraphXml } from '../kons/konsCache'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { readLandDraftTexts } from '../laender/landDraftTexts'
import { NOT_A_DRAFT } from '../laender/texts/read'
import type { LandDraftRecord } from '../laender/texts/stations'

/**
 * RIS's answer for one phrase in one Land's law in force on one day — rule
 * D4 (`landesrecht.ts`), as it arrived; the hits are read from it fresh on
 * every call. Cached as long as a document: the law as it stood on a past
 * day does not change. Throws where RIS did not answer.
 */
const fetchLandesrechtAnswer = defineCachedFunction(
  async (land: LandCode, phrase: string, asOf: string): Promise<LrKonsSearchAnswer> =>
    (await konsJson(`${LANDESRECHT_API}?${new URLSearchParams(landesrechtSearchParams(phrase, asOf, land))}`)) as LrKonsSearchAnswer,
  { name: 'eu-landesrecht', getKey: (land: LandCode, phrase: string, asOf: string) => `${land}|${phrase}|${asOf}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** A Paragraph named in more hits than one page holds is transposed many times over; it is not read. */
const MANY_HITS = 100

/** The plain text of a RIS § document — enough to find a citation in it. */
function risText(xml: string): string {
  return xml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

/**
 * True where a Paragraph of the Land's law in force transposes the act,
 * false where none does, null where RIS did not answer — the Bund's
 * `standingInBundesrecht`, over Landesrecht.
 */
async function standingInLandesrecht(act: EuAct, asOf: string, land: LandCode, ownLgbl: string | null): Promise<boolean | null> {
  const phrase = bundesrechtPhrase(act.label)
  if (!phrase) return false
  try {
    const { total, hits } = landesrechtHits(await fetchLandesrechtAnswer(land, phrase, asOf))
    if (!hits.length) return false
    if (total > MANY_HITS) return true
    for (const h of hits) {
      if (!h.xmlUrl) continue
      const text = risText(await fetchParagraphXml(h.nor, h.xmlUrl))
      if (h.head ? headDocumentTransposes(text, act.celex, asOf, ownLgbl, phrase) : transposesAct(text, act.celex)) return true
    }
    return false
  } catch {
    return null
  }
}

function empty(reason: string, begutachtungStart: string | null = null): EuRechtResponse {
  return {
    available: false,
    unavailableReason: reason,
    marker: null,
    markerSource: null,
    vorblattSentence: null,
    acts: [],
    actsSource: null,
    begutachtungStart,
    sources: [],
  }
}

/** The fact for one Land's draft. */
export async function assembleLandEu(land: LandCode, detail: LandDraftRecord): Promise<Gathered<EuRechtResponse>> {
  const start = detail.draft.startedAt ?? null
  // The pages and the Erläuterungen, read once for this fact and the Bund's (`landDraftTexts.ts`).
  const texts = await readLandDraftTexts(land, detail)
  const erl = texts.erl
  if (erl.unavailableReason === NOT_A_DRAFT) return { value: empty(NOT_A_DRAFT, start), complete: true }
  let complete = texts.complete
  const input = texts.input

  // D4, has the Land transposed the act already? Asked as of the first day
  // of the Begutachtung — Burgenland dates none, so its Frist's end stands
  // in; without either the question is not asked and no deadline is
  // printed. Asked for every directive since 05.11.2026, dated or not
  // (`askedOfLawInForce`): 2002/73/EG has no deadline in the Cellar and
  // counted new on bgld-c372 although the Landes-Gleichbehandlungsgesetz
  // lists it in its Umsetzungshinweis.
  const asOf = start ?? detail.draft.deadline ?? null
  // The draft's own Kundmachung, where it has one: a head document lists it already.
  const stage = detail.draft.stage && detail.draft.stage !== 'unknown' ? detail.draft.stage : null
  const ownLgbl = stage?.station === 'bgbl' ? lgblKey(stage.detail) : null
  const standings = new Map<string, Promise<boolean | null>>()
  const newnessOf = async (act: EuAct) => {
    const asked = askedOfLawInForce(act.kind) && asOf !== null
    if (asked && !standings.has(act.celex)) standings.set(act.celex, standingInLandesrecht(act, asOf!, land, ownLgbl))
    const standing = asked ? await standings.get(act.celex)! : null
    return { asked, standing, isNew: landIsNew(act, asked, standing, asOf) }
  }

  // The decision, with D4 in front where the law text's hint decides: a
  // hint that restates only acts in force decides nothing (05.11.2026).
  let reading = readLandEu(input)
  if (reading.decision.source === 'gesetzestext') {
    const isNew = new Map<string, boolean | null>()
    for (const act of reading.law.acts) {
      const n = await newnessOf(act)
      if (n.asked && n.standing === null) complete = false
      isNew.set(act.celex, n.isNew)
    }
    reading = readLandEu(input, (celex) => isNew.get(celex) ?? null)
  }
  const { found, decision, named, base, sources } = reading
  if (!erl.available && !found && decision.source !== 'gesetzestext') return { value: empty(erl.unavailableReason ?? 'Zu diesem Entwurf sind keine Erläuterungen zu lesen.', start), complete }
  if (!decision.marker) {
    // Read, and no fact: the Land says it is no EU matter, or says nothing.
    return { value: { ...empty('', start), available: true, unavailableReason: null, sources }, complete }
  }

  // UNTIL WHEN: the Cellar, per act; D4 as above.
  const acts: EuActView[] = []
  const answers = await Promise.all(named.map(async (act) => {
    const dates = await transpositionOf(act.celex)
    return { act, dates, ...(await newnessOf(act)) }
  }))
  for (const { act, dates, asked, standing, isNew } of answers) {
    if (dates === null) complete = false
    if (asked && standing === null) complete = false
    // EUR-Lex knows no such act: a citation error in the draft, not shown.
    if (dates && !dates.found) continue
    acts.push({
      kind: act.kind,
      label: act.label,
      celex: act.celex,
      eurLexUrl: act.eli,
      isNew,
      base: base.has(act.celex),
      transposition: act.kind === 'richtlinie' && dates ? deadlineOf(dates.dates) : null,
      adopted: dates?.adopted ?? null,
      title: dates?.title ?? null,
    })
  }

  return {
    value: {
      available: true,
      unavailableReason: null,
      marker: decision.marker,
      markerSource: decision.source,
      vorblattSentence: decision.marker === 'ueber-umsetzung' ? found?.statement.sentence ?? null : null,
      acts,
      actsSource: acts.length ? reading.actsSource : null,
      begutachtungStart: start,
      sources,
    },
    complete,
  }
}

/** The cached half of `getLandEuRecht`; an answer missing a read is served, not stored. */
export const readLandEuRecht = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftRecord): Promise<Gathered<EuRechtResponse>> => assembleLandEu(land, detail),
  {
    name: 'land-eu-recht',
    base: DERIVED_CACHE,
    getKey: (land: LandCode, number: string) => `${land}-${number}`,
    maxAge: 60 * 60 * 24,
    swr: false,
    validate: onlyComplete,
  },
)

/** For a Land's draft, by its number, from the record its page reads (`readLandDraft`). */
export async function getLandEuRecht(land: LandCode, number: string, detail: LandDraftRecord): Promise<EuRechtResponse> {
  return (await readLandEuRecht(land, number, detail)).value
}

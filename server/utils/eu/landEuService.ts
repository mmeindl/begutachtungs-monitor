/**
 * Whether a Land's draft implements EU law, which act, and until when —
 * the Bund's fact (`euService.ts`) on the nine Länder's draft pages
 * (docs/architecture.md §12.66, Nachtrag 2 of 04.11.2026).
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
 *
 * **A failure is not an answer** (§12.13). A document that cannot be
 * fetched throws: whether the draft is an EU matter is the question
 * itself. A Cellar or Landesrecht read that fails costs one act its
 * deadline: the answer goes out without it and is not stored
 * (`cache/gathered.ts`).
 */
import type { EuActView, EuRechtResponse, LandCode } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import type { EuAct } from './actCitations'
import { deadlineOf } from './cellar'
import { transpositionOf } from './cellarService'
import { transposesAct, bundesrechtPhrase } from './bundesrecht'
import { headDocumentTransposes, LANDESRECHT_API, landesrechtHits, landesrechtSearchParams, lgblKey, type LrKonsSearchAnswer } from './landesrecht'
import { landIsNew, readLandEu } from './landEuReading'
import { konsJson } from '../ris/konsLaw'
import { fetchParagraphXml } from '../kons/konsCache'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { readLandExplanations } from '../laender/landExplanationsRead'
import { NOT_A_DRAFT, pdfPages } from '../laender/texts/read'
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
  const read = await readLandExplanations(land, detail)
  const erl = read.response
  if (erl.unavailableReason === NOT_A_DRAFT) return { value: empty(NOT_A_DRAFT, start), complete: true }

  // The draft's text: read with the Erläuterungen, or — where they could
  // not be parsed and the draft is a document of its own — now, once.
  let complete = !read.draftFailed
  let draftPages = read.draftUrl ? read.pages.get(read.draftUrl) ?? null : null
  if (read.draftUrl && !draftPages && !read.draftFailed) {
    draftPages = await pdfPages(read.draftUrl).catch(() => {
      complete = false
      return null
    })
  }
  const reading = readLandEu({
    land,
    documents: detail.draft.documents.map((d) => ({ title: d.title, url: safeExternalUrl(d.url) ?? d.url })),
    pages: read.pages,
    explanations: { available: erl.available, general: erl.general, particular: erl.particular, url: erl.document?.url ?? null },
    draft: { url: read.draftUrl, pages: draftPages },
  })
  const { found, decision, named, base, sources } = reading
  if (!erl.available && !found && decision.source !== 'gesetzestext') return { value: empty(erl.unavailableReason ?? 'Zu diesem Entwurf sind keine Erläuterungen zu lesen.', start), complete }
  if (!decision.marker) {
    // Read, and no fact: the Land says it is no EU matter, or says nothing.
    return { value: { ...empty('', start), available: true, unavailableReason: null, sources }, complete }
  }

  // UNTIL WHEN, and D4: has the Land transposed the directive already? Asked
  // as of the first day of the Begutachtung — Burgenland dates none, so its
  // Frist's end stands in; without either the question is not asked and no
  // deadline is printed.
  const asOf = start ?? detail.draft.deadline ?? null
  // The draft's own Kundmachung, where it has one: a head document lists it already.
  const stage = detail.draft.stage && detail.draft.stage !== 'unknown' ? detail.draft.stage : null
  const ownLgbl = stage?.station === 'bgbl' ? lgblKey(stage.detail) : null
  const acts: EuActView[] = []
  const answers = await Promise.all(named.map(async (act) => {
    const dates = await transpositionOf(act.celex)
    const asked = act.kind === 'richtlinie' && !!dates?.dates.length && asOf !== null
    const standing = asked ? await standingInLandesrecht(act, asOf!, land, ownLgbl) : null
    return { act, dates, asked, standing }
  }))
  for (const { act, dates, asked, standing } of answers) {
    if (dates === null) complete = false
    if (asked && standing === null) complete = false
    // EUR-Lex knows no such act: a citation error in the draft, not shown.
    if (dates && !dates.found) continue
    acts.push({
      kind: act.kind,
      label: act.label,
      celex: act.celex,
      eurLexUrl: act.eli,
      isNew: landIsNew(act, asked, standing, asOf),
      base: base.has(act.celex) && named.some((a) => a.celex !== act.celex && !base.has(a.celex)),
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

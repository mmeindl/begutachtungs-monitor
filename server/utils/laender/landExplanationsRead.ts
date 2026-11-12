/**
 * A Land's Erläuterungen, read from the Land's PDFs (23.10.2026) — the
 * reading `landExplanationsService.ts` caches for the page, with the pages
 * it read handed back beside the answer (04.11.2026), so the EU fact
 * (`eu/landEuService.ts`) reads the general part, the particular part, the
 * WFA and the law text out of ONE read of each document.
 *
 * No Nitro globals: the bytes come through `bytesOf` — the Land's door
 * (`landPdfBytes`) in the server, the corpus script's disk cache in
 * `scripts/corpus/euLaender.ts`, which so runs the page's own reading. The
 * plain pages may come through `pagesOf` instead: the page's section hands
 * in the server's cached read (`texts/pdfPagesService.ts`), so the draft's
 * PDF it shares with the comparison and the Begründungsvergleich is fetched
 * and parsed once. The pages with their weights (`styledPages`) always come
 * from the bytes.
 *
 * A „Zu …" entry names its §§ in brackets — „Zu Art. I Z 2 (§ 1 Abs. 3):" —
 * or only the draft's Ziffern, „Zu Z 1 und 3:" (Salzburg, about half of its
 * entries). Those are read off the draft's own instructions: „3. § 6 Abs 1
 * lautet …" says which § Ziffer 3 changes.
 */
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { LAND_NAME } from '#shared/utils/laender'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { addressOf } from '../diff/lawDiff'
import { landDraftUnits } from './landLawDiff'
import { headingZiffern, parseLandExplanations, type LandExplanationsParse } from './landExplanations'
import type { LawUnit } from '../lawtext/lawUnits'
import { amendedLawsOf } from './landTgu'
import { draftCandidates, isDraftWithExplanations, landPdfBytes, NOT_A_DRAFT, notADraft, pagesOfBytes, type PagesReader } from './texts/read'
import { styledPages } from './texts/styledPages'
import type { LandDraftRecord } from './texts/stations'

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 }
function romanValue(r: string): number {
  let total = 0
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]!] ?? 0
    total += v < (ROMAN[r[i + 1]!] ?? 0) ? -v : v
  }
  return total
}

/**
 * Each „Zu …" entry with the §§ it explains: from its brackets, or — where it
 * names only the draft's Ziffern — from the instructions those Ziffern are
 * (`units`, the text's own `landDraftUnits`). The law: the one the draft
 * amends, or in a package the one its Artikel number stands for.
 */
export function explainedParagraphs(parse: LandExplanationsParse, units: readonly LawUnit[] | null, laws: readonly string[]): LandExplanationsResponse['particular'] {
  const byZiffer = new Map<string, string>()
  for (const u of units ?? []) {
    const n = /^Z(\d+)$/.exec(u.id)?.[1]
    const para = /^§(\d+[a-z]*)/.exec(addressOf(u.heading) ?? '')?.[1]
    // „Artikel II" or — in the Land's own PDFs — „Artikel 2".
    const numbered = /Artikel\s+([IVXL]+|\d+)/.exec(u.articleNumber ?? '')?.[1] ?? 'I'
    const article = /^\d+$/.test(numbered) ? Number(numbered) : romanValue(numbered)
    if (n && para) byZiffer.set(`${article}|${n}`, para)
  }
  return parse.particular.map((e) => {
    const article = e.article ? (/^\d+$/.test(e.article) ? Number(e.article) : romanValue(e.article)) : 1
    const paras = e.paras.length ? e.paras : [...new Set(headingZiffern(e.heading).map((z) => byZiffer.get(`${article}|${z}`)).filter((p): p is string => Boolean(p)))]
    const law = laws.length === 1 ? laws[0]! : (e.article ? laws[article - 1] ?? null : null)
    return { law, paras, heading: e.heading, text: e.text }
  })
}

/**
 * The Länder whose Erläuterungen are read with each line's weight
 * (`styledPages`, 23.10.2026): Wien sets its headings in bold, many of
 * them unnumbered — „Ziel und Inhalt der Novelle", „Begründung",
 * „Hauptgesichtspunkte der Novelle". Oberösterreich and Salzburg number
 * theirs, and set letterheads, table rows and emphasis in bold: read so,
 * 333 of their documents changed — „Amt der Oö. Landesregierung" became a
 * heading in 74 — over the 540 the harness held and Wien's five drafts of
 * 2026, of which four gained headings, each of them right.
 */
const HEADINGS_BY_WEIGHT: ReadonlySet<LandCode> = new Set(['w'])

/** The Länder whose general part is a Vorblatt before „Erläuterungen:" (`vorblattParse`). */
const VORBLATT_AS_GENERAL: ReadonlySet<LandCode> = new Set(['bgld'])

/** A Land's PDF as bytes, by URL. */
export type LandBytesReader = (url: string) => Promise<Uint8Array>

/** The answer, and what was read to give it. */
export interface LandExplanationsRead {
  response: LandExplanationsResponse
  /**
   * Every document read, once each, by URL — its pages as the reading took
   * them: the Erläuterungen' document and, where it is another, the draft.
   */
  pages: Map<string, string[]>
  /** The draft's own text (`draftCandidates`), where one could be named; its pages are in `pages` when it was read. */
  draftUrl: string | null
  /** The draft's PDF was asked for and did not arrive — not an answer about its text. */
  draftFailed: boolean
}

const unavailable = (reason: string, publisher: string, document: LandExplanationsResponse['document'] = null): LandExplanationsResponse => ({
  available: false, unavailableReason: reason, document, publisher, labelled: false, general: [], particular: [],
})

/**
 * The Land's Erläuterungen of one draft: from the draft's PDF, or from a
 * document of their own where the Land files them so (Salzburg).
 */
export async function readLandExplanations(
  land: LandCode,
  detail: { draft: Pick<LandDraftRecord['draft'], 'title' | 'documents'> },
  bytesOf: LandBytesReader = landPdfBytes,
  pagesOf: PagesReader = async (url) => pagesOfBytes(await bytesOf(url)),
): Promise<LandExplanationsRead> {
  const publisher = `Land ${LAND_NAME[land]}`
  const pages = new Map<string, string[]>()
  const docs = detail.draft.documents
  const own = docs.find((d) => /erläuter/i.test(d.title))
  const candidates = draftCandidates(docs)
  const draft = candidates[0] ?? null
  const draftUrl = draft ? safeExternalUrl(draft.url) : null
  const doc = own ?? draft
  const url = doc ? safeExternalUrl(doc.url) : null
  const done = (response: LandExplanationsResponse, draftFailed = false): LandExplanationsRead => ({ response, pages, draftUrl, draftFailed })
  if (!doc || !url) return done(unavailable('Das Land hat zu diesem Entwurf keine Erläuterungen veröffentlicht.', publisher))
  const document = { label: own ? doc.title : `${doc.title} (Erläuterungen)`, url }
  const read = HEADINGS_BY_WEIGHT.has(land) ? await styledPages(await bytesOf(url)) : { pages: await pagesOf(url), bold: undefined }
  pages.set(url, read.pages)
  const ofDraft = (draftPages: string[]) => ({ units: landDraftUnits(draftPages), text: draftPages.join('\n') })
  // Erläuterungen in the draft's PDF are none where the one document the Land filed as the draft evidently is none (`notADraft`, `draftSource`).
  // Burgenland files draft and Erläuterungen as one „Entwurf und Erläuterungen": its own, and the draft's too.
  const inDraft = own && !isDraftWithExplanations(own.title) ? null : ofDraft(read.pages)
  if (inDraft && candidates.length === 1 && notADraft(inDraft)) return done(unavailable(NOT_A_DRAFT, publisher, { label: doc.title, url }))
  const parse = parseLandExplanations(read.pages, read.bold, { vorblatt: VORBLATT_AS_GENERAL.has(land) })

  // The draft's instructions, for entries that name only Ziffern — none from a draft that is none.
  let draftFailed = false
  let draftRead = inDraft
  if (!draftRead && parse && draftUrl) {
    const draftPages = draftUrl === url
      ? read.pages
      : await pagesOf(draftUrl).catch(() => {
          draftFailed = true
          return [] as string[]
        })
    if (!draftFailed) pages.set(draftUrl, draftPages)
    draftRead = ofDraft(draftPages)
  }
  if (!parse) return done(unavailable('In den Dokumenten des Landes fand der Monitor keine Erläuterungen, die er lesen kann.', publisher, document))
  const units = draftRead && !(candidates.length === 1 && notADraft(draftRead)) ? draftRead.units : null

  const particular = explainedParagraphs(parse, units, amendedLawsOf(detail.draft.title))
  return done({ available: true, unavailableReason: null, document, publisher, labelled: parse.labelled, general: parse.general, particular }, draftFailed)
}

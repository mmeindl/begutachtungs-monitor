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
import { gapDe } from '#shared/utils/gaps'
import type { LandCode, LandExplanationsResponse } from '#shared/types'
import { LAND_NAME } from '#shared/utils/laender'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { addressOf } from '../diff/lawDiff'
import { landDraftUnits } from './landLawDiff'
import { headingZiffern, parseLandExplanations, type LandExplanationsParse } from './landExplanations'
import type { LawUnit } from '../lawtext/lawUnits'
import { amendedLawsOf, packageArticles } from './landTgu'
import { draftByContent, draftCandidates, draftExplanationsDocument, isDraftWithExplanations, landPdfBytes, NOT_A_DRAFT, notADraft, pagesOfBytes, type PagesReader } from './texts/read'
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
/** A title's verbs for a law the draft does not amend (`amendedLawsOf`). */
const OTHER_VERB_RE = /\b(?:erlassen|aufgehoben|aufgelöst)\b/
/** „II" → 2, „2" → 2. */
const articleValue = (numeral: string) => (/^\d+$/.test(numeral) ? Number(numeral) : romanValue(numeral))

/**
 * Each „Zu …" entry with the §§ it explains: from its brackets, or — where it
 * names only the draft's Ziffern — from the instructions those Ziffern are
 * (`units`, the text's own `landDraftUnits`).
 *
 * The law: the one the entry's Artikel amends in the draft's own text
 * (`draftText`, `packageArticles`: „Artikel II Das Salzburger Ygesetz, LGBl
 * …, wird geändert wie folgt:"); where the draft opens fewer than two laws
 * so and its title names one, that law — where the title enacts or repeals
 * another, only for the one Artikel that numbers instructions (and for an
 * entry under no Artikel); otherwise none. Until
 * 20.11.2026 the Artikel's place in the title's list (`amendedLawsOf`)
 * decided, and the list leaves out what the draft enacts or repeals: with
 * one amended law every Artikel was that law — Kärnten 79014 enacts two
 * Abgabengesetze in Artikel I and II, and their passages explained §§ 1 to
 * 14 of the Motorbootabgabegesetz Artikel III amends.
 */
export function explainedParagraphs(parse: LandExplanationsParse, units: readonly LawUnit[] | null, title: string, draftText: string | null = null): LandExplanationsResponse['particular'] {
  const laws = amendedLawsOf(title)
  const byZiffer = new Map<string, string>()
  for (const u of units ?? []) {
    // „Z11a" under „11a", never under „11": a lettered instruction is its own (`segmentUnits`, 19.11.2026).
    const n = /^Z(\d+[a-z]*)$/.exec(u.id)?.[1]
    const para = /^§(\d+[a-z]*)/.exec(addressOf(u.heading) ?? '')?.[1]
    // „Artikel II" or — in the Land's own PDFs — „Artikel 2".
    const article = articleValue(/Artikel\s+([IVXL]+|\d+)/.exec(u.articleNumber ?? '')?.[1] ?? 'I')
    if (n && para) byZiffer.set(`${article}|${n}`, para)
  }
  /** The Ziffern the draft's instructions number in one Artikel, for a range („Z 3 bis 5" holds „3a"). */
  const zifferOf = (article: number) => [...byZiffer.keys()].filter((k) => k.startsWith(`${article}|`)).map((k) => k.slice(k.indexOf('|') + 1))
  // An entry under no Artikel is the first's only where the draft numbers
  // Ziffern in one Artikel (the Novelle beside its Inkrafttreten); in a
  // package its Ziffer could be any law's, and none is looked up (20.11.2026).
  const zifferArticles = new Set([...byZiffer.keys()].map((k) => k.slice(0, k.indexOf('|'))))
  const opened = new Map(packageArticles(draftText ?? '', laws).flatMap((a) => (a.numeral && a.key ? [[articleValue(a.numeral), a.key] as const] : [])))
  const lawOf = (article: number | null, named: boolean): string | null => {
    if (opened.size) return article === null ? null : opened.get(article) ?? null
    if (laws.length !== 1) return null
    // A title that enacts or repeals nothing names every law of the draft: its other Artikel are the Inkrafttreten's.
    if (!OTHER_VERB_RE.test(title)) return laws[0]!
    if (!named) return zifferArticles.size <= 1 ? laws[0]! : null
    return zifferArticles.size === 1 && zifferArticles.has(String(article)) ? laws[0]! : null
  }
  return parse.particular.map((e) => {
    const article = e.article ? articleValue(e.article) : zifferArticles.size > 1 ? null : 1
    const paras = e.paras.length || article === null ? e.paras : [...new Set(headingZiffern(e.heading, zifferOf(article)).map((z) => byZiffer.get(`${article}|${z}`)).filter((p): p is string => Boolean(p)))]
    return { law: lawOf(e.article ? article : null, e.article !== null), paras, heading: e.heading, text: e.text }
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
  /** The draft's own text (`draftCandidates`, `draftByContent`), where one could be named; its pages are in `pages` when it was read. */
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
  const own = draftExplanationsDocument(docs)
  const candidates = draftCandidates(docs)
  const draft = candidates[0] ?? null
  let draftUrl = draft ? safeExternalUrl(draft.url) : null
  const doc = own ?? draft
  const url = doc ? safeExternalUrl(doc.url) : null
  const done = (response: LandExplanationsResponse, draftFailed = false): LandExplanationsRead => ({ response, pages, draftUrl, draftFailed })
  // No document to read them from: said of the list, which proves no absence („hat das Land nicht veröffentlicht" until 21.11.2026).
  if (!doc || !url) return done(unavailable(gapDe('unreadable', 'Unter den Dokumenten zu diesem Entwurf fand der Monitor keine Erläuterungen.'), publisher))
  const document = { label: own ? doc.title : `${doc.title} (Erläuterungen)`, url }
  const read = HEADINGS_BY_WEIGHT.has(land) ? await styledPages(await bytesOf(url)) : { pages: await pagesOf(url), bold: undefined }
  pages.set(url, read.pages)
  let draftFailed = false
  // Among several candidates the draft is the one with law text in it (`draftByContent`): Tirol files its covering letter first.
  // The Erläuterungen are still read where they were — from the first, where the Land titles none as such.
  if (candidates.length > 1) {
    const readOnce = async (u: string): Promise<string[]> => {
      const got = pages.get(u) ?? (await pagesOf(u))
      pages.set(u, got)
      return got
    }
    const chosen = await draftByContent(candidates, readOnce).catch(() => {
      draftFailed = true
      return null
    })
    if (chosen) draftUrl = chosen.url
  }
  const ofDraft = (draftPages: string[]) => ({ units: landDraftUnits(draftPages), text: draftPages.join('\n') })
  // Erläuterungen in the draft's PDF are none where the one document the Land filed as the draft evidently is none (`notADraft`, `draftSource`).
  // Burgenland files draft and Erläuterungen as one „Entwurf und Erläuterungen": its own, and the draft's too.
  const inDraft = (own && !isDraftWithExplanations(own.title)) || draftUrl !== url ? null : ofDraft(read.pages)
  if (inDraft && candidates.length === 1 && notADraft(inDraft)) return done(unavailable(NOT_A_DRAFT, publisher, { label: doc.title, url }))
  const parse = parseLandExplanations(read.pages, read.bold, { vorblatt: VORBLATT_AS_GENERAL.has(land) })

  // The draft's instructions, for entries that name only Ziffern — none from a draft that is none.
  let draftRead = inDraft
  if (!draftRead && parse && draftUrl && !draftFailed) {
    const failed = () => {
      draftFailed = true
      return [] as string[]
    }
    const draftPages = pages.get(draftUrl) ?? (await pagesOf(draftUrl).catch(failed))
    if (!draftFailed) pages.set(draftUrl, draftPages)
    draftRead = ofDraft(draftPages)
  }
  // Where the record lists the Vorlage's Erläuterungen and none of the
  // draft's own (`draftExplanationsDocument`), the draft's PDF was read and
  // held none: said of the draft and of the list (21.11.2026) — „in den
  // Dokumenten des Landes" was loose beside readable ones of the Vorlage's.
  const vorlageOnly = !own && docs.some((d) => /^Regierungsvorlage, Erläuterungen$/.test(d.title))
  const unreadable = vorlageOnly
    ? 'Im Entwurf fand der Monitor keine Erläuterungen, die er lesen kann. Unter den Dokumenten zu diesem Entwurf stehen Erläuterungen nur zur Regierungsvorlage.'
    : 'In den Dokumenten des Landes fand der Monitor keine Erläuterungen, die er lesen kann.'
  if (!parse) return done(unavailable(gapDe('unreadable', unreadable), publisher, document), draftFailed)
  const ofText = draftRead && !(candidates.length === 1 && notADraft(draftRead)) ? draftRead : null

  const particular = explainedParagraphs(parse, ofText?.units ?? null, detail.draft.title, ofText?.text ?? null)
  return done({ available: true, unavailableReason: null, document, publisher, labelled: parse.labelled, general: parse.general, particular }, draftFailed)
}

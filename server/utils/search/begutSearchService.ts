/**
 * Full-text search over the running Begutachtungen
 * (docs/architecture.md §12.31).
 *
 * Nuxt-aware glue around the pure module `begutSearch.ts`. Three steps, and
 * none of them builds an index: RIS searches (`Suchworte` and
 * `InBegutachtungAm` in one call, ~165 ms; measured 18.09.2026, „Wolf"
 * returns 13 records and not one of them carries the word in its metadata),
 * the corpus and its join resolve the document number onto a page of this
 * monitor (`ris/begutCorpus.ts`), and `begutSearch.ts` finds the place of the
 * hit, which RIS does not return.
 *
 * RIS FINDS MORE THAN THE WORD, which refuted the first draft of this
 * section: „Klimaschutz" returns the Industriestrompreisgesetz, whose
 * documents never carry it — the Erläuterungen write „Leitlinien für
 * staatliche Klima-, Umweltschutz- und Energiebeihilfen", and RIS matches on
 * the parts. So a hit without a named place says what was checked instead of
 * claiming „steht in einer Anlage oder einem PDF", and it ranks below a hit
 * that carries its evidence.
 *
 * ONLY THE RUNNING ONES: the question is whether one of the drafts open NOW
 * is a vehicle for the reader's concern. The whole corpus is a different
 * question at a different resolution — the hits then spread over a dozen
 * Gesetzgebungsperioden and the join above knows one at a time. Its own item
 * in the TODO.
 *
 * NOT CACHED, deliberately: the key would be the reader's input, hence
 * unboundedly many keys in a store production holds in RAM
 * (`cache/base.ts`). RIS answers in fractions of a second and the documents
 * underneath sit in the persistent layer anyway — what is cached is the
 * expensive, not the arbitrary.
 */
import type {
  BegutSearchHit,
  BegutSearchResponse,
  RisConsultation,
  RisConsultationDetail,
  RisDocumentFormats,
} from '#shared/types'
import {
  blocksFromPlainText,
  locateInBlocks,
  parseSearchQuery,
  searchQueryString,
  withoutMinistryMentions,
  type SearchTerm,
} from './begutSearch'
import { DERIVED_CACHE } from '../cache/base'
import { PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import type { TextBlock } from '../lawtext/lawUnits'
import { parseRisXml } from '../lawtext/risXml'
import { ministryTokens, type MinistryToken } from './searchHaystack'
import { getDraftsForGp, getCurrentGp, reconcileActive } from '../parliament/drafts'
import { getRisBegutCorpus, getRisMapForGp } from '../ris/begutCorpus'
import { mapWithConcurrency } from '../pool'
import { getRisConsultation } from '../ris/risOnly'
import { asArray, isOpenOn } from '../ris/risRecord'
import {
  RIS_API_BASE,
  RisEnvelopeError,
  risJson,
  upstreamBytes,
  upstreamText,
  type UpstreamPolicy,
} from '../upstream/fetch'

const SEARCH_TIMEOUT_MS = 20_000
/**
 * No retry — as before the shared client, and for the reason stated at
 * `searchRisIds`: someone is waiting on this request.
 */
const SEARCH_POLICY: UpstreamPolicy = { timeoutMs: SEARCH_TIMEOUT_MS, retries: 0 }
/**
 * This many records get a place of the hit — the first of that many in the
 * order RIS names them. Over the running Begutachtungen it never binds (7
 * open records on 18.09.2026, 22 on 15.06.), but even so a keyword like
 * „Verordnung" must not pull 25 document records.
 */
const LOCATE_CAP = 12
/** Concurrent document fetches. Polite towards RIS, fast enough. */
const LOCATE_CONCURRENCY = 4
/**
 * How many PDFs ONE search may pull.
 *
 * The PDF is the second attempt, not the first (see `locate`): it is fetched
 * only where the XML gives nothing. Rare enough to do it, expensive enough
 * to cap it — pdf.js holds a document with its decoded streams in memory,
 * and someone is waiting on a search.
 *
 * 16 WAS TOO FEW, measured 22.09.2026: since the search reads ALL documents
 * of a record (`documentsOf`), the naming rate over twelve keywords fell to
 * 91,4 % — not because anything was missing, but because the budget ran out
 * in the middle of the hit list. Uncapped it is 100 % at unchanged 0,2–2,1 s,
 * so this number is a rip cord against the pathological record, not a time
 * budget: 48 covers twelve hits with four PDFs each, and the twelve measured
 * searches never needed more than about twenty.
 */
const PDF_BUDGET = 48
/** As with the Beilagen: a document larger than this we do not read. */
const PDF_MAX_BYTES = 16 * 1024 * 1024

/**
 * The documents of a record in the order in which they can serve as the
 * place of a hit — a ranking of what a finding means, not one of
 * convenience.
 *
 * If the word stands in the Entwurfstext, that is the answer: what is meant
 * to become law stands there. If it stands only in the Erläuterungen, the
 * answer is a different one and has to be read differently — the ressort
 * mentions the subject, the law text does not say it. The search therefore
 * stops at the first hit in this list: it names the strongest place, not all
 * of them.
 */
/** A record's document fields — exactly those `RisConsultationDetail` carries. */
type DocumentKey = 'mainDocument' | 'explanations' | 'textComparison' | 'coverLetter'

/** A document as this search sees it: a label and a few URLs. */
interface SearchDocument {
  label: string
  formats: RisDocumentFormats | null
}

const DOCUMENT_ORDER: readonly { key: DocumentKey; label: string }[] = [
  { key: 'mainDocument', label: 'im Entwurfstext' },
  { key: 'explanations', label: 'in den Erläuterungen' },
  { key: 'textComparison', label: 'in der Textgegenüberstellung' },
  { key: 'coverLetter', label: 'im Begleitschreiben' },
]

/**
 * All documents of a record, in that ranking.
 *
 * THE FOUR NAMED ONES FIRST, because their label means something: „im
 * Entwurfstext" says that what is meant to become law stands there, „in den
 * Erläuterungen" says the ressort mentions the subject. Then the rest the
 * record carries — and only since 22.09.2026 at all.
 *
 * What was missing before is measured: the 8 running records carry 41 text
 * documents, the four fields reach 25. A hit that stands only in a WFA or a
 * Digicheck therefore ended as „wir konnten nichts benennen" — checked
 * against all three unnamed „datenschutz" hits, which stood exactly there
 * (docs/architecture.md §12.31).
 *
 * THE RESSORT'S OWN NAME IS THE LABEL („in „WFA UVP-G-Novelle 2026""),
 * because we cannot read it better than the ressort chose it. That is also
 * the cheap half of another gap: `SAG_TGÜ` and `Entwurf EB Klimagesetz` are
 * a Gegenüberstellung and Erläuterungen that our naming rules do not
 * recognise (`ris/risRecord.ts`). The search reads them now — as a
 * „weiteres Dokument", without touching the rules the annex engine and the
 * Erläuterungen section hang on.
 */
function documentsOf(detail: Pick<RisConsultationDetail, DocumentKey | 'otherDocuments'>): SearchDocument[] {
  return [
    ...DOCUMENT_ORDER.map(({ key, label }) => ({ label, formats: detail[key] })),
    ...detail.otherDocuments.map((d) => ({ label: `in „${d.name}“`, formats: d.formats })),
  ]
}

/**
 * The bytes of a Begut PDF, base64 — like the Beilage next door
 * (`annex/annexPdfService.ts`), and for the same reasons: a cached value is
 * serialised as JSON, and a `Uint8Array` survives that as an object with the
 * keys „0", „1", „2".
 *
 * PERSISTENT IN DEV ONLY. A PDF is the expensive and the large half; in
 * production the cache lives in RAM, and what belongs there is the extracted
 * TEXT (the function below), not the document it came from.
 */
const fetchBegutPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    const { bytes } = await upstreamBytes(url, { ...SEARCH_POLICY, maxBytes: PDF_MAX_BYTES })
    return Buffer.from(bytes).toString('base64')
  },
  {
    name: 'begut-dokument-pdf',
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)

/**
 * The same PDF as plain text — derived, hence in the other layer
 * (`cache/base.ts`).
 *
 * Kept apart from the fetch, because a function that fetches AND parses
 * belongs to neither layer: any invalidation that catches the parser would
 * throw the document away with it. And the result is cached because `locate`
 * walks the same document up to four times — pdf.js should work once, not
 * four times.
 */
const begutPdfText = defineCachedFunction(
  async (url: string): Promise<string> => {
    const bytes = new Uint8Array(Buffer.from(await fetchBegutPdf(url), 'base64'))
    const { extractText, getDocumentProxy } = await import('unpdf')
    const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true })
    return typeof text === 'string' ? text : (text as string[]).join('\n')
  },
  {
    name: 'begut-dokument-pdf-text',
    base: DERIVED_CACHE,
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
  },
)

/** A Begut document as XML, as RIS sends it — the parse stays fresh. */
const fetchBegutDocument = defineCachedFunction(
  async (url: string): Promise<string> => {
    return upstreamText(url, SEARCH_POLICY)
  },
  { name: 'begut-dokument-xml', getKey: (url: string) => url, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/**
 * The document numbers RIS has for these words — open today.
 *
 * Uncached (see the header) and without retries: this request hangs off a
 * page someone is waiting on. If RIS fails, that is a 502 with a sentence,
 * not an empty hit list — **a failure is not an answer** (§12.13), and „zu
 * ‚Klimaschutz' gibt es nichts" would be this product's costliest lie.
 */
async function searchRisIds(terms: readonly SearchTerm[], day: string): Promise<string[]> {
  const params = new URLSearchParams({
    Applikation: 'Begut',
    Suchworte: searchQueryString(terms),
    InBegutachtungAm: day,
    DokumenteProSeite: 'OneHundred',
    Seitennummer: '1',
  })
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let result: any
  try {
    result = await risJson<any>(`${RIS_API_BASE}?${params}`, { ...SEARCH_POLICY, accept: 'application/json' })
  } catch (cause) {
    if (cause instanceof RisEnvelopeError) {
      throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS hat einen Fehler gemeldet' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Die Suche im RIS ist gerade nicht erreichbar', cause })
  }
  const refs = asArray<any>(result.OgdDocumentResults?.OgdDocumentReference)
  return refs.map((r) => String(r?.Data?.Metadaten?.Technisch?.ID ?? '')).filter(Boolean)
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** How many Begutachtungen are open on that day — our own number, from the corpus. */
async function runningCount(day: string): Promise<number> {
  const corpus = await getRisBegutCorpus()
  return corpus.records.filter((r) => isOpenOn(r, day)).length
}

/** What a search has left of its PDF fetches. */
interface PdfBudget { left: number }

/**
 * The documents ONE search has read, per format and URL.
 *
 * `locate` walks the same record up to four times and `scan` twice over the
 * same documents — the same XML was parsed up to eight times per request.
 * The map is created in `searchRunningBegut` and dies with it: a parse is
 * never cached beyond the request (`cache/base.ts`, `kons/konsCache.ts`),
 * because it changes with the parser and the document does not.
 */
type BlockMemo = Map<string, TextBlock[] | null>

/** A document as blocks, in the format asked for. Null where there is none. */
async function blocksOf(
  doc: RisDocumentFormats | null,
  format: 'xml' | 'pdf',
  budget: PdfBudget,
  memo: BlockMemo,
): Promise<TextBlock[] | null> {
  const url = doc?.[format]
  if (!url) return null
  if (format === 'pdf') {
    // The cap still counts every ATTEMPT and not every document: it is this
    // search's rip cord, and memoisation is meant to shorten the time, not
    // to enlarge the budget.
    if (budget.left <= 0) return null
    budget.left--
  }
  const key = `${format}:${url}`
  const known = memo.get(key)
  if (known !== undefined) return known
  let blocks: TextBlock[] | null
  try {
    blocks = format === 'xml'
      ? parseRisXml(await fetchBegutDocument(url))
      : blocksFromPlainText(await begutPdfText(url))
  } catch {
    // A document that will not load does not make the hit wrong — RIS found
    // the word. On to the next one.
    blocks = null
  }
  memo.set(key, blocks)
  return blocks
}

/**
 * One pass over all documents of a record, in one format.
 *
 * TWICE OVER ALL DOCUMENTS, not two rules per document: the second pass is
 * the substring search, and run inside one document right after the strict
 * one, an Entwurfstext carrying only „Klimaschutzgesetz" would beat the
 * Erläuterungen where „Klimaschutz" really stands — the ranking of the
 * documents would beat the precision of the rule
 * (docs/architecture.md §12.31). This way the rule wins first, the ranking
 * second.
 *
 * `tokens` null means: search WITH the Ressort mentions. That is the last
 * pass and it answers a different question — not „wovon handelt der
 * Entwurf" but „warum hat das RIS ihn überhaupt geliefert".
 */
async function scan(
  documents: readonly SearchDocument[],
  terms: readonly SearchTerm[],
  format: 'xml' | 'pdf',
  tokens: readonly MinistryToken[] | null,
  budget: PdfBudget,
  memo: BlockMemo,
): Promise<Pick<BegutSearchHit, 'place' | 'designation' | 'snippet'> | null> {
  for (const loose of [false, true]) {
    for (const { label, formats } of documents) {
      const raw = await blocksOf(formats, format, budget, memo)
      if (!raw) continue
      const blocks = tokens ? withoutMinistryMentions(raw, tokens) : raw
      const hit = locateInBlocks(blocks, terms, loose)
      if (hit) return { place: label, designation: hit.designation, snippet: hit.snippet }
    }
  }
  return null
}

/**
 * The place of the hit in a record — in three stages, and the third is the
 * interesting one.
 *
 *  1. **XML without the Ressort mentions.** The normal case, and cheap.
 *  2. **PDF without the Ressort mentions.** Because the XML lies where it
 *     truncates: the Begleitschreiben of the DGAV draft has 943 characters
 *     in the XML and 12.223 in the PDF — the Verteiler RIS had matched on
 *     stood only there. Before, such a hit ended as „wir konnten nichts
 *     benennen".
 *  3. **Once more, WITH the Ressort mentions.** If this pass finds something
 *     the first two did not, the word stands exclusively inside a ministry's
 *     name — in the Verteiler, in a signature line. That is not a hit on the
 *     subject, and the row says so (`ministryOnly`) instead of hiding it:
 *     RIS delivered the record, the judgement belongs to the reader.
 *     Measured 21.09.2026: 3 of 7 hits for „klima" are of this kind.
 */
async function locate(
  detail: Pick<RisConsultationDetail, DocumentKey | 'otherDocuments'>,
  terms: readonly SearchTerm[],
  tokens: readonly MinistryToken[],
  budget: PdfBudget,
  memo: BlockMemo,
): Promise<Pick<BegutSearchHit, 'place' | 'designation' | 'snippet' | 'ministryOnly'>> {
  const documents = documentsOf(detail)
  for (const format of ['xml', 'pdf'] as const) {
    const found = await scan(documents, terms, format, tokens, budget, memo)
    if (found) return { ...found, ministryOnly: false }
  }
  for (const format of ['xml', 'pdf'] as const) {
    const found = await scan(documents, terms, format, null, budget, memo)
    if (found) return { ...found, ministryOnly: true }
  }
  return { place: null, designation: null, snippet: null, ministryOnly: false }
}

/** The corpus's Ressort vocabulary — historical names included. */
async function ministryVocabulary(): Promise<MinistryToken[]> {
  const corpus = await getRisBegutCorpus()
  return ministryTokens(corpus.records.map((r) => r.stelle ?? ''))
}

/** The fields a row needs — the detail record carries more than has to go over the wire. */
function toConsultationView(d: RisConsultation): RisConsultation {
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    longTitle: d.longTitle,
    ministryCode: d.ministryCode,
    ministryName: d.ministryName,
    startedAt: d.startedAt,
    deadline: d.deadline,
    active: d.active,
    risUrl: d.risUrl,
    // The search says nothing about the outcome: it searches the RUNNING
    // Begutachtungen, and there is none there.
    outcome: null,
  }
}

/**
 * What the running Begutachtungen say about these words.
 *
 * The empty hit list is a result here, not a defect, and therefore carries
 * `corpusSize` with it: „in den 7 laufenden Begutachtungen kommt das Wort
 * nicht vor" is an answer, „keine Treffer" is not.
 */
export async function searchRunningBegut(raw: string): Promise<BegutSearchResponse> {
  const terms = parseSearchQuery(raw)
  const day = new Date().toISOString().slice(0, 10)
  if (!terms.length) {
    return { query: raw.trim(), corpusSize: await runningCount(day), total: 0, hits: [] }
  }

  const [ids, corpusSize, gp, tokens] = await Promise.all([
    searchRisIds(terms, day),
    runningCount(day),
    getCurrentGp(),
    ministryVocabulary(),
  ])
  const budget: PdfBudget = { left: PDF_BUDGET }
  // Lives exactly as long as this search (see `BlockMemo`).
  const memo: BlockMemo = new Map()

  // The running period's join: every record open today was begun within it,
  // so exactly one map suffices. If it fails, the search stays usable — the
  // hits then point at their RIS page.
  const [map, drafts] = await Promise.all([
    getRisMapForGp(gp).catch(() => null),
    getDraftsForGp(gp).catch(() => null),
  ])
  const inrOf = new Map<string, number>()
  for (const row of map?.rows ?? []) if (row.risId) inrOf.set(row.risId, row.inr)

  const resolved = await mapWithConcurrency(ids, LOCATE_CONCURRENCY, async (id, index) => {
    const detail = await getRisConsultation(id)
    // A record our corpus does not know yet (it is up to 20 h old): better
    // left out than shown as a row without a destination.
    if (!detail) return null
    // The cap hangs off the position in the hit list, no longer off the
    // batch boundary: `hits.length + batch.length` used to decide it, so how
    // many records a batch happened to skip decided who got a place — with
    // four per batch that could be eight instead of twelve. Now it is the
    // first LOCATE_CAP in input order.
    const evidence =
      index < LOCATE_CAP
        ? await locate(detail, terms, tokens, budget, memo)
        : { place: null, designation: null, snippet: null, ministryOnly: false }
    const inr = inrOf.get(id)
    const draft = inr !== undefined ? drafts?.items.find((d) => d.inr === inr) : undefined
    const hit: BegutSearchHit = {
      entry: draft
        ? { kind: 'draft', draft: reconcileActive(draft) }
        : { kind: 'ris', consultation: toConsultationView(detail) },
      ...evidence,
    }
    return hit
  })
  const hits: BegutSearchHit[] = resolved.filter((h) => h !== null)

  /*
   * Three classes, and the order is a judgement about the ANSWER, not about
   * the draft:
   *
   *  1. **With evidence.** We show the sentence the word stands in.
   *  2. **Without evidence.** We found it in no readable document — open
   *     whether it stands in an Anlage or whether RIS matched on word parts.
   *     Open is worth more than ruled out, hence ahead of the third class.
   *  3. **Only in a Ressort mention.** The single finding stands in the
   *     Verteiler or in a signature line. Checked and disproved — so last,
   *     but visible: throwing it away would take the judgement away from the
   *     reader, and on the UVP-G-Novelle that would have been the wrong one
   *     (there the Ressort name IS the subject matter).
   */
  const ranked = [
    ...hits.filter((h) => h.place && !h.ministryOnly),
    ...hits.filter((h) => !h.place),
    ...hits.filter((h) => h.place && h.ministryOnly),
  ]
  return {
    // The reader's input back, not our normalised version: „3 von 7 führen
    // ‚strom'" read like a typo made by the tool.
    query: raw.trim(),
    corpusSize,
    total: ids.length,
    hits: ranked,
  }
}

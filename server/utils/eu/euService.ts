/**
 * Whether a draft implements EU law, which act, and until when
 * (docs/architecture.md §12.66).
 *
 * Nuxt-aware glue around the pure modules — `vorblatt.ts` (whether),
 * `umsetzungshinweis.ts` (which act), `cellar.ts` (until when),
 * `euMarker.ts` (the fact). This is the only file of the feature that knows
 * RIS: the modules below take text and a CELEX, so the Länder can run them
 * over Landesgesetz text unchanged.
 *
 * Two entry points on the road of the Erläuterungen
 * (`explanations/explanationsService.ts`): a Ministerialentwurf through the
 * RIS↔ME join, a Begutachtung without a Gegenstand from its own record. Its
 * own endpoint, asked after first paint, for the same reason: three to
 * thirty upstream reads must not sit in every detail render.
 *
 * READS NOTHING TWICE. The law text is the draft's parse every section of
 * the page shares (`getDraftArticles`, `draftArticlesOfXml`); the law in
 * force is the § comparison's own (`resolveKonsLaw`, `fetchParagraphXml`);
 * the Erläuterungen are their section's answer (`getExplanations`). New
 * reads are only the Vorblatt PDF and the Cellar.
 *
 * **A failure is not an answer** (§12.13). A Vorblatt that cannot be fetched
 * throws — whether the draft is an EU matter is the question itself. A
 * Cellar or law-in-force read that fails costs one act its deadline line:
 * the answer goes out without it and is not stored (`cache/gathered.ts`).
 */
import type { EuActView, EuRechtResponse, ExplanationsResponse, TraceLink } from '#shared/types'
import { parseEuActCitations, baseActCelexes, uniqueActs, type EuAct } from './actCitations'
import { classifyVorblatt, hasTextLayer, isVorblattDocument, linesOfPages, type VorblattClass } from './vorblatt'
import { readExplanationsEuSignal, readUmsetzungshinweis, type LawWindow } from './umsetzungshinweis'
import { CELEX_RE, deadlineOf, fetchTranspositionAnswer, parseTranspositionAnswer, type SparqlAnswer, type TranspositionDates } from './cellar'
import { combineVerdicts, decideEuMarker } from './euMarker'
import type { TextBlock } from '../lawtext/lawUnits'
import { articleBlocks, type DraftArticle } from '../lawtext/draftArticles'
import { getDraftArticles, draftArticlesOfXml } from '../lawtext/draftArticlesService'
import { addressedUnits } from '../kons/novao'
import { fetchParagraphXml, resolveKonsLaw } from '../kons/konsCache'
import { anlageLabelKey } from '../text/designation'
import { withPdf } from '../text/pdfDocument'
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { DERIVED_CACHE } from '../cache/base'
import { onlyComplete, type Gathered } from '../cache/gathered'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from '../cache/ttl'
import { getRisMapForGp, getRisBegutRecord } from '../ris/begutCorpus'
import { getExplanations, getRisExplanations } from '../explanations/explanationsService'
import type { RisBegutFlat } from '../ris/risRecord'

/** A Vorblatt is a few pages; the cap is the search's (`search/begutSearchService.ts`). */
const VORBLATT_MAX_BYTES = 16 * 1024 * 1024
/** Three attempts, as the RIS documents of the § comparison (`ris/konsLaw.ts`). */
const VORBLATT_POLICY: UpstreamPolicy = {
  timeoutMs: 20_000,
  retries: 2,
  backoffMs: (attempt) => 600 * attempt,
  maxBytes: VORBLATT_MAX_BYTES,
  // The URL comes out of a RIS record.
  upstreamHostsOnly: true,
}

/**
 * The Vorblatt PDF as RIS sent it, base64 (a `Uint8Array` does not survive
 * the cache's JSON). Persistent in dev only, as the search's PDFs: in
 * production what is kept is the text one layer up, small and derived.
 */
const fetchVorblattPdf = defineCachedFunction(
  async (url: string): Promise<string> => {
    const { bytes } = await upstreamBytes(url, VORBLATT_POLICY)
    return Buffer.from(bytes).toString('base64')
  },
  {
    name: 'eu-vorblatt-pdf',
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
    shouldBypassCache: () => !import.meta.dev,
  },
)

/**
 * The Vorblatt's text, one string per page — pages apart, so the WFA tool's
 * page footer is cut where it stands (`vorblatt.ts`). Null for a PDF pdf.js
 * cannot open or that is too long: a stable property of the document. The
 * fetch stands outside the try and throws through.
 */
const vorblattPages = defineCachedFunction(
  async (url: string): Promise<string[] | null> => {
    const bytes = new Uint8Array(Buffer.from(await fetchVorblattPdf(url), 'base64'))
    try {
      const { extractText } = await import('unpdf')
      const { text } = await withPdf(bytes, (doc) => extractText(doc, { mergePages: false }), { verbosity: 0 })
      return Array.isArray(text) ? text : [text]
    } catch {
      return null
    }
  },
  {
    name: 'eu-vorblatt-text',
    base: DERIVED_CACHE,
    getKey: (url: string) => url,
    maxAge: PUBLISHED_DOCUMENT_TTL_S,
    swr: false,
  },
)

/**
 * The Cellar's answer for one CELEX, as it arrived. A month: a directive's
 * transposition dates are fixed in its own text; a later act that moves
 * them is an act of its own with its own CELEX.
 */
const fetchCellarAnswer = defineCachedFunction(
  (celex: string): Promise<SparqlAnswer> => fetchTranspositionAnswer(celex),
  { name: 'eu-cellar', getKey: (celex: string) => celex, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** One act's dates, or null where the Cellar did not answer. */
async function transpositionOf(celex: string): Promise<TranspositionDates | null> {
  if (!CELEX_RE.test(celex)) return { found: true, dates: [] }
  try {
    return parseTranspositionAnswer(await fetchCellarAnswer(celex))
  } catch {
    return null
  }
}

/** What one draft offers to read, however it was reached. */
interface DraftDocuments {
  record: RisBegutFlat
  /** The draft's parsed law text — the page's shared parse. */
  blocks: () => Promise<TextBlock[]>
  /** The Erläuterungen section's answer, for rule D5. */
  explanations: () => Promise<ExplanationsResponse>
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

/** The Vorblatt readings of a record: one per Vorblatt PDF with a text layer. */
async function readVorblaetter(record: RisBegutFlat): Promise<{ readable: { cls: VorblattClass | null; sentence: string | null; url: string }[] }> {
  const docs = record.otherDocuments.filter((d) => isVorblattDocument(d.name) && d.urls.pdf)
  const readable: { cls: VorblattClass | null; sentence: string | null; url: string }[] = []
  for (const d of docs) {
    const pages = await vorblattPages(d.urls.pdf!)
    if (!pages) continue
    const lines = linesOfPages(pages)
    if (!hasTextLayer(lines)) continue
    readable.push({ ...classifyVorblatt(lines), url: d.urls.pdf! })
  }
  return { readable }
}

/** The plain text of a RIS § document — enough to find a citation in it. */
function konsText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** Which Artikel a block index belongs to, and the Novellierungsanordnung above it. */
interface Place {
  article: DraftArticle
  /** The text of the nearest Novellierungsanordnung above the window inside its Artikel. */
  instruction: string | null
}

function placesOf(blocks: readonly TextBlock[]): (start: number) => Place | null {
  const parts = articleBlocks(blocks)
  const offsets: number[] = []
  let at = 0
  for (const p of parts) {
    offsets.push(at)
    at += p.blocks.length
  }
  return (start) => {
    for (let k = parts.length - 1; k >= 0; k--) {
      if (start < offsets[k]!) continue
      const part = parts[k]!
      let instruction: string | null = null
      for (let i = start - offsets[k]!; i >= 0; i--) {
        if (part.blocks[i]!.kind === 'novao') {
          instruction = part.blocks[i]!.text
          break
        }
      }
      return { article: part.article, instruction }
    }
    return null
  }
}

/**
 * Whether the law in force already names each act a window names (rule D4):
 * the § the window's Novellierungsanordnung addresses, as it stood on the
 * first day of the Begutachtung — the version the ressort wrote against, and
 * the one the § comparison reads.
 *
 * Per CELEX: false where the standing § names it; true where the window
 * stands in a new law, or every § it addresses is new; null where the law
 * or the address could not be resolved (a stable answer, stored); `failed`
 * where RIS did not answer (not stored).
 */
async function inForce(window: LawWindow, place: Place | null, asOf: string | null): Promise<{ named: Set<string> | null; failed: boolean }> {
  // Outside any amending Artikel the window is the draft's own new law.
  if (!place || !place.article.amends) return { named: new Set(), failed: false }
  if (!place.article.bgbl || !asOf || !place.instruction) return { named: null, failed: false }
  const paras = addressedUnits(place.instruction).paras
  if (!paras.length) return { named: null, failed: false }
  try {
    const { organ, nummer } = place.article.bgbl
    const law = await resolveKonsLaw(organ, nummer, asOf, place.article.title ?? '', place.article.clause)
    if (!law) return { named: null, failed: false }
    const wanted = new Set(paras.map(anlageLabelKey))
    const refs = Object.entries(law.paragraphs).filter(([label]) => wanted.has(anlageLabelKey(label))).map(([, ref]) => ref)
    const named = new Set<string>()
    for (const ref of refs) {
      if (!ref.xmlUrl) continue
      for (const act of parseEuActCitations(konsText(await fetchParagraphXml(ref.nor, ref.xmlUrl)))) named.add(act.celex)
    }
    return { named, failed: false }
  } catch {
    return { named: null, failed: true }
  }
}

/** The fact for one draft. */
async function assemble(docs: DraftDocuments): Promise<Gathered<EuRechtResponse>> {
  const { record } = docs
  const start = record.beginn ?? null
  const { readable } = await readVorblaetter(record)
  const withHeading = readable.filter((r) => r.cls !== null)

  const blocks = await docs.blocks()
  const law = readUmsetzungshinweis(blocks)

  // D5: the Erläuterungen only where no Vorblatt says anything.
  let explanations: 'umsetzung' | 'durchfuehrung' | null = null
  let explanationsUrl: string | null = null
  if (!withHeading.length) {
    const erl = await docs.explanations()
    if (erl.available) {
      explanations = readExplanationsEuSignal(erl.passages).signal
      explanationsUrl = erl.document?.url ?? erl.source?.url ?? null
    }
    if (!explanations) {
      return { value: empty(readable.length
        ? 'Das Vorblatt dieses Entwurfs nennt sein Verhältnis zum Unionsrecht nicht.'
        : 'Zu diesem Entwurf ist kein lesbares Vorblatt veröffentlicht.', start), complete: true }
    }
  }

  const decision = decideEuMarker({ vorblatt: withHeading.map((r) => r.cls!), law, explanations })
  const sources: TraceLink[] = [
    ...withHeading.map((r) => ({ label: 'Vorblatt', url: r.url })),
    ...(explanationsUrl && decision.source === 'erlaeuterungen' ? [{ label: 'Erläuterungen', url: explanationsUrl }] : []),
  ]
  if (!decision.marker) {
    // Read, and no fact: the Vorblatt says it is no EU matter, or its
    // Vorblätter contradict each other and the law text names no act.
    return { value: { ...empty('', start), available: true, unavailableReason: null, sources }, complete: true }
  }

  // WHICH ACT: the law text, then the title. Where the Erläuterungen
  // decided whether, no act is named at all (D5): the road exists for the
  // draft whose Vorblatt cannot be read, and is kept that small.
  const titleActs = parseEuActCitations(`${record.kurztitel ?? ''} ${record.titel ?? ''}`, { implemented: true })
  const byExplanations = decision.source === 'erlaeuterungen'
  const fromLaw = !byExplanations && law.acts.length > 0
  const named: EuAct[] = byExplanations ? [] : fromLaw ? law.acts : titleActs
  const lawLink = record.mainDocument.html ?? record.mainDocument.pdf
  if (fromLaw && lawLink) sources.push({ label: 'Gesetzestext', url: lawLink })

  // D4 per window, then per act. An act is new where ANY law of the draft
  // gains it — a Sammelnovelle carries one directive into a dozen laws, and
  // one law it cannot resolve must not take the deadline from the others
  // (30/ME: 2023/2864 in eleven Artikel). Old where every law that could be
  // read names it already; unknown where none could be read.
  let complete = true
  const isNew = new Map<string, boolean | null>()
  const base = new Set<string>()
  if (fromLaw) {
    const place = placesOf(blocks)
    for (const w of law.windows) {
      for (const c of baseActCelexes(w.text)) base.add(c)
      const { named: standing, failed } = await inForce(w, place(w.start), start)
      if (failed) complete = false
      for (const act of w.acts) {
        const verdict = standing === null ? null : !standing.has(act.celex)
        isNew.set(act.celex, combineVerdicts(isNew.get(act.celex), verdict))
      }
    }
  }

  // UNTIL WHEN: the Cellar, per act, side by side.
  const acts: EuActView[] = []
  const answers = await Promise.all(uniqueActs([named]).map(async (act) => ({ act, dates: await transpositionOf(act.celex) })))
  for (const { act, dates } of answers) {
    if (dates === null) complete = false
    // EUR-Lex knows no such act: a citation error in the draft, not shown.
    if (dates && !dates.found) continue
    acts.push({
      kind: act.kind,
      label: act.label,
      celex: act.celex,
      eurLexUrl: act.eli,
      // A title that names the act says the draft implements it.
      isNew: fromLaw ? (isNew.get(act.celex) ?? null) : true,
      base: base.has(act.celex) && named.some((a) => a.celex !== act.celex && !base.has(a.celex)),
      transposition: act.kind === 'richtlinie' && dates ? deadlineOf(dates.dates) : null,
    })
  }

  // The verbatim sentence for „über die Umsetzung hinaus" — quoted, never paraphrased.
  const vorblattSentence = decision.marker === 'ueber-umsetzung'
    ? withHeading.find((r) => r.cls === 'ueber-umsetzung')?.sentence ?? null
    : null

  return {
    value: {
      available: true,
      unavailableReason: null,
      marker: decision.marker,
      markerSource: decision.source,
      vorblattSentence,
      acts,
      actsSource: acts.length ? (fromLaw ? 'gesetzestext' : 'titel') : null,
      begutachtungStart: start,
      sources,
    },
    complete,
  }
}

/** The cached half of `getEuRecht`; an answer missing a read is served, not stored. */
const readEuRecht = defineCachedFunction(
  async (gp: string, inr: number): Promise<Gathered<EuRechtResponse>> => {
    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    if (!row?.risId) {
      return { value: empty(row?.status === 'ambiguous'
        ? 'Mehrere RIS-Datensätze kommen für diesen Entwurf infrage.'
        : 'Der Entwurf ließ sich keinem RIS-Datensatz zuordnen; nur dort liegt sein Vorblatt.'), complete: true }
    }
    const record = await getRisBegutRecord(row.risId)
    if (!record) return { value: empty('Der RIS-Datensatz dieses Entwurfs ist nicht mehr verzeichnet.'), complete: true }
    return assemble({
      record,
      blocks: async () => (await getDraftArticles(gp, inr, 'ris-xml')).blocks,
      explanations: () => getExplanations(gp, inr),
    })
  },
  {
    name: 'eu-recht-me',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
    validate: onlyComplete,
  },
)

/** For a Ministerialentwurf: through the RIS↔ME join, like the Erläuterungen. */
export async function getEuRecht(gp: string, inr: number): Promise<EuRechtResponse> {
  return (await readEuRecht(gp, inr)).value
}

/** The cached half of `getRisEuRecht`, stored only when complete. */
const readRisEuRecht = defineCachedFunction(
  async (id: string): Promise<Gathered<EuRechtResponse>> => {
    const record = await getRisBegutRecord(id)
    if (!record) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
    const xml = record.mainDocument.xml
    return assemble({
      record,
      blocks: async () => (xml ? (await draftArticlesOfXml(xml)).blocks : []),
      explanations: () => getRisExplanations(id),
    })
  },
  {
    name: 'eu-recht-ris',
    base: DERIVED_CACHE,
    getKey: (id: string) => id,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
    validate: onlyComplete,
  },
)

/** For a Begutachtung without a parliamentary Gegenstand: straight from its own record. */
export async function getRisEuRecht(id: string): Promise<EuRechtResponse> {
  return (await readRisEuRecht(id)).value
}

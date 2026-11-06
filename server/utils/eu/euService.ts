/**
 * Whether a draft implements EU law, which act, and until when
 * (docs/architecture.md §12.66).
 *
 * Nuxt-aware glue around the pure modules — `vorblatt.ts` (whether),
 * `umsetzungshinweis.ts` (which act), `cellar.ts` (until when),
 * `euMarker.ts` (the fact). This is the only file of the Bund's side that
 * knows RIS: the modules below take text and a CELEX, and the Länder run
 * them over Landesgesetz text unchanged (`landEuService.ts`). The Cellar is
 * shared with them (`cellarService.ts`).
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
 * reads are only the Vorblatt PDF, the Cellar, and one RIS search per
 * directive the draft's own text does not show as old (`bundesrecht.ts`).
 *
 * **A failure is not an answer** (§12.13). A Vorblatt that cannot be fetched
 * throws — whether the draft is an EU matter is the question itself. A
 * Cellar or law-in-force read that fails costs one act its deadline line:
 * the answer goes out without it and is not stored (`cache/gathered.ts`).
 */
import type { EuActView, EuRechtResponse, ExplanationsResponse, TraceLink } from '#shared/types'
import { parseEuActCitations, baseActsOf, uniqueActs, type EuAct } from './actCitations'
import { classifyVorblatt, hasTextLayer, isVorblattDocument, linesOfPages, type VorblattClass } from './vorblatt'
import { isHintParagraph, readBundLaw, readExplanationsEuSignal, readingOfWindows, type LawWindow } from './umsetzungshinweis'
import { deadlineOf } from './cellar'
import { transpositionOf } from './cellarService'
import { combineVerdicts, decideEuMarker, lawTextMarker, newLawHint } from './euMarker'
import { askedOfLawInForce, bundesrechtHits, bundesrechtPhrase, bundesrechtSearchParams, transposesAct, type BrKonsSearchAnswer, type BundesrechtHit } from './bundesrecht'
import { konsJson, konsQuery } from '../ris/konsLaw'
import { todayIso } from '#shared/utils/format'
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
 * The Paragraphs of Bundesrecht in force on one day that name an act — rule
 * D4, widened (`bundesrecht.ts`). Cached as long as a document: the law as
 * it stood on a past day does not change. Throws where RIS did not answer.
 */
const fetchBundesrechtHits = defineCachedFunction(
  async (phrase: string, asOf: string): Promise<{ total: number; hits: BundesrechtHit[] }> =>
    bundesrechtHits((await konsJson(konsQuery(bundesrechtSearchParams(phrase, asOf)))) as BrKonsSearchAnswer),
  { name: 'eu-bundesrecht', getKey: (phrase: string, asOf: string) => `${phrase}|${asOf}`, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/** A Paragraph named in more hits than one page holds is transposed many times over; it is not read. */
const MANY_HITS = 100

/**
 * True where a Paragraph of Bundesrecht in force transposes the act, false
 * where none does, null where RIS did not answer. Every hit is read through
 * the draft's own Umsetzungshinweis reader (`transposesAct`), because a
 * mention in a definition is not a transposition.
 */
async function standingInBundesrecht(act: EuAct, asOf: string): Promise<boolean | null> {
  const phrase = bundesrechtPhrase(act.label)
  if (!phrase) return false
  try {
    const { total, hits } = await fetchBundesrechtHits(phrase, asOf)
    if (!hits.length) return false
    if (total > MANY_HITS) return true
    for (const h of hits) {
      if (h.xmlUrl && transposesAct(konsText(await fetchParagraphXml(h.nor, h.xmlUrl)), act.celex)) return true
    }
    return false
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

/** What the law in force says about one window's § (rule D4, and the quoted Ziffer's gate). */
interface WindowVerdict {
  /** The acts the addressed § names today; empty for a new law; null where it could not be read. */
  named: Set<string> | null
  /** Whether the addressed § is an Umsetzungshinweis (`isHintParagraph`); null where none could be read. */
  hint: boolean | null
  /** RIS did not answer: not an answer, not stored. */
  failed: boolean
}

/**
 * Whether the law in force already names each act a window names (rule D4):
 * the § the window's Novellierungsanordnung addresses, as it stood on the
 * first day of the Begutachtung — the version the ressort wrote against, and
 * the one the § comparison reads. And whether that § is a hint at all: a
 * quoted Ziffer (`readQuotedNovelleHints`) is the draft's act only where it
 * is (05.11.2026).
 *
 * Per CELEX: false where the standing § names it; true where the window
 * stands in a new law, or every § it addresses is new; null where the law
 * or the address could not be resolved (a stable answer, stored); `failed`
 * where RIS did not answer (not stored).
 */
async function inForce(place: Place | null, asOf: string | null): Promise<WindowVerdict> {
  // Outside any amending Artikel the window is the draft's own new law.
  if (!place || !place.article.amends) return { named: new Set(), hint: null, failed: false }
  if (!place.article.bgbl || !asOf || !place.instruction) return { named: null, hint: null, failed: false }
  const paras = addressedUnits(place.instruction).paras
  if (!paras.length) return { named: null, hint: null, failed: false }
  try {
    const { organ, nummer } = place.article.bgbl
    const law = await resolveKonsLaw(organ, nummer, asOf, place.article.title ?? '', place.article.clause)
    if (!law) return { named: null, hint: null, failed: false }
    const wanted = new Set(paras.map(anlageLabelKey))
    const refs = Object.entries(law.paragraphs).filter(([label]) => wanted.has(anlageLabelKey(label))).map(([, ref]) => ref)
    const named = new Set<string>()
    let hint: boolean | null = null
    for (const ref of refs) {
      if (!ref.xmlUrl) continue
      const text = konsText(await fetchParagraphXml(ref.nor, ref.xmlUrl))
      for (const act of parseEuActCitations(text)) named.add(act.celex)
      hint = hint === true || isHintParagraph(text)
    }
    return { named, hint, failed: false }
  } catch {
    return { named: null, hint: null, failed: true }
  }
}

/** The fact for one draft. */
async function assemble(docs: DraftDocuments): Promise<Gathered<EuRechtResponse>> {
  const { record } = docs
  const start = record.beginn ?? null
  const { readable } = await readVorblaetter(record)
  const withHeading = readable.filter((r) => r.cls !== null)

  const blocks = await docs.blocks()
  const read = readBundLaw(blocks)
  // The law in force per window, read once, when first asked.
  const place = placesOf(blocks)
  const verdicts = new Map<LawWindow, Promise<WindowVerdict>>()
  const verdictOf = (w: LawWindow): Promise<WindowVerdict> => {
    if (!verdicts.has(w)) verdicts.set(w, inForce(place(w.start), start))
    return verdicts.get(w)!
  }
  let complete = true
  // A quoted Ziffer counts where the § it is quoted into is a hint in force.
  const kept: LawWindow[] = []
  for (const w of read.windows) {
    if (!w.quoted) {
      kept.push(w)
      continue
    }
    const v = await verdictOf(w)
    if (v.failed) complete = false
    if (v.hint === true) kept.push(w)
  }
  const law = kept.length === read.windows.length ? read : readingOfWindows(kept, read.dropped)

  // D4, per window and per act: is the act new to the law in force? Read
  // where the decision turns on it (below) or where the acts are named.
  // Per window: an act is new where ANY law of the draft gains it — a
  // Sammelnovelle carries one directive into a dozen laws, and one law it
  // cannot resolve must not take the deadline from the others (30/ME:
  // 2023/2864 in eleven Artikel). Old where every law that could be read
  // names it already; unknown where none could be read.
  const windowVerdicts = new Map<string, boolean | null>()
  let windowsRead: Promise<void> | null = null
  const readWindows = () => (windowsRead ??= (async () => {
    for (const w of law.windows) {
      const { named: standing, failed } = await verdictOf(w)
      if (failed) complete = false
      for (const act of w.acts) {
        const verdict = standing === null ? null : !standing.has(act.celex)
        windowVerdicts.set(act.celex, combineVerdicts(windowVerdicts.get(act.celex), verdict))
      }
    }
  })())
  // Then all of Bundesrecht, for every transposed act the windows did not
  // already show as old (widened on 04.11.2026 after 32/ME: a new law that
  // replaces an old one has no Paragraph to read, and every act it restates
  // looked new) — every directive since 05.11.2026, dated or not
  // (`askedOfLawInForce`): `isNew` decides more than the deadline line.
  const asOf = start ?? todayIso()
  const standings = new Map<string, Promise<boolean | null>>()
  const newnessOf = async (act: EuAct, own: boolean | null) => {
    const asked = askedOfLawInForce(act.kind) && own !== false
    if (asked && !standings.has(act.celex)) standings.set(act.celex, standingInBundesrecht(act, asOf))
    const standing = asked ? await standings.get(act.celex)! : null
    return { asked, standing, isNew: standing === true ? false : asked && standing === null ? null : own }
  }

  // What may decide is a hint that names an act (`actSignal`), not any
  // window — and since 05.11.2026 one that names an act new to the law in
  // force (`newLawHint`): a restated hint decides nothing. Read only where
  // the law text would decide at all; a Vorblatt that decides needs no D4.
  let lawHint = newLawHint(law.windows)
  // D4 per act where it was read for the decision — restated acts stay on the fact (below).
  let refined: Map<string, boolean | null> | null = null
  if (decideEuMarker({ vorblatt: withHeading.map((r) => r.cls!), law: lawHint, explanations: null }).source === 'gesetzestext') {
    await readWindows()
    const isNew = new Map<string, boolean | null>()
    for (const act of law.acts) {
      const n = await newnessOf(act, windowVerdicts.get(act.celex) ?? null)
      // A decision on an unanswered question is served, not stored.
      if (n.asked && n.standing === null) complete = false
      isNew.set(act.celex, n.isNew)
    }
    lawHint = newLawHint(law.windows, (celex) => isNew.get(celex) ?? null)
    refined = isNew
  }

  // D5: the Erläuterungen only where neither a Vorblatt nor the law text's
  // own hint says anything (05.11.2026: a hint that names an act decides
  // before the prose, as for the Länder).
  let explanations: 'umsetzung' | 'durchfuehrung' | null = null
  let explanationsUrl: string | null = null
  if (!withHeading.length && !lawTextMarker(lawHint)) {
    const erl = await docs.explanations()
    if (erl.available) {
      explanations = readExplanationsEuSignal(erl.passages).signal
      explanationsUrl = erl.document?.url ?? erl.source?.url ?? null
    }
    if (!explanations) {
      return { value: empty(readable.length
        ? 'Das Vorblatt dieses Entwurfs nennt sein Verhältnis zum Unionsrecht nicht.'
        : 'Zu diesem Entwurf ist kein lesbares Vorblatt veröffentlicht.', start), complete }
    }
  }

  const decision = decideEuMarker({ vorblatt: withHeading.map((r) => r.cls!), law: lawHint, explanations })
  const sources: TraceLink[] = [
    ...withHeading.map((r) => ({ label: 'Vorblatt', url: r.url })),
    ...(explanationsUrl && decision.source === 'erlaeuterungen' ? [{ label: 'Erläuterungen', url: explanationsUrl }] : []),
  ]
  if (!decision.marker) {
    // Read, and no fact: the Vorblatt says it is no EU matter, or its
    // Vorblätter contradict each other and the law text names no act.
    return { value: { ...empty('', start), available: true, unavailableReason: null, sources }, complete }
  }

  // WHICH ACT: the law text, then the title. Where the Erläuterungen
  // decided whether, no act is named at all (D5): the road exists for the
  // draft whose Vorblatt cannot be read, and is kept that small.
  const titleActs = parseEuActCitations(`${record.kurztitel ?? ''} ${record.titel ?? ''}`, { implemented: true })
  const byExplanations = decision.source === 'erlaeuterungen'
  // A hint that restates only acts in force decides nothing (D4 before the
  // decision), but its acts are the law text's own words: where the
  // Erläuterungen decide, they stay on the fact as restated acts
  // (05.11.2026, ktn-78379). An act the prose alone names stays out (D5),
  // and so does a new one — a hint with a new act would have decided.
  const restated = byExplanations && refined ? law.acts.filter((a) => refined!.get(a.celex) === false) : []
  const fromLaw = byExplanations ? restated.length > 0 : law.acts.length > 0
  const named: EuAct[] = byExplanations ? restated : fromLaw ? law.acts : titleActs
  const lawLink = record.mainDocument.html ?? record.mainDocument.pdf
  if (fromLaw && lawLink) sources.push({ label: 'Gesetzestext', url: lawLink })

  // D4 for the acts named; D4a, the base an amendment is read against.
  const base = fromLaw ? baseActsOf(law.windows.map((w) => w.text), named) : new Set<string>()
  if (fromLaw) await readWindows()

  // UNTIL WHEN: the Cellar, per act, side by side.
  const acts: EuActView[] = []
  const answers = await Promise.all(uniqueActs([named]).map(async (act) => {
    // A title that names the act says the draft implements it.
    const own = fromLaw ? (windowVerdicts.get(act.celex) ?? null) : true
    const dates = await transpositionOf(act.celex)
    return { act, dates, ...(await newnessOf(act, own)) }
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
export const readEuRecht = defineCachedFunction(
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
export const readRisEuRecht = defineCachedFunction(
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

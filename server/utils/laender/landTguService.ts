/**
 * „Was ändert der Entwurf?" for a Land's draft (22.10.2026): the law in force
 * against the law as the draft would have it, both read from the Land's own
 * Textgegenüberstellung (`landTgu.ts`) — the question the
 * Ministerialentwurf's page answers from the ressort's annex.
 *
 * A § IS SHOWN ONLY WHERE RIS CONFIRMS OUR READING OF IT. The text in force
 * we read off the document must stand in RIS's consolidated Landesrecht at
 * the document's date (`shareInRis` ≥ 0.98); a § the document prints as wholly
 * new must not exist there yet. Everything else is withheld and named, and
 * the page counts it under its law („nicht gezeigt") — as the federal annex
 * withholds the rows its RIS check does not carry. What the check cannot see is the draft's side alone;
 * measured against the sentences the Begutachtungsentwurf itself quotes as
 * new wording, 94 % stand in it verbatim and the losses read were the
 * measurement's or the Land's own (docs/architecture.md §12.45).
 *
 * Two formats. Oberösterreich's is its own (one column, underline and
 * strike, `landTgu.ts`); Wien's is the Bund's two-column template at the end
 * of the draft's PDF, read by the Bund's reader (`annex/annexPdf.ts`) and
 * checked stretch by stretch between its elisions (`standsInRis`, §12.49).
 * Salzburg publishes none in a form measured here.
 *
 * A READ THAT FAILED IS NO VERDICT (25.10.2026). Every RIS read was caught
 * into „not found", and the comparison held for a day: one timeout made a
 * § „im RIS nicht wortgleich" until the next. A § that rests on a failed
 * read — RIS, or the draft's own text for the deletion guard — is named as
 * unchecked, and the answer is served but not stored (`gathered.ts`).
 */
import type { LandCode, LandDocument, LandDraftDetail, LandLawDiffResponse, LandTextDocument, LandWithheldReason } from '#shared/types'
import type { LandDraftRecord } from './texts/stations'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { formatDateDe } from '#shared/utils/format'
import { diffLawUnits, summarizeDiff } from '../diff/lawDiff'
import { lawInForce, paragraphByPhrase, paragraphText } from './landKons'
import { amendedLawsOf, bareLawName, columnParagraphs, draftDeletes, joinLines, mergeParagraphs, onlyElided, paraId, renumberingsOf, tguParagraphKey, searchPhrase, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, withRenumberings, type ColumnRow, type TguParagraph, type TguReading } from './landTgu'
import { draftSource, landPdfBytes } from './texts/read'
import { tguPages } from './landTguPdf'
import { pagesOf } from '../annex/annexPdfPages'
import { parseAnnexPdf, type AnnexPage } from '../annex/annexPdf'
import { HEADER_CURRENT_RE, HEADER_PROPOSED_RE } from '../annex/tableCells'
import { ktnTguReading } from './landTguKaernten'
import { tirolTguPages, tirolTguReading } from './landTguTirol'
import type { Gathered } from '../cache/gathered'

/** RIS documents fetched at once while checking the §§ */
const PARALLEL = 8

const TGU_TITLE_RE = /gegenüber|\bTGÜ(?!\p{L})/iu

/**
 * The Land's Textgegenüberstellung among the draft's documents, if it
 * published one — the draft's, never the Regierungsvorlage's, which Kärnten
 * and Tirol list beside it (`kaernten.ts`).
 */
const isDraftTgu = (title: string) => TGU_TITLE_RE.test(title) && !/^Regierungsvorlage\b/.test(title)
export function tguDocument(detail: LandDraftRecord) {
  return detail.draft.documents.find((d) => isDraftTgu(d.title)) ?? null
}

/**
 * RIS's name, in the drafts' order where no draft names the law: „Bauordnung
 * 2022, Tiroler" → „Tiroler Bauordnung 2022", „Gemeinde-Investitionsfonds,
 * Gesetz über den" → „Gesetz über den Gemeinde-Investitionsfonds". A bare
 * „…, Gesetz" stays as RIS writes it: which article it takes, RIS does not say.
 */
export function readableLawName(name: string): string {
  return name
    .replace(/^(.+),\s*(Tiroler|Kärntner|Salzburger|Wiener)$/u, '$2 $1')
    .replace(/^(.+),\s*(Gesetz\s+(?:über|zur|zum)(?:\s+(?:den|die|das|dem))?)$/u, '$2 $1')
}

/** The name the draft gives the same law, where `law` is RIS's name for one of them. */
export function draftNameOf(law: string, laws: readonly string[]): string | null {
  if (laws.includes(law)) return law
  const bare = bareLawName(law)
  return laws.find((l) => bareLawName(l) === bare) ?? null
}

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from: 'geltend', to: 'entwurf', available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: [], ...rest,
  }
}

async function inChunks<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

interface TguRead {
  paragraphs: TguParagraph[]
  fromDocument: LandTextDocument
  date: string
  /** The laws a § may belong to — those the draft names; RIS decides which (`attribute`). */
  laws: string[]
  /** For a reading that cannot see a struck column: does the draft itself delete this §? (`draftDeletes`) */
  deletes?: (number: string) => boolean
  /** False where the draft's own text could not be read: `deletes` then knows nothing, and a date taken from it is a guess. */
  complete?: false
  /** Instructions that reach §§ they do not name, per law (`TguReading`). */
  reaches?: { law: string | null; instruction: string; repeal?: true }[]
  /** Pages of the document the reader did not read (`TguReading`). */
  droppedPages?: number
  /** Laws the Novelle enacts anew, whose text the document does not print (`TguReading`). */
  enacted?: string[]
  /** The renumberings the draft's own text orders that the reading could not pair old → new (`withRenumberings`). */
  renumbered?: string[]
}

/** The draft's own text, or null where reading it failed — which `deletes` must not take for a draft without repeals. */
async function draftTextOf(draft: ReturnType<typeof draftSource>): Promise<string | null> {
  if (!draft) return ''
  return draft.read().then((r) => r.text, () => null)
}

/**
 * Oberösterreich: the Land's own Textgegenüberstellung, one column with
 * underline and strike (`landTgu.ts`) — but for 2021-16029 (Oö.
 * ADIG-Novelle 2021), the one of 73 that sets the law in force and the draft
 * side by side under a header of its own, „Geltende Fassung - Oö. ADIG" |
 * „Begutachtungsentwurf – …". Read as one column, its two sides ran into
 * each other line by line, and the page showed §§ 10a and 23 as unchanged
 * (26.10.2026). It goes to the federal reader, as Salzburg's does
 * (`ooeColumnPages`).
 */
async function readOoe(detail: LandDraftRecord): Promise<TguRead | string> {
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const fromDocument = { label: doc.title, url, publisher: 'Land Oberösterreich' }
  const date = doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10)
  // A copy: the PDF reader takes the bytes it is given, and the side-by-side
  // document needs them a second time.
  const pages = await tguPages(bytes.slice())
  if (sideBySide(pages)) {
    const columns = ooeColumnPages(await pagesOf(bytes))
    const laws = amendedLawsOf(detail.draft.title)
    const draftText = await draftTextOf(draftSource(detail.draft.documents, 'Land Oberösterreich'))
    const { rows, droppedPages } = columnRows(columns)
    // „§ 20 erhält die Bezeichnung „§ 24"": the draft's text says what the two columns do not (26.10.2026).
    const { paragraphs, unmapped } = withRenumberings(columnParagraphs(rows, laws), renumberingsOf(draftText ?? '', laws))
    return {
      paragraphs,
      droppedPages,
      fromDocument,
      date,
      laws,
      deletes: (n) => draftDeletes(draftText ?? '', n),
      renumbered: unmapped,
      ...(draftText === null ? { complete: false as const } : {}),
    }
  }
  const paragraphs = mergeParagraphs(tguParagraphs(pages.flatMap(tguLines)))
  return {
    paragraphs,
    fromDocument,
    date,
    // The document names each law above its §§ (`tguParagraphs`), and strikes what it deletes.
    laws: [...new Set(paragraphs.map((p) => p.law).filter((l): l is string => l !== null))],
  }
}

/** „Geltende Fassung …" with a header of the other side on the same line, far to its right: two columns. */
export function sideBySide(pages: readonly { items: readonly { s: string; x: number; y: number; w: number }[] }[]): boolean {
  return pages.slice(0, 3).some((p) => p.items.some((i) => HEADER_CURRENT_RE.test(i.s.trim()) &&
    p.items.some((o) => o !== i && Math.abs(o.y - i.y) < 3 && o.x > i.x + i.w + 40 && o.s.trim() !== '')))
}

/**
 * A side-by-side Oberösterreich document as the federal reader takes it:
 * the draft's header named as its template names it, „Vorgeschlagene
 * Fassung" — the reader stands behind no geometry without the pair — and
 * the §§ with their full stop (`withFullStops`).
 */
export function ooeColumnPages(pages: readonly AnnexPage[]): AnnexPage[] {
  return pages.map((page) => {
    const left = page.items.find((i) => HEADER_CURRENT_RE.test(i.text.trim()))
    const beside = left ? page.items.filter((i) => i !== left && Math.abs(i.y - left.y) < 3 && i.x > left.x + left.width + 40 && i.text.trim() !== '') : []
    if (!beside.length || beside.some((i) => HEADER_PROPOSED_RE.test(i.text.trim()))) return withFullStops(page)
    const first = beside.reduce((a, b) => (a.x <= b.x ? a : b))
    const items = page.items.filter((i) => !beside.includes(i) || i === first).map((i) => (i === first ? { ...i, text: 'Vorgeschlagene Fassung' } : i))
    return withFullStops({ ...page, items })
  })
}

/**
 * A § designation without the full stop the federal reader opens a § by
 * („§ 64" for „§ 64."), as Salzburg and Oberösterreich's side-by-side
 * document print them — with it. In one run, as Salzburg has always been
 * read; or in several, „§", „ ", „8c", where the line in its column holds
 * nothing else (Salzburg 32075 lost §§ 8c and 8d that way into the § above,
 * until 26.10.2026).
 */
export function withFullStops(page: AnnexPage): AnnexPage {
  const items = page.items.map((i) => (/^§\s*\d+[a-z]*$/.test(i.text.trim()) ? { ...i, text: `${i.text.trim()}.` } : i))
  const merged = new Map<(typeof items)[number], (typeof items)[number] | null>()
  for (const sign of items) {
    if (sign.text.trim() !== '§' || merged.has(sign)) continue
    // The runs of its line in its column: on its baseline, each within 30 pt of the one before.
    const row = items.filter((o) => Math.abs(o.y - sign.y) < 2).sort((a, b) => a.x - b.x)
    let from = row.indexOf(sign)
    let to = from
    while (from > 0 && row[from]!.x - (row[from - 1]!.x + row[from - 1]!.width) < 30) from--
    while (to < row.length - 1 && row[to + 1]!.x - (row[to]!.x + row[to]!.width) < 30) to++
    const runs = row.slice(from, to + 1)
    const number = /^§\s*(\d+[a-z]*)$/.exec(runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim())?.[1]
    if (!number || runs.length < 2) continue
    const last = runs.at(-1)!
    merged.set(runs[0]!, { ...runs[0]!, width: last.x + last.width - runs[0]!.x, text: `§ ${number}.` })
    for (const r of runs.slice(1)) merged.set(r, null)
  }
  if (!merged.size) return { ...page, items }
  return { ...page, items: items.flatMap((i) => (merged.has(i) ? (merged.get(i) ? [merged.get(i)!] : []) : [i])) }
}

/** Wien's running head on every page: „Seite 1 von 2", the Zahl „821297/2026", the date. */
const WIEN_HEAD_RE = /^(?:Seite \d+ von \d+|\d+\/\d{4}|\d{1,2}\. (?:Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4})$/

/**
 * The page Wien's Textgegenüberstellung starts on: the first that carries
 * its title, in whatever case — 2026006 prints „TEXTGEGENÜBERSTELLUNG", and
 * read case-sensitively the page said the Land had published none
 * (25.10.2026) — or, titled otherwise, the template's header pair
 * „Geltende Fassung" | „Vorgeschlagene Fassung". -1 where no page has either.
 */
export function wienTguStart(pages: readonly { items: readonly { text: string }[] }[]): number {
  const titled = pages.findIndex((p) => p.items.some((i) => /^Textgegenüberstellung\b/i.test(i.text.trim())))
  if (titled >= 0) return titled
  return pages.findIndex((p) => p.items.some((i) => HEADER_CURRENT_RE.test(i.text.trim())) && p.items.some((i) => HEADER_PROPOSED_RE.test(i.text.trim())))
}

/**
 * Wien: the Textgegenüberstellung stands at the end of the draft's own PDF,
 * in the Bund's two-column template („Geltende Fassung" | „Vorgeschlagene
 * Fassung") — read by the Bund's reader (`annex/annexPdf.ts`) from the page
 * it starts on, with the Land's running head taken out first.
 */
async function readWien(detail: LandDraftRecord): Promise<TguRead | string> {
  // The newest version, as the draft's own link (`wien.ts`): the first one
  // was read until 26.10.2026, and 2026003's of 05.05.2026 prints § 11d's
  // text in force otherwise than its first of 18.03.2026.
  const doc = tguDocument(detail) ?? detail.draft.documents.at(-1)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const all = await pagesOf(bytes)
  const pages = all.map((p) => ({ ...p, items: p.items.filter((i) => !WIEN_HEAD_RE.test(i.text.trim())) }))
  const start = wienTguStart(pages)
  if (start < 0) return NO_TGU
  const laws = amendedLawsOf(detail.draft.title)
  // The draft's own text stands in front of the Textgegenüberstellung, in the same PDF.
  const draftText = pages.slice(0, start).flatMap((p) => p.items.map((i) => i.text)).join(' ')
  const { rows, droppedPages } = columnRows(pages.slice(start))
  const { paragraphs, unmapped } = withRenumberings(columnParagraphs(rows, laws), renumberingsOf(draftText, laws))
  return {
    paragraphs,
    droppedPages,
    fromDocument: { label: `${doc.title}, Textgegenüberstellung`, url, publisher: 'Stadt Wien' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
    laws,
    deletes: (n) => draftDeletes(draftText, n),
    renumbered: unmapped,
  }
}

/**
 * The two-column reader's rows, as `columnParagraphs` takes them — and the
 * pages it did not read, which the page states as the Bund's annex does
 * (26.10.2026: sbg-18192 read 26 of its 51 pages and said nothing of it).
 */
function columnRows(pages: Parameters<typeof parseAnnexPdf>[0]): { rows: ColumnRow[]; droppedPages: number } {
  const parsed = parseAnnexPdf(pages)
  return {
    rows: parsed.rows.map((r) => ({ kind: r.kind, law: r.law, heading: r.heading, para: r.para, current: r.current, proposed: r.proposed, changed: r.change !== 'unchanged' })),
    droppedPages: parsed.droppedPages,
  }
}

/**
 * Salzburg's running head („Q:\\…\\G-JG Novelle 2026 TGÜ.docx \\ 05.10.2026 13:16:00",
 * „1 von 2") and its § designations without a full stop („§ 64"), which the
 * Bund's reader takes as the row boundary only with one („§ 64.").
 */
const SBG_HEAD_RE = /^(?:[A-Z]:\\.*|\d+ von \d+)$|\.docx?\b/

/**
 * Salzburg: its Textgegenüberstellung is a document of its own, in the
 * Bund's two-column template — read by the Bund's reader once its running
 * head is out and its §§ carry their full stop (`withFullStops`).
 */
async function readSalzburg(detail: LandDraftRecord): Promise<TguRead | string> {
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const pages = (await pagesOf(bytes)).map((p) => withFullStops({ ...p, items: p.items.filter((i) => !SBG_HEAD_RE.test(i.text.trim())) }))
  const laws = amendedLawsOf(detail.draft.title)
  const draftText = await draftTextOf(draftSource(detail.draft.documents, 'Land Salzburg'))
  const { rows, droppedPages } = columnRows(pages)
  // „Der bisherige § 54a erhält die Paragraphenbezeichnung „§ 54b"": the draft's text says what the two columns do not (26.10.2026).
  const { paragraphs, unmapped } = withRenumberings(columnParagraphs(rows, laws), renumberingsOf(draftText ?? '', laws))
  return {
    paragraphs,
    droppedPages,
    fromDocument: { label: doc.title, url, publisher: 'Land Salzburg' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
    laws,
    deletes: (n) => draftDeletes(draftText ?? '', n),
    renumbered: unmapped,
    ...(draftText === null ? { complete: false as const } : {}),
  }
}

/**
 * Kärnten and Tirol (23.10.2026): the Land's own Textgegenüberstellung, a
 * document of its own, each in a layout of its own — read by its own
 * module (`landTguKaernten.ts`, `landTguTirol.ts`) and checked against RIS
 * like every other.
 */
interface OwnReader<Page> {
  publisher: string
  load: (bytes: Uint8Array) => Promise<Page[]>
  parse: (pages: Page[], laws: readonly string[]) => TguParagraph[] | TguReading
  /** The day the documents date themselves, where the draft's record does not (`kaerntenDated`, `tirolDated`): the Textgegenüberstellung's pages, and the draft's own text. */
  dated: (pages: Page[], draftText: string) => string | null
  /**
   * Whether an empty new column is „entfallen" only where the draft says
   * so (`draftDeletes`). Not for a reader that sees the deletion as such —
   * Tirol's struck text, as Oberösterreich's (`readOoe` passes none): „Der
   * 7a. Abschnitt wird aufgehoben" is struck there, and the draft's
   * sentence names no § the guard could find (723/2026, §§ 52a–d).
   */
  guardDeletes: boolean
}

const MONTH_NO: Record<string, string> = {
  jänner: '01', januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
}
const MONTHS_RE = Object.keys(MONTH_NO).join('|')

/**
 * Kärnten heads its Textgegenüberstellung „Begutachtungsentwurf Oktober 2026"
 * — the month, not the day. The first of it: the law in force is checked as
 * it stood when the month began, nearer the Begutachtung than the
 * Regierungsvorlage's date the archive otherwise gives (`placedAt`), and on
 * the side of withholding a § the law changed within that month.
 */
export function kaerntenDated(pages: readonly { items: readonly { text: string }[] }[], _draftText = ''): string | null {
  const head = (pages[0]?.items ?? []).map((i) => i.text).join(' ').replace(/\s+/g, ' ')
  const m = new RegExp(`Begutachtungsentwurf\\s+(${MONTHS_RE})\\s+(\\d{4})`, 'i').exec(head)
  return m ? `${m[2]}-${MONTH_NO[m[1]!.toLowerCase()]}-01` : null
}

/**
 * Tirol's running head: „VD-173/2-2026 Fassung vom 9. März 2026" — the
 * version's day. On the draft, and on a few of the Textgegenüberstellungen:
 * 7 of the 10 of 24.10.2026 print it only on the draft.
 */
export function tirolDated(pages: readonly { runs: readonly { s: string }[] }[], draftText = ''): string | null {
  const head = `${pages.slice(0, 2).flatMap((p) => p.runs.map((r) => r.s)).join(' ')} ${draftText.slice(0, 2000)}`.replace(/\s+/g, ' ')
  const m = new RegExp(`Fassung vom\\s+(\\d{1,2})\\.\\s*(${MONTHS_RE})\\s+(\\d{4})`, 'i').exec(head)
  return m ? `${m[3]}-${MONTH_NO[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, '0')}` : null
}

function readOwn<Page>({ publisher, load, parse, dated, guardDeletes }: OwnReader<Page>) {
  return async (detail: LandDraftRecord): Promise<TguRead | string> => {
    const doc = tguDocument(detail)
    const url = doc ? safeExternalUrl(doc.url) : null
    if (!doc || !url) return NO_TGU
    const pages = await load(await landPdfBytes(url))
    const laws = amendedLawsOf(detail.draft.title)
    // The draft's text: for the deletion guard, and for the date where the record keeps none.
    const draft = guardDeletes || !detail.draft.startedAt ? draftSource(detail.draft.documents, publisher) : null
    const draftText = draft ? await draftTextOf(draft) : ''
    const parsed = parse(pages, laws)
    const reading: TguReading = Array.isArray(parsed) ? { paragraphs: parsed } : parsed
    return {
      paragraphs: reading.paragraphs,
      ...(reading.reaches?.length ? { reaches: reading.reaches } : {}),
      ...(reading.droppedPages ? { droppedPages: reading.droppedPages } : {}),
      ...(reading.enacted?.length ? { enacted: reading.enacted } : {}),
      fromDocument: { label: doc.title, url, publisher },
      date: doc.date ?? detail.draft.startedAt ?? dated(pages, draftText ?? '') ?? detail.draft.placedAt ?? new Date().toISOString().slice(0, 10),
      laws,
      ...(guardDeletes ? { deletes: (n: string) => draftDeletes(draftText ?? '', n) } : {}),
      ...(draftText === null ? { complete: false as const } : {}),
    }
  }
}
const readKaernten = readOwn({ publisher: 'Land Kärnten', load: pagesOf, parse: ktnTguReading, dated: kaerntenDated, guardDeletes: true })
// Tirol marks its changes by colour and rule, as Oberösterreich does: its pages need their drawing, not only their text (`tirolTguPages`).
const readTirol = readOwn({ publisher: 'Land Tirol', load: tirolTguPages, parse: tirolTguReading, dated: tirolDated, guardDeletes: false })

const NO_TGU = 'Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.'

/** Where §§ were read and none can be shown. The page names every one under it, with why (`LandWithheldNotes`). */
const NONE_SHOWN = 'Aus dieser Textgegenüberstellung zeigt der Monitor keinen Paragraphen. Welche Paragraphen die Novelle ändert und warum sie hier fehlen, steht darunter; die Textgegenüberstellung selbst steht unter den Dokumenten.'

/** Whether a Land's Textgegenüberstellung is there to read: its own document, or for Wien inside the draft's PDF (the server says when there is none). */
export function hasTgu(land: LandCode, documents: readonly LandDocument[]): boolean {
  if (!READ_TGU[land]) return false
  return land === 'w' || documents.some((d) => isDraftTgu(d.title))
}
const READ_TGU: Partial<Record<LandCode, (detail: LandDraftRecord) => Promise<TguRead | string>>> = { ktn: readKaernten, ooe: readOoe, sbg: readSalzburg, t: readTirol, w: readWien }
const LAW_LABEL: Record<LandCode, string> = { ktn: 'Kärntner Landesrecht', ooe: 'Oö. Landesrecht', sbg: 'Salzburger Landesrecht', t: 'Tiroler Landesrecht', w: 'Wiener Landesrecht' }

const whole = (value: LandLawDiffResponse): Gathered<LandLawDiffResponse> => ({ value, complete: true })

/**
 * The law in force against the Land's Textgegenüberstellung — and whether
 * every read it rests on answered (`Gathered`): a failed PDF read throws, a
 * failed RIS read names its §§ as unchecked and keeps the answer out of the
 * cache.
 */
export async function compareTgu(land: LandCode, detail: LandDraftDetail): Promise<Gathered<LandLawDiffResponse>> {
  const read = READ_TGU[land]
  if (!read) return whole(unavailable('Die Textgegenüberstellungen dieses Landes liest der Monitor noch nicht.'))
  const got = await read(detail)
  if (typeof got === 'string') return whole(unavailable(got))
  const { paragraphs, fromDocument, date } = got
  const toDocument = { label: `${LAW_LABEL[land]}, Fassung vom ${formatDateDe(date)} (Abgleich)`, url: null, publisher: 'RIS (CC BY 4.0)' }
  // Beside the §§, in every answer (26.10.2026): instructions that reach §§
  // they do not name, said per law, and pages the reader did not read.
  const beside: Partial<LandLawDiffResponse> = {
    ...(got.reaches?.length ? { reaches: got.reaches } : {}),
    ...(got.droppedPages ? { droppedPages: got.droppedPages } : {}),
    ...(got.enacted?.length ? { enacted: got.enacted } : {}),
  }
  if (!paragraphs.length) {
    return whole(unavailable('In der Textgegenüberstellung fand der Monitor keine Paragraphen, die er lesen kann.', { fromDocument, ...beside }))
  }
  // Every § changed in a way the reader does not compose: named, each with
  // why — Kärnten 15193/2025 said „keine Paragraphen, die er lesen kann" and
  // named none of its 21 (25.10.2026).
  if (paragraphs.every((p) => p.unread)) {
    const withheld = once(paragraphs.map((p) => ({ law: p.law, ...idsOf(p), reason: p.because ?? ('unread' as const) })))
    return whole(unavailable(NONE_SHOWN, { fromDocument, withheld, ...beside }))
  }

  /** Whether every read answered; false keeps the answer out of the cache. */
  let complete = got.complete !== false
  /** Whether a RIS read failed: a § with nothing to check is then not known to be new or elided. */
  let risFailed = false
  const failed = <T>(fallback: T) => (): T => {
    complete = false
    risFailed = true
    return fallback
  }

  // A law RIS cannot be asked about withholds its §§, not the comparison;
  // null: the asking failed, which is not a law without §§.
  const laws = [...new Set([...got.laws, ...paragraphs.map((p) => p.law).filter((l): l is string => l !== null)])]
  const inForce = new Map<string, Map<string, string> | null>(await Promise.all(laws.map(async (law) => [law, await lawInForce(land, law, date).catch(failed(null))] as const)))

  /**
   * Why each § that is not shown is not, said on the page in words of its
   * own (`LandWithheldReason`, 25.10.2026); undefined where RIS refused its
   * text in force. Until then every § withheld for any other cause was
   * named „nicht wortgleich" too — a new §, one printed twice, one whose
   * new text the reader did not find.
   */
  const why: (LandWithheldReason | undefined)[] = paragraphs.map((p) => (p.unread ? (p.because ?? 'unread') : undefined))

  /**
   * The law a § belongs to, where RIS confirms the reading of it; null:
   * withheld. A § the document files under no law, or under the wrong one
   * in a package, goes to the law whose text in force it is. Those with no
   * wording to check — wholly new, or nothing but „(1) bis (4) …" — are
   * left for the second pass.
   */
  const attribute = async (p: TguParagraph, i: number): Promise<string | null | 'later'> => {
    if (p.unread) return null
    // Nothing to show and nothing to check: taken for a new §, it was shown
    // empty — gone from the page — wherever RIS lacked its number
    // (Oberösterreich 2021-16029, § 25; 25.10.2026).
    if (!p.old.length && !p.neu.length) {
      why[i] = 'unsure'
      return null
    }
    if (!p.old.length || onlyElided(joinLines(p.old))) return 'later'
    if (!p.neu.length && got.deletes && !got.deletes(p.number)) {
      why[i] = got.complete === false ? 'unchecked' : 'deletion'
      return null
    }
    const old = joinLines(p.old)
    let unchecked = false
    const risText = (url: string) => paragraphText(url).catch(() => {
      unchecked = true
      return failed(null)()
    })
    // A renumbered § is checked where it stands in force, under its old number (26.10.2026).
    const origin = p.from ?? p.number
    for (const law of p.law ? [p.law, ...laws.filter((l) => l !== p.law)] : laws) {
      const paras = inForce.get(law)
      // Its own law, or any where the document names none, could not be asked.
      if (paras === null) unchecked ||= !p.law || law === p.law
      const risUrl = paras?.get(origin)
      const text = risUrl ? await risText(risUrl) : null
      if (text !== null && standsInRis(old, text)) return law
    }
    // Not under any name the draft uses: by its own words (`paragraphByPhrase`).
    const phrase = searchPhrase(old)
    const hit = phrase
      ? await paragraphByPhrase(land, phrase, origin, date).catch(() => {
          unchecked = true
          return failed(null)()
        })
      : null
    const text = hit?.law ? await risText(hit.url) : null
    if (hit?.law && text !== null && standsInRis(old, text)) return hit.law
    if (unchecked) why[i] = 'unchecked'
    return null
  }
  const first = await inChunks(paragraphs.map((p, i) => [p, i] as const), PARALLEL, ([p, i]) => attribute(p, i))
  // A law found only by phrase gets its §§ too — for its new and elided
  // neighbours, and for the §§ whose phrase RIS did not find but whose text
  // stands in that law all the same.
  const discovered = [...new Set(first.filter((l): l is string => typeof l === 'string' && l !== 'later'))].filter((l) => !inForce.has(l))
  for (const law of discovered) inForce.set(law, await lawInForce(land, law, date).catch(failed(null)))
  if (discovered.length) {
    const retried = await inChunks(paragraphs.map((p, i) => [p, i] as const), PARALLEL, async ([p, i]) => {
      if (first[i] !== null || !p.old.length || p.unread) return first[i] ?? null
      // The same guard as the first pass: an empty new column is „entfallen" only where the draft says so.
      if (!p.neu.length && got.deletes && !got.deletes(p.number)) return null
      for (const law of discovered) {
        const paras = inForce.get(law)
        if (paras === null) why[i] = 'unchecked'
        const risUrl = paras?.get(p.from ?? p.number)
        const text = risUrl ? await paragraphText(risUrl).catch(failed(null)) : null
        if (risUrl && text === null) why[i] = 'unchecked'
        if (text !== null && standsInRis(joinLines(p.old), text)) {
          why[i] = undefined
          return law
        }
      }
      return null
    })
    retried.forEach((v, i) => { first[i] = v })
  }
  /**
   * Second pass, in the document's order: a Textgegenüberstellung lists its
   * §§ law by law, so a § with nothing to check belongs to the law of the
   * confirmed § before it (or after it, at a law's start) — and is shown only
   * where RIS agrees: a new § must not exist there yet, an elided one must.
   */
  const neighbour = (i: number): string | null => {
    for (let j = i - 1; j >= 0; j--) if (typeof first[j] === 'string' && first[j] !== 'later') return first[j] as string
    for (let j = i + 1; j < first.length; j++) if (typeof first[j] === 'string' && first[j] !== 'later') return first[j] as string
    return laws.length === 1 ? laws[0]! : null
  }
  const verdict = (p: TguParagraph, i: number, vacated: ReadonlySet<string>): string | null => {
    if (first[i] !== 'later') return first[i] as string | null
    const law = p.law ?? neighbour(i)
    const paras = law ? inForce.get(law) : null
    // An empty answer is a law RIS did not find under this name, not one
    // without the §: read as „known, § absent" it let every new § of Tirol's
    // drafts through unchecked (RIS files „Bauordnung 2022, Tiroler",
    // 23.10.2026).
    if (law && paras?.size && (p.old.length ? paras.has(p.from ?? p.number) : !paras.has(p.number) || vacated.has(`${p.law ?? ''}|${p.number}`))) return law
    // Its law could not be asked, or some RIS read failed and its neighbours' law with it.
    why[i] = (law && paras === null) || risFailed ? 'unchecked' : p.old.length ? 'elided' : 'inserted'
    return null
  }
  // The §§ in force first — by their text, or elided by their number — then
  // the new ones, which may take a number a renumbered § leaves.
  const fresh = (p: TguParagraph, i: number) => first[i] === 'later' && !p.old.length
  const verdicts = paragraphs.map((p, i) => (fresh(p, i) ? null : verdict(p, i, new Set())))
  /**
   * The numbers a renumbered § leaves, where RIS confirmed it there
   * (26.10.2026): a § the document prints as new under such a number is new
   * although RIS still has the number — Tirol 723/2026's new § 72, where the
   * § 72 in force becomes § 74. Also where its text is elided and RIS
   * confirmed only its number (Salzburg 19400, § 11a → § 11d).
   */
  const vacated = new Set(paragraphs.flatMap((p, i) => (p.from && verdicts[i] ? [`${p.law ?? ''}|${p.from}`] : [])))
  paragraphs.forEach((p, i) => {
    if (fresh(p, i)) verdicts[i] = verdict(p, i, vacated)
  })
  // One law, one name: RIS confirms some §§ under its own short title with
  // the abbreviation („Kärntner Jagdgesetz 2000 - K-JG") where the draft names
  // it without, and the two names made one law two groups — and a § whose old
  // text stood under one and its new text under the other a false „entfallen"
  // plus a false „neu" (Kärnten 38532, 52586; 23.10.2026). The draft's name wins.
  const named = (law: string | null) => (law ? (draftNameOf(law, laws) ?? readableLawName(law)) : law)
  /* And its withheld §§ in the same group (25.10.2026): a law the document
   * names one way and RIS another — renamed („Kärntner Schulbaufondsgesetz",
   * RIS's „Kärntner Bildungsbaufondsgesetz – K-BBFG", 1177/2021), misspelt in
   * the draft's title, declined after its article („das Kärntner
   * landwirtschaftliche Schulgesetz 1993", 68550/2026) — has its §§ withheld
   * where RIS put the ones it confirmed, if it put every one of them under
   * the same law. The page folded them into the only group there was until
   * it stopped folding §§ of a law it does not know (`withheldGroups`). */
  const confirmedAs = new Map<string, Set<string>>()
  paragraphs.forEach((p, i) => {
    const v = verdicts[i]
    if (!p.law || !v) return
    const from = named(p.law)!
    confirmedAs.set(from, (confirmedAs.get(from) ?? new Set<string>()).add(named(v)!))
  })
  const filedUnder = (law: string | null) => {
    const n = named(law)
    const as = n ? confirmedAs.get(n) : undefined
    return as?.size === 1 ? [...as][0]! : n
  }
  const confirmed = paragraphs.flatMap((p, i) => (verdicts[i] ? [{ ...p, law: named(verdicts[i]) }] : []))
  /* One § once (24.10.2026). A § that comes twice under one law — Kärnten's
   * left column prints some §§ twice, beside each place an instruction
   * touches — came out „entfallen" and „neu" at once (1739-2019-65, §§ 9,
   * 9a, 31). The one pair that is a reading: its text in force alone, and
   * its new text alone — those are one §. Anything else twice is withheld. */
  const byKey = new Map<string, TguParagraph[]>()
  for (const p of confirmed) {
    // A § that moves is not the § that takes its old number (`tguParagraphKey`).
    const key = tguParagraphKey(p)
    byKey.set(key, [...(byKey.get(key) ?? []), p])
  }
  const doubled: { law: string | null; id: string; fromId?: string }[] = []
  const kept = [...byKey.values()].flatMap((group) => {
    if (group.length === 1) return group
    const oldOnly = group.filter((p) => p.old.length && !p.neu.length)
    const neuOnly = group.filter((p) => p.neu.length && !p.old.length)
    if (group.length === 2 && oldOnly.length === 1 && neuOnly.length === 1) {
      const division = oldOnly[0]!.division || neuOnly[0]!.division ? { ...neuOnly[0]!.division, ...oldOnly[0]!.division } : undefined
      return [{ ...oldOnly[0]!, neu: neuOnly[0]!.neu, changed: true, ...(division ? { division } : {}) }]
    }
    doubled.push({ law: group[0]!.law, ...idsOf(group[0]!) })
    return []
  })
  // Under the law the document files it under, or that of the confirmed §
  // beside it — where the page counts it (`LandLawDiffSection`).
  const withheld = once([
    ...paragraphs.flatMap((p, i) => (verdicts[i] ? [] : [{ law: filedUnder(p.law ?? neighbour(i)), ...idsOf(p), ...(why[i] ? { reason: why[i] } : {}) }])),
    ...doubled.map((d) => ({ ...d, reason: 'twice' as const })),
  ])
  // Nothing to show: the §§ are named all the same, each with why — the
  // page lists them under the sentence (`LandLawDiffSection`), as it does
  // beside the §§ it shows.
  if (!kept.length) return { value: unavailable(NONE_SHOWN, { fromDocument, toDocument, withheld, ...beside }), complete }

  const { from, to } = tguUnits(kept)
  const units = withHeadings(diffLawUnits(from, to), kept)
  const s = summarizeDiff(units)
  return {
    value: {
      from: 'geltend',
      to: 'entwurf',
      available: true,
      unavailableReason: null,
      units,
      stats: { total: s.total, unchanged: s.unchanged, changed: s.changed, editorial: s.editorial, inserted: s.inserted, removed: s.removed },
      fromDocument,
      toDocument,
      addedLaws: [],
      droppedLaws: [],
      sharedWith: [],
      withheld,
      ...beside,
      // Only beside §§ compared: what the list does by number, it says above it (`renumberedNote`).
      ...(got.renumbered?.length ? { renumbered: got.renumbered } : {}),
    },
    complete,
  }
}

/**
 * Each withheld § once per law and reason (26.10.2026). Deduplicated by law
 * and id alone, the second reason of a § was dropped — and two Artikel filed
 * under no law ran into one: 2314/2021 named § 6 once for two laws.
 */
function once(items: LandLawDiffResponse['withheld']): LandLawDiffResponse['withheld'] {
  return items.filter((w, i, all) => all.findIndex((o) => o.law === w.law && o.id === w.id && o.fromId === w.fromId && o.reason === w.reason) === i)
}

/** A withheld §'s ids: its number, and the number it comes from where the draft renumbers it (`TguParagraph.from`). */
function idsOf(p: TguParagraph): { id: string; fromId?: string } {
  return p.from ? { id: paraId(p.number), fromId: paraId(p.from) } : { id: paraId(p.number) }
}

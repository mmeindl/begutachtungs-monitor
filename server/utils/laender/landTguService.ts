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
 */
import type { LandCode, LandDocument, LandDraftDetail, LandLawDiffResponse, LandTextDocument } from '#shared/types'
import type { LandDraftRecord } from './texts/stations'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { formatDateDe } from '#shared/utils/format'
import { diffLawUnits, summarizeDiff } from '../diff/lawDiff'
import { lawInForce, paragraphByPhrase, paragraphText } from './landKons'
import { amendedLawsOf, columnParagraphs, lawName, draftDeletes, joinLines, mergeParagraphs, onlyElided, searchPhrase, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, type ColumnRow, type TguParagraph } from './landTgu'
import { draftSource, landPdfBytes } from './texts/read'
import { tguPages } from './landTguPdf'
import { pagesOf } from '../annex/annexPdfPages'
import { parseAnnexPdf } from '../annex/annexPdf'
import { ktnTguParagraphs } from './landTguKaernten'
import { tirolTguPages, tirolTguParagraphs } from './landTguTirol'

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
 * A law's name as a key, the forms RIS and the drafts use folded into one
 * (lower case):
 *  - without its abbreviation — „Kärntner Fischereigesetz-K-FG", „… 2000 -
 *    K-JG", „Kärntner Bauvorschriften- K-BV";
 *  - in the drafts' word order where RIS turns it round — „Bauordnung 2022,
 *    Tiroler" (Tirol, 24.10.2026), „Gemeinde-Investitionsfonds, Gesetz über
 *    den";
 *  - without „Gesetz über …" in front — „Gesetz über die Geschäftsordnung
 *    des Kärntner Landtages" is the „Geschäftsordnung des Kärntner Landtages"
 *    RIS names.
 */
function bareLawName(name: string): string {
  let n = lawName(name).replace(/\s+/g, ' ').trim()
  const abbreviation = /\s*[–-]\s*([\p{Lu}][\p{L}.\d-]{0,15})(?:\s+\d{4})?$/u.exec(n)
  if (abbreviation && (abbreviation[1]!.match(/\p{Lu}/gu) ?? []).length >= 2) n = n.slice(0, abbreviation.index).trim()
  n = n.replace(/^(.+),\s*(Tiroler|Kärntner|Salzburger|Wiener|Oö\.)$/u, '$2 $1')
  n = n.replace(/^(.+),\s*Gesetz(?:\s+(?:über|zur|zum)(?:\s+(?:den|die|das|dem))?)?$/u, '$1')
  n = n.replace(/^Gesetz\s+(?:über|zur|zum)(?:\s+(?:den|die|das|dem))?\s+/u, '')
  return n.toLowerCase()
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
}

/**
 * Oberösterreich: the Land's own Textgegenüberstellung, one column with
 * underline and strike (`landTgu.ts`).
 */
async function readOoe(detail: LandDraftRecord): Promise<TguRead | string> {
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const paragraphs = mergeParagraphs(tguParagraphs((await tguPages(bytes)).flatMap(tguLines)))
  return {
    paragraphs,
    fromDocument: { label: doc.title, url, publisher: 'Land Oberösterreich' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
    // The document names each law above its §§ (`tguParagraphs`), and strikes what it deletes.
    laws: [...new Set(paragraphs.map((p) => p.law).filter((l): l is string => l !== null))],
  }
}

/** Wien's running head on every page: „Seite 1 von 2", the Zahl „821297/2026", the date. */
const WIEN_HEAD_RE = /^(?:Seite \d+ von \d+|\d+\/\d{4}|\d{1,2}\. (?:Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4})$/

/**
 * Wien: the Textgegenüberstellung stands at the end of the draft's own PDF,
 * in the Bund's two-column template („Geltende Fassung" | „Vorgeschlagene
 * Fassung") — read by the Bund's reader (`annex/annexPdf.ts`) from the page
 * it starts on, with the Land's running head taken out first.
 */
async function readWien(detail: LandDraftRecord): Promise<TguRead | string> {
  const doc = tguDocument(detail) ?? detail.draft.documents[0]
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const all = await pagesOf(bytes)
  const pages = all.map((p) => ({ ...p, items: p.items.filter((i) => !WIEN_HEAD_RE.test(i.text.trim())) }))
  const start = pages.findIndex((p) => p.items.some((i) => /^Textgegenüberstellung\b/.test(i.text.trim())))
  if (start < 0) return NO_TGU
  const laws = amendedLawsOf(detail.draft.title)
  // The draft's own text stands in front of the Textgegenüberstellung, in the same PDF.
  const draftText = pages.slice(0, start).flatMap((p) => p.items.map((i) => i.text)).join(' ')
  return {
    paragraphs: columnParagraphs(columnRows(pages.slice(start)), laws),
    fromDocument: { label: `${doc.title}, Textgegenüberstellung`, url, publisher: 'Stadt Wien' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
    laws,
    deletes: (n) => draftDeletes(draftText, n),
  }
}

/** The two-column reader's rows, as `columnParagraphs` takes them. */
function columnRows(pages: Parameters<typeof parseAnnexPdf>[0]): ColumnRow[] {
  return parseAnnexPdf(pages).rows.map((r) => ({ kind: r.kind, law: r.law, heading: r.heading, para: r.para, current: r.current, proposed: r.proposed, changed: r.change !== 'unchanged' }))
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
 * head is out and its §§ carry their full stop.
 */
async function readSalzburg(detail: LandDraftRecord): Promise<TguRead | string> {
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const bytes = await landPdfBytes(url)
  const pages = (await pagesOf(bytes)).map((p) => ({
    ...p,
    items: p.items
      .filter((i) => !SBG_HEAD_RE.test(i.text.trim()))
      .map((i) => (/^§\s*\d+[a-z]*$/.test(i.text.trim()) ? { ...i, text: `${i.text.trim()}.` } : i)),
  }))
  const laws = amendedLawsOf(detail.draft.title)
  const draft = draftSource(detail.draft.documents, 'Land Salzburg')
  const draftText = draft ? (await draft.read().catch(() => ({ text: '' }))).text : ''
  return {
    paragraphs: columnParagraphs(columnRows(pages), laws),
    fromDocument: { label: doc.title, url, publisher: 'Land Salzburg' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
    laws,
    deletes: (n) => draftDeletes(draftText, n),
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
  parse: (pages: Page[], laws: readonly string[]) => TguParagraph[]
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
    const draftText = draft ? (await draft.read().catch(() => ({ text: '' }))).text : ''
    return {
      paragraphs: parse(pages, laws),
      fromDocument: { label: doc.title, url, publisher },
      date: doc.date ?? detail.draft.startedAt ?? dated(pages, draftText) ?? detail.draft.placedAt ?? new Date().toISOString().slice(0, 10),
      laws,
      ...(guardDeletes ? { deletes: (n: string) => draftDeletes(draftText, n) } : {}),
    }
  }
}
const readKaernten = readOwn({ publisher: 'Land Kärnten', load: pagesOf, parse: ktnTguParagraphs, dated: kaerntenDated, guardDeletes: true })
// Tirol marks its changes by colour and rule, as Oberösterreich does: its pages need their drawing, not only their text (`tirolTguPages`).
const readTirol = readOwn({ publisher: 'Land Tirol', load: tirolTguPages, parse: tirolTguParagraphs, dated: tirolDated, guardDeletes: false })

const NO_TGU = 'Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.'

/** Whether a Land's Textgegenüberstellung is there to read: its own document, or for Wien inside the draft's PDF (the server says when there is none). */
export function hasTgu(land: LandCode, documents: readonly LandDocument[]): boolean {
  if (!READ_TGU[land]) return false
  return land === 'w' || documents.some((d) => isDraftTgu(d.title))
}
const READ_TGU: Partial<Record<LandCode, (detail: LandDraftRecord) => Promise<TguRead | string>>> = { ktn: readKaernten, ooe: readOoe, sbg: readSalzburg, t: readTirol, w: readWien }
const LAW_LABEL: Record<LandCode, string> = { ktn: 'Kärntner Landesrecht', ooe: 'Oö. Landesrecht', sbg: 'Salzburger Landesrecht', t: 'Tiroler Landesrecht', w: 'Wiener Landesrecht' }

export async function compareTgu(land: LandCode, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  const read = READ_TGU[land]
  if (!read) return unavailable('Die Textgegenüberstellungen dieses Landes liest der Monitor noch nicht.')
  const got = await read(detail)
  if (typeof got === 'string') return unavailable(got)
  const { paragraphs, fromDocument, date } = got
  const toDocument = { label: `${LAW_LABEL[land]}, Fassung vom ${formatDateDe(date)} (Abgleich)`, url: null, publisher: 'RIS (CC BY 4.0)' }
  if (!paragraphs.some((p) => !p.unread)) {
    return unavailable('In der Textgegenüberstellung fand der Monitor keine Paragraphen, die er lesen kann.', { fromDocument })
  }

  // A law RIS cannot be asked about withholds its §§, not the comparison.
  const laws = [...new Set([...got.laws, ...paragraphs.map((p) => p.law).filter((l): l is string => l !== null)])]
  const inForce = new Map(await Promise.all(laws.map(async (law) => [law, await lawInForce(land, law, date).catch(() => null)] as const)))

  /**
   * The law a § belongs to, where RIS confirms the reading of it; null:
   * withheld. A § the document files under no law, or under the wrong one
   * in a package, goes to the law whose text in force it is. Those with no
   * wording to check — wholly new, or nothing but „(1) bis (4) …" — are
   * left for the second pass.
   */
  const attribute = async (p: TguParagraph): Promise<string | null | 'later'> => {
    if (p.unread) return null
    if (!p.old.length || onlyElided(joinLines(p.old))) return 'later'
    if (!p.neu.length && got.deletes && !got.deletes(p.number)) return null
    const old = joinLines(p.old)
    for (const law of p.law ? [p.law, ...laws.filter((l) => l !== p.law)] : laws) {
      const risUrl = inForce.get(law)?.get(p.number)
      if (risUrl && standsInRis(old, await paragraphText(risUrl).catch(() => ''))) return law
    }
    // Not under any name the draft uses: by its own words (`paragraphByPhrase`).
    const phrase = searchPhrase(old)
    const hit = phrase ? await paragraphByPhrase(land, phrase, p.number, date).catch(() => null) : null
    if (hit?.law && standsInRis(old, await paragraphText(hit.url).catch(() => ''))) return hit.law
    return null
  }
  const first = await inChunks(paragraphs, PARALLEL, attribute)
  // A law found only by phrase gets its §§ too — for its new and elided
  // neighbours, and for the §§ whose phrase RIS did not find but whose text
  // stands in that law all the same.
  const discovered = [...new Set(first.filter((l): l is string => typeof l === 'string' && l !== 'later'))].filter((l) => !inForce.has(l))
  for (const law of discovered) inForce.set(law, await lawInForce(land, law, date).catch(() => null))
  if (discovered.length) {
    const retried = await inChunks(paragraphs.map((p, i) => [p, i] as const), PARALLEL, async ([p, i]) => {
      if (first[i] !== null || !p.old.length) return first[i] ?? null
      // The same guard as the first pass: an empty new column is „entfallen" only where the draft says so.
      if (!p.neu.length && got.deletes && !got.deletes(p.number)) return null
      for (const law of discovered) {
        const risUrl = inForce.get(law)?.get(p.number)
        if (risUrl && standsInRis(joinLines(p.old), await paragraphText(risUrl).catch(() => ''))) return law
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
  const verdicts = paragraphs.map((p, i) => {
    if (first[i] !== 'later') return first[i] as string | null
    const law = p.law ?? neighbour(i)
    const paras = law ? inForce.get(law) : null
    // An empty answer is a law RIS did not find under this name, not one
    // without the §: read as „known, § absent" it let every new § of Tirol's
    // drafts through unchecked (RIS files „Bauordnung 2022, Tiroler",
    // 23.10.2026).
    if (!law || !paras?.size) return null
    return (p.old.length ? paras.has(p.number) : !paras.has(p.number)) ? law : null
  })
  // One law, one name: RIS confirms some §§ under its own short title with
  // the abbreviation („Kärntner Jagdgesetz 2000 - K-JG") where the draft names
  // it without, and the two names made one law two groups — and a § whose old
  // text stood under one and its new text under the other a false „entfallen"
  // plus a false „neu" (Kärnten 38532, 52586; 23.10.2026). The draft's name wins.
  const named = (law: string | null) => (law ? (draftNameOf(law, laws) ?? readableLawName(law)) : law)
  const confirmed = paragraphs.flatMap((p, i) => (verdicts[i] ? [{ ...p, law: named(verdicts[i]) }] : []))
  /* One § once (24.10.2026). A § that comes twice under one law — Kärnten's
   * left column prints some §§ twice, beside each place an instruction
   * touches — came out „entfallen" and „neu" at once (1739-2019-65, §§ 9,
   * 9a, 31). The one pair that is a reading: its text in force alone, and
   * its new text alone — those are one §. Anything else twice is withheld. */
  const byKey = new Map<string, TguParagraph[]>()
  for (const p of confirmed) {
    const key = `${p.law ?? ''}|${p.number}`
    byKey.set(key, [...(byKey.get(key) ?? []), p])
  }
  const doubled: { law: string | null; id: string }[] = []
  const kept = [...byKey.values()].flatMap((group) => {
    if (group.length === 1) return group
    const oldOnly = group.filter((p) => p.old.length && !p.neu.length)
    const neuOnly = group.filter((p) => p.neu.length && !p.old.length)
    if (group.length === 2 && oldOnly.length === 1 && neuOnly.length === 1) {
      return [{ ...oldOnly[0]!, neu: neuOnly[0]!.neu, changed: true }]
    }
    doubled.push({ law: group[0]!.law, id: `§${group[0]!.number}` })
    return []
  })
  // Under the law the document files it under, or that of the confirmed §
  // beside it — where the page counts it (`LandLawDiffSection`).
  const withheld: LandLawDiffResponse['withheld'] = [
    ...paragraphs.flatMap((p, i) => (verdicts[i] ? [] : [{ law: named(p.law ?? neighbour(i)), id: `§${p.number}`, ...(p.unread ? { reason: 'unread' as const } : {}) }])),
    ...doubled,
  ].filter((w, i, all) => all.findIndex((o) => o.law === w.law && o.id === w.id) === i)
  if (!kept.length) {
    return unavailable(
      withheld.every((w) => w.reason === 'unread')
        ? 'Die Textgegenüberstellung ändert diese Paragraphen nur in einzelnen Wörtern oder Sätzen; den neuen Wortlaut setzt der Monitor nicht selbst zusammen. Sie steht unter den Dokumenten.'
        : 'Den geltenden Text in dieser Textgegenüberstellung fand der Monitor im RIS nicht wortgleich; sie steht unter den Dokumenten.',
      { fromDocument, toDocument, withheld },
    )
  }

  const { from, to } = tguUnits(kept)
  const units = withHeadings(diffLawUnits(from, to), kept)
  const s = summarizeDiff(units)
  return {
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
  }
}

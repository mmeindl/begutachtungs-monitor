/**
 * „Was ändert der Entwurf?" for a Land's draft (22.10.2026): the law in force
 * against the law as the draft would have it, both read from the Land's own
 * Textgegenüberstellung (`landTgu.ts`) — the question the
 * Ministerialentwurf's page answers from the ressort's annex.
 *
 * A § IS SHOWN ONLY WHERE RIS CONFIRMS OUR READING OF IT. The text in force
 * we read off the document must stand in RIS's consolidated Landesrecht at
 * the document's date (`shareInRis` ≥ 0.98); a § the document prints as wholly
 * new must not exist there yet. Everything else is withheld and counted, and
 * the page says how many — as the federal annex withholds the rows its RIS
 * check does not carry. What the check cannot see is the draft's side alone;
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
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { lawInForce, paragraphByPhrase, paragraphText } from './landKons'
import { amendedLawsOf, columnParagraphs, draftDeletes, joinLines, mergeParagraphs, onlyElided, searchPhrase, standsInRis, tguLines, tguParagraphs, tguUnits, withHeadings, type ColumnRow, type TguParagraph } from './landTgu'
import { draftSource } from './texts/read'
import { tguPages } from './landTguPdf'
import { pagesOf } from '../annex/annexPdfPages'
import { parseAnnexPdf } from '../annex/annexPdf'

const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024
/** RIS documents fetched at once while checking the §§ */
const PARALLEL = 8

const TGU_TITLE_RE = /gegenüber|\bTGÜ(?!\p{L})/iu

/** The Land's Textgegenüberstellung among the draft's documents, if it published one. */
export function tguDocument(detail: LandDraftRecord) {
  return detail.draft.documents.find((d) => TGU_TITLE_RE.test(d.title)) ?? null
}

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from: 'geltend', to: 'entwurf', available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: 0, ...rest,
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
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const paragraphs = mergeParagraphs(tguParagraphs((await tguPages(new Uint8Array(bytes))).flatMap(tguLines)))
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
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const all = await pagesOf(new Uint8Array(bytes))
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
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const pages = (await pagesOf(new Uint8Array(bytes))).map((p) => ({
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

const NO_TGU = 'Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.'

/** Whether a Land's Textgegenüberstellung is there to read: its own document, or for Wien inside the draft's PDF (the server says when there is none). */
export function hasTgu(land: LandCode, documents: readonly LandDocument[]): boolean {
  if (!READ_TGU[land]) return false
  return land === 'w' || documents.some((d) => TGU_TITLE_RE.test(d.title))
}
const READ_TGU: Partial<Record<LandCode, (detail: LandDraftRecord) => Promise<TguRead | string>>> = { ooe: readOoe, sbg: readSalzburg, w: readWien }
const LAW_LABEL: Record<LandCode, string> = { ooe: 'Oö. Landesrecht', sbg: 'Salzburger Landesrecht', w: 'Wiener Landesrecht' }

export async function compareTgu(land: LandCode, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  const read = READ_TGU[land]
  if (!read) return unavailable('Die Textgegenüberstellungen dieses Landes liest der Monitor noch nicht.')
  const got = await read(detail)
  if (typeof got === 'string') return unavailable(got)
  const { paragraphs, fromDocument, date } = got
  const toDocument = { label: `${LAW_LABEL[land]}, Fassung vom ${formatDateDe(date)} (Abgleich)`, url: null, publisher: 'RIS (CC BY 4.0)' }
  if (!paragraphs.length) {
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
    if (!law || !paras) return null
    return (p.old.length ? paras.has(p.number) : !paras.has(p.number)) ? law : null
  })
  const kept = paragraphs.flatMap((p, i) => (verdicts[i] ? [{ ...p, law: verdicts[i] }] : []))
  const withheld = paragraphs.length - kept.length
  if (!kept.length) {
    return unavailable(
      'Den geltenden Text in dieser Textgegenüberstellung fand der Monitor im RIS nicht wortgleich; sie steht unter den Dokumenten.',
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

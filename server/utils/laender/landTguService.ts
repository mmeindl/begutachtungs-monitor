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
import type { LandCode, LandDraftDetail, LandLawDiffResponse, LandTextDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { formatDateDe } from '#shared/utils/format'
import { diffLawUnits, summarizeDiff } from '../diff/lawDiff'
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { lawInForce, paragraphText } from './landKons'
import { amendedLawOf, columnParagraphs, joinLines, mergeParagraphs, standsInRis, tguLines, tguParagraphs, tguUnits, type TguParagraph } from './landTgu'
import { tguPages } from './landTguPdf'
import { pagesOf } from '../annex/annexPdfPages'
import { parseAnnexPdf } from '../annex/annexPdf'

const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024
/** RIS documents fetched at once while checking the §§ */
const PARALLEL = 8

const TGU_TITLE_RE = /gegenüber/i

/** The Land's Textgegenüberstellung among the draft's documents, if it published one. */
export function tguDocument(detail: LandDraftDetail) {
  return detail.draft.documents.find((d) => TGU_TITLE_RE.test(d.title)) ?? null
}

const emptyStats = { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 }

function unavailable(reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse {
  return {
    from: 'geltend', to: 'entwurf', available: false, unavailableReason: reason, units: [], stats: emptyStats,
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: 0, kundmachung: null, ...rest,
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
}

/**
 * Oberösterreich: the Land's own Textgegenüberstellung, one column with
 * underline and strike (`landTgu.ts`).
 */
async function readOoe(detail: LandDraftDetail): Promise<TguRead | string> {
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  return {
    paragraphs: mergeParagraphs(tguParagraphs((await tguPages(new Uint8Array(bytes))).flatMap(tguLines))),
    fromDocument: { label: doc.title, url, publisher: 'Land Oberösterreich' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
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
async function readWien(detail: LandDraftDetail): Promise<TguRead | string> {
  const doc = tguDocument(detail) ?? detail.draft.documents[0]
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return NO_TGU
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const pages = (await pagesOf(new Uint8Array(bytes))).map((p) => ({ ...p, items: p.items.filter((i) => !WIEN_HEAD_RE.test(i.text.trim())) }))
  const start = pages.findIndex((p) => p.items.some((i) => /^Textgegenüberstellung\b/.test(i.text.trim())))
  if (start < 0) return NO_TGU
  const parse = parseAnnexPdf(pages.slice(start))
  const rows = parse.rows.map((r) => ({ kind: r.kind, law: r.law, para: r.para, current: r.current, proposed: r.proposed, changed: r.change !== 'unchanged' }))
  return {
    paragraphs: columnParagraphs(rows, amendedLawOf(detail.draft.title)),
    fromDocument: { label: `${doc.title}, Textgegenüberstellung`, url, publisher: 'Stadt Wien' },
    date: doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10),
  }
}

const NO_TGU = 'Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.'
const READ_TGU: Partial<Record<LandCode, (detail: LandDraftDetail) => Promise<TguRead | string>>> = { ooe: readOoe, w: readWien }
const LAW_LABEL: Partial<Record<LandCode, string>> = { ooe: 'Oö. Landesrecht', w: 'Wiener Landesrecht' }

export async function compareTgu(land: LandCode, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  const read = READ_TGU[land]
  if (!read) return unavailable('Textgegenüberstellungen liest der Monitor bisher für Oberösterreich und Wien.')
  const got = await read(detail)
  if (typeof got === 'string') return unavailable(got)
  const { paragraphs, fromDocument, date } = got
  const toDocument = { label: `${LAW_LABEL[land]}, Fassung vom ${formatDateDe(date)} (Abgleich)`, url: null, publisher: 'RIS (CC BY 4.0)' }
  if (!paragraphs.length) {
    return unavailable('In der Textgegenüberstellung fand der Monitor keine Paragraphen, die er lesen kann.', { fromDocument })
  }

  // A law RIS cannot be asked about withholds its §§, not the comparison.
  const laws = [...new Set(paragraphs.map((p) => p.law).filter((l): l is string => l !== null))]
  const inForce = new Map(await Promise.all(laws.map(async (law) => [law, await lawInForce(land, law, date).catch(() => null)] as const)))

  const confirmed = async (p: TguParagraph): Promise<boolean> => {
    const paras = p.law ? inForce.get(p.law) : null
    if (!paras) return false
    // Wholly new: RIS must not know the number yet.
    if (!p.old.length) return !paras.has(p.number)
    const risUrl = paras.get(p.number)
    if (!risUrl) return false
    const risText = await paragraphText(risUrl).catch(() => '')
    return standsInRis(joinLines(p.old), risText)
  }
  const verdicts = await inChunks(paragraphs, PARALLEL, confirmed)
  const kept = paragraphs.filter((_, i) => verdicts[i])
  const withheld = paragraphs.length - kept.length
  if (!kept.length) {
    return unavailable(
      'Den geltenden Text in dieser Textgegenüberstellung fand der Monitor im RIS nicht wortgleich; sie steht unter den Dokumenten.',
      { fromDocument, toDocument, withheld },
    )
  }

  const { from, to } = tguUnits(kept)
  const units = diffLawUnits(from, to)
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
    kundmachung: null,
  }
}

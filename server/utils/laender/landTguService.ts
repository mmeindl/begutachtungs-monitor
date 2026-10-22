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
 * Oberösterreich only: its documents are the format measured. Salzburg's and
 * Wien's are not read until they are measured.
 */
import type { LandCode, LandDraftDetail, LandLawDiffResponse } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { formatDateDe } from '#shared/utils/format'
import { diffLawUnits, summarizeDiff } from '../diff/lawDiff'
import { upstreamBytes, type UpstreamPolicy } from '../upstream/fetch'
import { lawInForce, paragraphText } from './landKons'
import { joinLines, mergeParagraphs, shareInRis, STANDS_IN_RIS, tguLines, tguParagraphs, tguUnits, type TguParagraph } from './landTgu'
import { tguPages } from './landTguPdf'

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
    fromDocument: null, toDocument: null, addedLaws: [], droppedLaws: [], sharedWith: [], withheld: 0, ...rest,
  }
}

async function inChunks<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

export async function compareTgu(land: LandCode, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  if (land !== 'ooe') return unavailable('Textgegenüberstellungen liest der Monitor bisher nur für Oberösterreich.')
  const doc = tguDocument(detail)
  const url = doc ? safeExternalUrl(doc.url) : null
  if (!doc || !url) return unavailable('Das Land hat zu diesem Entwurf keine Textgegenüberstellung veröffentlicht.')
  const date = doc.date ?? detail.draft.startedAt ?? new Date().toISOString().slice(0, 10)
  const fromDocument = { label: doc.title, url, publisher: 'Land Oberösterreich' }
  const toDocument = { label: `Oö. Landesrecht, Fassung vom ${formatDateDe(date)} (Abgleich)`, url: null, publisher: 'RIS (CC BY 4.0)' }

  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const paragraphs = mergeParagraphs(tguParagraphs((await tguPages(new Uint8Array(bytes))).flatMap(tguLines)))
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
    return shareInRis(joinLines(p.old), risText) >= STANDS_IN_RIS
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
  }
}

/**
 * A Land's draft against its Kundmachung (22.10.2026), for the draft page's
 * „Im Landesgesetzblatt": the PDF the Land published as Begutachtungsentwurf,
 * the Landesgesetzblatt's XML from RIS, compared § by § (`landLawDiff.ts`,
 * docs/architecture.md §12.44).
 *
 * ONLY WHERE THE LAND ITSELF NAMES THE KUNDMACHUNG — Oberösterreich's
 * Gesetze, from the Landtag's record. A Kundmachung the monitor found by
 * title (`matchLgbl`) is wrong about two times in a hundred, and held
 * against the wrong law a comparison would report a whole draft as
 * rewritten: the one error this layer must not make.
 */
import type { LandCode, LandDraftDetail, LandLawDiffResponse } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { DERIVED_CACHE } from '../cache/base'
import { summarizeDiff } from '../diff/lawDiff'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../upstream/fetch'
import { diffLandDraft, landDraftUnits, lgblUnits, packageChanges } from './landLawDiff'
import { lgblXmlUrl } from './lgblIndex'
import { draftsSharingKundmachung } from './sources'
import { landDraftPath } from '#shared/utils/laender'

const POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024

const unavailable = (reason: string, rest: Partial<LandLawDiffResponse> = {}): LandLawDiffResponse => ({
  available: false,
  unavailableReason: reason,
  units: [],
  stats: { total: 0, unchanged: 0, changed: 0, editorial: 0, inserted: 0, removed: 0 },
  draft: null,
  kundmachung: null,
  addedLaws: [],
  droppedLaws: [],
  sharedWith: [],
  ...rest,
})

/** The document a Land calls its draft: „Begutachtungsentwurf", else the first. */
function draftDocument(detail: LandDraftDetail): { label: string; url: string } | null {
  const docs = detail.draft.documents
  const doc = docs.find((d) => /Begutachtungsentwurf|Entwurf/i.test(d.title)) ?? docs[0]
  const url = doc ? safeExternalUrl(doc.url) : null
  return doc && url ? { label: doc.title, url } : null
}

async function pdfPages(url: string): Promise<string[]> {
  const { bytes } = await upstreamBytes(url, { ...POLICY, maxBytes: PDF_MAX_BYTES })
  const { extractText, getDocumentProxy } = await import('unpdf')
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
  return Array.isArray(text) ? text : [text]
}

export async function compareLandDraft(land: LandCode, detail: LandDraftDetail): Promise<LandLawDiffResponse> {
  const stage = detail.draft.stage
  if (!stage || stage === 'unknown' || stage.station !== 'bgbl' || stage.via === 'suche' || !stage.detail) {
    return unavailable('Verglichen wird nur, wo das Land selbst die Kundmachung nennt.')
  }
  const draft = draftDocument(detail)
  const kundmachung = { label: stage.detail, url: stage.url ?? null }
  if (!draft) return unavailable('Das Land hat zu diesem Entwurf kein Dokument veröffentlicht.', { kundmachung })
  const xmlUrl = await lgblXmlUrl(land, stage.detail)
  if (!xmlUrl) return unavailable('Das Rechtsinformationssystem führt diese Kundmachung nicht als Text.', { draft, kundmachung })

  const [pages, xml] = await Promise.all([pdfPages(draft.url), upstreamText(xmlUrl, POLICY)])
  const from = landDraftUnits(pages)
  // Novellen by instruction, new laws by § (§12.44: all 83 of the oracle);
  // a PDF the reader cannot take apart says so rather than show nothing.
  if (!from?.length) {
    return unavailable('Im PDF des Entwurfs fand der Monitor keinen Gesetzestext, den er Paragraph für Paragraph lesen kann.', { draft, kundmachung })
  }
  const to = lgblUnits(xml)
  if (!to.length) return unavailable('Die Kundmachung ließ sich nicht in Paragraphen gliedern.', { draft, kundmachung })

  const units = diffLandDraft(from, to)
  const { added, dropped } = packageChanges(from, to)
  const shared = await draftsSharingKundmachung(land, stage.detail, detail.draft.id).catch(() => [])
  const s = summarizeDiff(units)
  return {
    available: true,
    unavailableReason: null,
    units,
    stats: { total: s.total, unchanged: s.unchanged, changed: s.changed, editorial: s.editorial, inserted: s.inserted, removed: s.removed },
    draft,
    kundmachung,
    addedLaws: added,
    droppedLaws: dropped,
    sharedWith: shared.map((d) => ({ title: d.title, path: landDraftPath(d.land, d.id), deadline: d.deadline, startedAt: d.startedAt })),
  }
}

/**
 * Held a day, in the derived layer: the two documents do not change, but
 * the reader does, and a stale comparison must not outlive a fix to it.
 */
export const cachedLandComparison = defineCachedFunction(
  (land: LandCode, number: string, detail: LandDraftDetail): Promise<LandLawDiffResponse> => compareLandDraft(land, detail),
  { name: 'land-law-diff', base: DERIVED_CACHE, getKey: (land: LandCode, number: string) => `${land}-${number}`, maxAge: 60 * 60 * 24, swr: false },
)

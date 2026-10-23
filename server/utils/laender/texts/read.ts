/**
 * Reading a Land's texts: a PDF into units and plain text, a
 * Landesgesetzblatt's XML into the same — the one pair of readers every
 * comparison of a Land's draft goes through (`landLawDiffService`).
 */
import type { LandDocument, LandTextDocument } from '#shared/types'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import type { LawUnit } from '../../lawtext/lawUnits'
import { upstreamBytes, upstreamText, type UpstreamPolicy } from '../../upstream/fetch'
import { landDraftUnits, lgblUnits } from '../landLawDiff'

export const TEXT_POLICY: UpstreamPolicy = { timeoutMs: 30_000, retries: 2, upstreamHostsOnly: true }
const PDF_MAX_BYTES = 30 * 1024 * 1024

/** A text read: its units, and the plain text they came from (the promulgation clause is checked on it). */
export interface ReadText {
  units: LawUnit[] | null
  text: string
}

/** One text of a draft: what it is, and how to read it. */
export interface TextSource {
  document: LandTextDocument
  read: () => Promise<ReadText>
}

export async function pdfPages(url: string): Promise<string[]> {
  const { bytes } = await upstreamBytes(url, { ...TEXT_POLICY, maxBytes: PDF_MAX_BYTES })
  const { extractText, getDocumentProxy } = await import('unpdf')
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false })
  return Array.isArray(text) ? text : [text]
}

export async function readPdf(url: string): Promise<ReadText> {
  const pages = await pdfPages(url)
  return { units: landDraftUnits(pages), text: pages.join('\n') }
}

export async function readLgbl(xmlUrl: string | null): Promise<ReadText> {
  if (!xmlUrl) return { units: null, text: '' }
  const xml = await upstreamText(xmlUrl, TEXT_POLICY)
  return { units: lgblUnits(xml), text: xml.replace(/<[^>]+>/g, ' ') }
}

export function pdfSource(label: string, url: string, publisher: string): TextSource {
  return { document: { label, url, publisher }, read: () => readPdf(url) }
}

/** What a document's title says it is NOT: the draft's companions, filed as entries of their own. */
const COMPANION_RE = /gegenüberstellung|\btgü\b|erläuter|vorblatt|anlage|beilage|anhang|stellungnahme|folgenabschätzung|\bplan|lageplan|pläne|karte|planungsgebiet/i

/**
 * The draft's own text among its documents. Salzburg files Erläuterungen,
 * the Textgegenüberstellung and plans as documents of their own; seven of
 * its drafts carry no draft at all, and until 23.10.2026 the first document
 * stood in for it — the comparison then read „Erläuterungen" as law text.
 */
export function draftDocument(documents: readonly LandDocument[]): LandDocument | null {
  return documents.find((d) => /entwurf/i.test(d.title) && !COMPANION_RE.test(d.title)) ??
    documents.find((d) => !COMPANION_RE.test(d.title)) ??
    null
}

export function draftSource(documents: readonly LandDocument[], publisher: string): TextSource | null {
  const doc = draftDocument(documents)
  const url = doc ? safeExternalUrl(doc.url) : null
  return doc && url ? pdfSource(doc.title, url, publisher) : null
}

/**
 * The text of the laws a draft enacts anew (30.10.2026).
 *
 * A Textgegenüberstellung sets a law against its earlier version, so a new
 * law has no part in it — 15 of the 26 laws GP XXVIII's annexes leave out
 * are new ones. The page named such a law and the ministry's Begründung on
 * its §§, and the §§ themselves stood only in the PDF. They are in the
 * draft's own Gesetzestext, which the page reads anyway: the same parse
 * (`getDraftArticles`, RIS first), cut into §§ by `segmentUnits`, whose
 * Artikel key is `DraftArticle.key` by contract.
 *
 * An Artikel enacts when it carries no Promulgationsklausel
 * (`DraftArticle.amends`) — the same test `enactedLaws` of the Erläuterungen
 * answer and `enactedParagraphs` of the Lesefassung run on.
 */
import type { EnactedLawsResponse, TraceLink } from '#shared/types'
import { enactedLawsOf, otherArticlesOf } from './enactedText'
import { risFootnotes, risTables } from './risXml'
import { fetchDocument } from '../upstream/fetchDocument'
import { draftArticlesOfXml, getDraftArticles } from './draftArticlesService'
import { getRisMapForGp } from '../ris/begutCorpus'
import type { RisDocumentUrls } from '../ris/risRecord'

const RIS_LABEL = 'Entwurf im RIS'

function sourceOf(doc: RisDocumentUrls | null | undefined): TraceLink | null {
  const url = doc?.html ?? doc?.xml ?? null
  return url ? { label: RIS_LABEL, url } : null
}

/** For a Ministerialentwurf: the RIS text through the RIS↔ME join. */
export async function getEnactedLaws(gp: string, inr: number): Promise<EnactedLawsResponse> {
  const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
  if (!row?.risDocument?.xml) return { laws: [], footnotes: [], otherArticles: [], source: null }
  const draft = await getDraftArticles(gp, inr, 'ris-xml')
  const xml = await fetchDocument(row.risDocument.xml)
  return {
    laws: enactedLawsOf(draft, risTables(xml)),
    footnotes: risFootnotes(xml),
    otherArticles: otherArticlesOf(draft),
    source: sourceOf(row.risDocument),
  }
}

/** For a Begutachtung without a parliamentary Gegenstand: its own RIS record. */
export async function getRisEnactedLaws(id: string): Promise<EnactedLawsResponse> {
  const detail = await getRisConsultation(id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  const xml = detail.mainDocument.xml
  if (!xml) return { laws: [], footnotes: [], otherArticles: [], source: null }
  const draft = await draftArticlesOfXml(xml)
  const document = await fetchDocument(xml)
  return {
    laws: enactedLawsOf(draft, risTables(document)),
    footnotes: risFootnotes(document),
    otherArticles: otherArticlesOf(draft),
    source: sourceOf(detail.mainDocument),
  }
}

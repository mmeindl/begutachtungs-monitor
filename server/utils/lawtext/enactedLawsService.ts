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
import type { EnactedLaw, EnactedLawsResponse, TraceLink } from '#shared/types'
import { displayId } from '#shared/utils/unitName'
import type { TextBlock } from './lawUnits'
import { segmentUnits } from './lawUnits'
import { draftArticlesOfXml, getDraftArticles, type DraftText } from './draftArticlesService'
import { getRisMapForGp } from '../ris/begutCorpus'
import type { RisDocumentUrls } from '../ris/risRecord'

/** What a § prints below its heading: Absätze, Ziffern, and text the parser did not class. */
const BODY: ReadonlySet<TextBlock['kind']> = new Set(['abs', 'ziff', 'other'])

/** Pure: the draft's parse → its new laws, each with its §§. */
export function enactedLawsOf(draft: DraftText): EnactedLaw[] {
  const enacting = draft.articles.filter((a) => !a.amends && a.key !== null)
  if (enacting.length === 0) return []
  const units = segmentUnits(draft.blocks)
  return enacting
    .map((a) => ({
      law: a.key!,
      paragraphs: units
        .filter((u) => u.article === a.key)
        .map((u) => ({
          // „#dup" marks a second unit of the same number (`segmentUnits`):
          // real text, printed under the number the draft gives it.
          id: displayId(u.id.replace(/#dup$/, '')),
          heading: u.heading,
          lines: u.blocks.filter((b) => BODY.has(b.kind) && b.text.trim()).map((b) => ({ text: b.text, sub: b.kind === 'ziff' })),
        }))
        .filter((p) => p.lines.length > 0),
    }))
    .filter((l) => l.paragraphs.length > 0)
}

const RIS_LABEL = 'Entwurf im RIS'

function sourceOf(doc: RisDocumentUrls | null | undefined): TraceLink | null {
  const url = doc?.html ?? doc?.xml ?? null
  return url ? { label: RIS_LABEL, url } : null
}

/** For a Ministerialentwurf: the RIS text through the RIS↔ME join. */
export async function getEnactedLaws(gp: string, inr: number): Promise<EnactedLawsResponse> {
  const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
  if (!row?.risDocument?.xml) return { laws: [], source: null }
  return { laws: enactedLawsOf(await getDraftArticles(gp, inr, 'ris-xml')), source: sourceOf(row.risDocument) }
}

/** For a Begutachtung without a parliamentary Gegenstand: its own RIS record. */
export async function getRisEnactedLaws(id: string): Promise<EnactedLawsResponse> {
  const detail = await getRisConsultation(id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
  const xml = detail.mainDocument.xml
  if (!xml) return { laws: [], source: null }
  return { laws: enactedLawsOf(await draftArticlesOfXml(xml)), source: sourceOf(detail.mainDocument) }
}

/**
 * Which texts a Land's draft has, and so which comparisons its page shows
 * (23.10.2026) — decided here, once, from the draft's record, so that the
 * page renders what exists and the comparison service reads what is named,
 * with no Land's shape assumed in either.
 *
 *   geltend → entwurf    the Land's Textgegenüberstellung (`landTguService`)
 *   entwurf → rv         what changed after the Begutachtung
 *   rv → ausschuss       what the committee changed — where its report
 *                        carries the text (Oberösterreich)
 *   rv → lgbl            what the Landtag changed — where the report does
 *                        not (Salzburg): the Kundmachung is the Landtag's
 *                        text, with the editing for publication in it
 *   entwurf → lgbl       the whole way
 *
 * A Kundmachung is a text only where it is certain: named by the Land, or
 * decided by text (`kundmachung.ts`, `LandStage.certainBy`).
 */
import type { LandCode, LandDraftDetail, LandTextStation } from '#shared/types'
import { LAND_NAME } from '#shared/utils/laender'
import { safeExternalUrl } from '#shared/utils/safeExternalUrl'
import { lgblXmlUrl } from '../lgblIndex'
import { draftSource, pdfSource, readLgbl, type TextSource } from './read'

/** A draft as its Land records it, before its comparisons are known. */
export type LandDraftRecord = Omit<LandDraftDetail, 'comparisons'>

/** Who publishes a Land's Landtag documents, for the credit line. */
const LANDTAG: Record<LandCode, string> = { ooe: 'Oö. Landtag', sbg: 'Salzburger Landtag', w: 'Wiener Landtag' }

/** Whose committee report carries the law text as the committee passed it. */
const REPORT_HAS_TEXT: Partial<Record<LandCode, true>> = { ooe: true }

/** „Regierungsvorlage, Beilage 980/2024" from Oberösterreich's step; Salzburg's step is already named so. */
function vorlageLabel(label: string): string {
  const ooe = /Beilage\s+\d+\/\d{4}/.exec(label)?.[0]
  return ooe ? `Regierungsvorlage, ${ooe}` : label
}

export function textSources(land: LandCode, detail: LandDraftRecord): Partial<Record<LandTextStation, TextSource>> {
  const out: Partial<Record<LandTextStation, TextSource>> = {}
  const entwurf = draftSource(detail.draft.documents, `Land ${LAND_NAME[land]}`)
  if (entwurf) out.entwurf = entwurf

  const rv = detail.procedure?.find((s) => s.station === 'rv')
  const rvUrl = rv?.url ? safeExternalUrl(rv.url) : null
  if (rv && rvUrl) out.rv = pdfSource(vorlageLabel(rv.label), rvUrl, LANDTAG[land])

  const report = detail.landtag?.report
  const reportUrl = report?.url ? safeExternalUrl(report.url) : null
  if (report && reportUrl && REPORT_HAS_TEXT[land]) out.ausschuss = pdfSource(report.label, reportUrl, LANDTAG[land])

  const stage = detail.draft.stage
  if (stage && stage !== 'unknown' && stage.station === 'bgbl' && stage.detail && (stage.via !== 'suche' || stage.certainBy)) {
    const nr = stage.detail
    out.lgbl = { document: { label: nr, url: stage.url ?? null, publisher: 'RIS (CC BY 4.0)' }, read: async () => readLgbl(await lgblXmlUrl(land, nr)) }
  }
  return out
}

/** The comparisons a draft's page shows, in the page's order. `tgu`: whether the Land's Textgegenüberstellung is there to read. */
export function comparisonsOf(land: LandCode, detail: LandDraftRecord, tgu: boolean): [LandTextStation, LandTextStation][] {
  const t = textSources(land, detail)
  const pairs: [LandTextStation, LandTextStation][] = []
  if (tgu) pairs.push(['geltend', 'entwurf'])
  if (t.entwurf && t.rv) pairs.push(['entwurf', 'rv'])
  if (t.rv && t.ausschuss) pairs.push(['rv', 'ausschuss'])
  if (t.rv && t.lgbl && !t.ausschuss) pairs.push(['rv', 'lgbl'])
  if (t.entwurf && t.lgbl) pairs.push(['entwurf', 'lgbl'])
  return pairs
}

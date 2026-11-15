/**
 * The item a Miterledigung joined, with our page of it (14.11.2026).
 *
 * Parliament's prose names the committee's report — „Miterledigt mit
 * Bericht 565 d.B." —, an Ausschussbericht (type `AUB`) the monitor has no
 * page of. Its record names the item it reports on as „Hauptgegenstand des
 * Berichts" (`reference[].art` „HG"; read on 565 d.B. XXVI, 147 d.B.
 * XXVIII and 2420 d.B. XXVII, each also naming the merged item as
 * „Miterledigter Gegenstand"), and that item may have a page. Where the
 * prose names a followed item directly, it is that item.
 *
 * PURE MODULE — relative imports only; the record reader is passed in, so
 * vitest executes it with fixtures. Every failure answers null: the
 * citation then stands unlinked, which claims nothing.
 */
import type { MergedInto } from '../../../shared/types'
import type { MergedRef } from '../../../shared/utils/miterledigung'
import { itemPath } from '../../../shared/utils/procedureRoot'
import { parliamentPathname } from '../../../shared/utils/safeExternalUrl'
import { absolutizeUrl, stripHtmlToText } from './htmlText'
import { draftOfPreconst, pageKindOf, type VorlageContent } from './vorlageDetailAssembly'

/** An Ausschussbericht's `DOKTYP`. */
export const REPORT_DOKTYP = 'AUB'

type MergedContent = VorlageContent & {
  reference?: { text?: string | null; zitation?: string | null; url?: string | null; art?: string | null }[] | null
}

/** Reads an item's record — `getGegenstand` in production. */
export type ReadRecord = (gp: string, ityp: string, inr: number) => Promise<{ content?: unknown } | null | undefined>

/** The report's „Hauptgegenstand", as Parliament links it; null where none. */
export function mainItemOfReport(reference: MergedContent['reference']): { gp: string; ityp: string; inr: number; citation: string } | null {
  for (const r of reference ?? []) {
    const main = (r?.art ?? '').trim() === 'HG' || /^Hauptgegenstand/.test((r?.text ?? '').trim())
    if (!main) continue
    const m = /^\/gegenstand\/([IVXLC]+)\/([A-Z0-9-]+)\/(\d+)(?:\/|$)/.exec(parliamentPathname(absolutizeUrl(r.url ?? '') ?? '') ?? '')
    if (!m?.[1] || !m[2] || !m[3]) continue
    const inr = Number(m[3])
    return { gp: m[1], ityp: m[2], inr, citation: stripHtmlToText(r.zitation ?? '').trim() || `${inr}/${m[2]}` }
  }
  return null
}

/** Our page of an item, from its record: a Vorlage that names its draft
 *  lives on the draft's page; any other followed item on its own. */
function pageOf(gp: string, ityp: string, inr: number, content: MergedContent): Pick<MergedInto, 'kind' | 'path'> {
  const kind = ityp === 'I' || ityp === 'A' ? pageKindOf(ityp, content.doktyp) : null
  if (!kind) return { kind: null, path: null }
  const draft = kind === 'regierungsvorlage' ? draftOfPreconst(content.preconst) : null
  return { kind, path: draft ? `/entwuerfe/${draft.gp}/${draft.inr}` : itemPath(gp, kind, inr) }
}

/**
 * The item behind a Miterledigung's citation, or null. Two reads at most —
 * the cited item, and for a report the item it is on —, through the leaf
 * cache the pages share.
 */
export async function resolveMergedInto(ref: MergedRef | null, read: ReadRecord): Promise<MergedInto | null> {
  if (!ref) return null
  try {
    const cited = ((await read(ref.gp, ref.ityp, ref.inr))?.content ?? {}) as MergedContent
    if ((cited.doktyp ?? '').trim() === REPORT_DOKTYP) {
      const main = mainItemOfReport(cited.reference)
      if (!main) return null
      const content = ((await read(main.gp, main.ityp, main.inr))?.content ?? {}) as MergedContent
      return { report: ref.citation, citation: main.citation, ...pageOf(main.gp, main.ityp, main.inr, content) }
    }
    const page = pageOf(ref.gp, ref.ityp, ref.inr, cited)
    return page.kind ? { report: null, citation: ref.citation, ...page } : null
  } catch {
    return null
  }
}

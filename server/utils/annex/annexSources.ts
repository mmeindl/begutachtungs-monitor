/**
 * The annex check's RIS sources, built from the readers a caller hands in
 * (audit of 20.11.2026).
 *
 * The request path (`annex/annexGuardService.ts`) hands in the Nitro-cached
 * readers of `kons/konsCache.ts`; the harnesses hand in the same functions
 * uncached (`scripts/lib/productionSources.ts`). Until then every harness
 * built its own sources over `resolveLawByBgbl`, without the clause, without
 * `standingOnDay` and without the bridge over a version gap, so the annex
 * figures, the fault floor and the gate's golden fixtures measured another
 * standing text than the page shows — and turned a failed lookup into „no
 * law" (`.catch(() => null)`), which the page never does.
 *
 * Pure: no Nitro global, no cache, so the four callers share one reading.
 */
import type { AnnexSources } from './verdict'
import { designationKey } from './annexText'
import { bridgeVersionGap, promulgatedBeforeInForce, type KonsVersion } from '../ris/konsLaw'
import { parseKonsParagraph, plainText } from '../lawtext/konsTree'

/** What the sources read through: the law resolution, a law's version history, one § document. */
export interface AnnexReaders {
  resolveLaw: AnnexSources['resolveLaw']
  history: (gesetzesnummer: string) => Promise<KonsVersion[] | null>
  paragraphXml: (nor: string, xmlUrl: string) => Promise<string>
}

export function annexSourcesOf(read: AnnexReaders): AnnexSources {
  return {
    resolveLaw: read.resolveLaw,
    paragraphAcrossGap: async (gesetzesnummer, key, date) => {
      const history = await read.history(gesetzesnummer)
      if (!history) return null
      const versions = history.filter((v) => designationKey(v.ref.label) === key)
      return bridgeVersionGap(versions, date) ?? promulgatedBeforeInForce(versions, date)
    },
    standingText: async (ref) => {
      if (!ref.xmlUrl) return null
      // The fetch is outside the try on purpose. A RIS that will not answer is
      // not a statement about this §, and `verifyAnnex` turns a thrown error
      // into an unavailable section rather than into a cached "ungeprüft"; a
      // document we *did* receive and cannot make sense of is the opposite —
      // a stable property of that document, and null is the right answer for
      // it (`lawtext/konsTree.ts` already returns null for a § held as a table).
      const xml = await read.paragraphXml(ref.nor, ref.xmlUrl)
      try {
        const tree = parseKonsParagraph(xml)
        if (!tree) return null
        // `plainText` opens with the § heading; `context` holds the Abschnitt
        // and Hauptstück lines above it. The headings are offered a second time
        // on their own because the draft check has to be able to discount them:
        // the annex reprints them, the draft's instruction does not.
        return { text: [...tree.context, plainText(tree)].join(' '), heading: [...tree.context, tree.heading ?? ''].join(' ') }
      } catch {
        return null
      }
    },
  }
}

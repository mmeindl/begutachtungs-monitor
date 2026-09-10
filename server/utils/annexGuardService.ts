/**
 * The annex's RIS check in the request path (docs/architecture.md §12.13).
 *
 * Nitro glue around `annexCheck.verifyAnnex`, which holds all of the logic
 * and none of the caching. The two layers are the ones `cacheBase.ts`
 * prescribes: the § documents and the law resolution are shared with the §
 * names (`konsCache.ts`), and the verdict over them is derived, so it lives
 * for a day and dies with a parser change.
 *
 * The reference date is RIS's own `BeginnBegutachtungsfrist` — the day the
 * ministry wrote the annex, and therefore the version of the law its left
 * column claims to quote. Not today's date, and not a value passed in:
 * taking it from the command line once moved a single draft's score from
 * 66,7 % to 88,9 %, which made the measurement an argument about the date.
 *
 * Since 2026-09-10 the check has a second reference, and it comes from the
 * caller too: the draft's own Gesetzestext, against which the *right* column
 * is held (`annexCheck.rightColumnCheck`). Both references are read from the
 * two documents the cache key already names, so the key does not change.
 */
import { verifyAnnex, type AnnexSources, type AnnexVerification } from './annexCheck'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import { parseKonsParagraph, plainText } from './lawStructure'
import type { DraftArticle } from './lawTitles'
import type { ComparisonRow } from './textComparison'

const TTL_S = 60 * 60 * 24

const sources: AnnexSources = {
  resolveLaw: (organ, nummer, date, title) => resolveKonsLaw(organ, nummer, date, title),
  standingText: async (ref) => {
    if (!ref.xmlUrl) return null
    // The fetch is outside the try on purpose. A RIS that will not answer is
    // not a statement about this §, and `verifyAnnex` turns a thrown error
    // into an unavailable section rather than into a cached "ungeprüft"; a
    // document we *did* receive and cannot make sense of is the opposite —
    // a stable property of that document, and null is the right answer for
    // it (`lawStructure.ts` already returns null for a § held as a table).
    const xml = await fetchParagraphXml(ref.nor, ref.xmlUrl)
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

/**
 * The verdicts for one annex.
 *
 * **Nothing here is cached unless it is an answer.** `verifyAnnex` throws
 * whatever RIS threw, and a `defineCachedFunction` stores only what its body
 * returns — so an outage propagates to the caller, the section reports itself
 * unavailable, and the next request tries again. The alternative that shipped
 * (`.catch(() => null)` at the call site) turned a timeout into "keine
 * Prüfung" for 24 hours, which reads on the page exactly like a draft that
 * has no standing law to check against.
 *
 * `rows`, `articles` and `draftText` are outside the key deliberately: all
 * three are derived from the same two documents `gp`/`inr`/`asOf` address,
 * and the verdict map is keyed by the annex's own § designations — if a
 * parser change moved those, a stale map matches no row and every row comes
 * out `unchecked`, which is the safe direction. The derived cache dies with
 * the worker anyway (`cacheBase.ts`).
 */
export const getAnnexVerification = defineCachedFunction(
  async (
    gp: string,
    inr: number,
    asOf: string,
    rows: readonly ComparisonRow[],
    articles: readonly DraftArticle[],
    draftText: string,
  ): Promise<AnnexVerification> => verifyAnnex(rows, { articles, asOf, text: draftText }, sources),
  { name: 'annex-verification', base: DERIVED_CACHE, getKey: (gp: string, inr: number, asOf: string) => `${gp}-${inr}-${asOf}`, maxAge: TTL_S, swr: false },
)

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
    const tree = parseKonsParagraph(await fetchParagraphXml(ref.nor, ref.xmlUrl))
    return tree ? [...tree.context, plainText(tree)].join(' ') : null
  },
}

export const getAnnexVerification = defineCachedFunction(
  async (gp: string, inr: number, asOf: string, rows: readonly ComparisonRow[], articles: readonly DraftArticle[]): Promise<AnnexVerification> =>
    verifyAnnex(rows, articles, asOf, sources),
  { name: 'annex-verification', base: DERIVED_CACHE, getKey: (gp: string, inr: number, asOf: string) => `${gp}-${inr}-${asOf}`, maxAge: TTL_S, swr: false },
)

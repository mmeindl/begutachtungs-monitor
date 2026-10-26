/**
 * „So läse sich das Gesetz nach dem Entwurf" — our own konsolidierte
 * Lesefassung of a Ministerialentwurf (docs/architecture.md §12.12, §12.12a).
 *
 * Nuxt glue around the pure modules: `kons/novao.ts` reads the
 * Novellierungsanordnungen, `ris/konsLaw.ts` and `kons/konsCache.ts` fetch the
 * standing text, `kons/lawApply.ts` applies, `kons/applyGuard.ts` and
 * `kons/tguOracle.ts` judge, `kons/konsGate.ts` decides — and
 * `kons/consolidate.ts` runs all of them, one outcome per § the draft
 * amends. Nothing is computed here; this module decides who the draft is,
 * where its annex comes from, and hands the cached sources in. Since
 * 26.10.2026 the run itself stands outside Nitro, so the corpus Prüfstand
 * measures the function the page runs.
 *
 * WHAT THIS SECTION ADDS OVER THE GEGENÜBERSTELLUNG, and why it nevertheless
 * stands below it. The ressort's Beilage shows what changes — but in excerpts:
 * it prints the Absatz it amends and leaves the rest of the § out. This
 * section shows the **whole §** as it would then read, from the authentic RIS
 * text rather than from the ressort's transcript. That is a gain for the
 * reader, but a small one — the real question („was ändert sich?") is answered
 * by the Beilage, and it answers it for more §§ than this gate ever will. So
 * the Beilage stands above and this below it.
 *
 * THE REFERENCE DATE IS THE FIRST DAY OF THE BEGUTACHTUNGSFRIST, neither
 * today nor the Einlangen: it is the day the ressort wrote its Beilage, and
 * the oracle may judge against that version only
 * (`annex/annexGuardService.ts` keeps the same day).
 *
 * THE BEILAGE IS READ A SECOND TIME HERE, deliberately, but through the same
 * source choice as the section above (`annexSourceFor`): RIS first, Parliament
 * as the fallback. The answer of `getTextComparison` itself is useless as an
 * oracle — it carries the rows whose check failed with their **text emptied**.
 */
import type { ConsolidatedTextResponse } from '#shared/types'
import { consolidate, emptyConsolidated, type KonsSources } from './consolidate'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import { draftArticlesOfXml, getDraftArticles } from '../lawtext/draftArticlesService'
import type { DraftArticle } from '../lawtext/draftArticles'
import { getRisMapForGp } from '../ris/begutCorpus'
import { annexDocumentsOf, annexSourceFor, annexSourceForDraft, type AnnexSource } from '../annex/annexSource'
import { getRisConsultation } from '../ris/risOnly'
import type { DraftIdentity } from '../ris/draftIdentity'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'

/**
 * The page's sources for `consolidate`: the two cached RIS lookups
 * (`kons/konsCache.ts`) and the annex through the section's own source
 * choice. Nothing is caught here — a failure throws through and is not
 * cached (`KonsSources`).
 */
function konsSources(annex: (articles: readonly DraftArticle[]) => Promise<AnnexSource | string>): KonsSources {
  return {
    resolveLaw: (organ, nummer, date, title, clause) => resolveKonsLaw(organ, nummer, date, title, clause),
    paragraphXml: (ref) => fetchParagraphXml(ref.nor, ref.xmlUrl!),
    annexRows: async (articles) => {
      const source = await annex(articles)
      return typeof source === 'string' ? null : source.parsed.rows
    },
  }
}

export const getConsolidatedText = defineCachedFunction(
  async (gp: string, inr: number): Promise<ConsolidatedTextResponse> => {
    const who: DraftIdentity = { gp, inr, risId: null }
    const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
    // The same rule as for the Gegenüberstellung: a weak join is dates and
    // ministry without the title, and the standing text of *another* draft
    // reads exactly as credibly as the right one.
    if (!row?.risId || row.status !== 'matched') return emptyConsolidated(who, 'zuordnung')
    // Without the first day of the consultation period we do not know which
    // version of the law the draft was written against.
    const asOf = row.risBeginn ?? null
    if (!asOf) return emptyConsolidated(who, 'stichtag')
    // The instructions are read from the XML only.
    const xmlUrl = row.risDocument?.xml
    if (!xmlUrl) return emptyConsolidated(who, 'kein-xml')

    const { blocks } = await getDraftArticles(gp, inr, 'ris-xml')
    // The same source as the section above, out of the same function: RIS
    // first, Parliament as the fallback (`annex/textComparisonService.ts`).
    return consolidate(who, blocks, asOf, konsSources((articles) => annexSourceForDraft(gp, inr, annexDocumentsOf(row), articles)))
  },
  { name: 'kons-text', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

/**
 * The same reading for a Begutachtung without a Gegenstand at Parliament
 * (§12.16) — Verordnungsentwürfe above all.
 *
 * A sibling for the same reason as `getRisTextComparison`: what differs is
 * everything ABOVE the reading (no join to doubt, no second copy of the annex
 * to look for), and what they share is the whole engine below it.
 */
export const getRisConsolidatedText = defineCachedFunction(
  async (id: string): Promise<ConsolidatedTextResponse> => {
    const detail = await getRisConsultation(id)
    if (!detail) throw createError({ statusCode: 404, statusMessage: 'Begutachtung nicht gefunden' })
    const who: DraftIdentity = { gp: null, inr: null, risId: id }
    const asOf = detail.startedAt
    const xmlUrl = detail.mainDocument.xml
    if (!asOf) return emptyConsolidated(who, 'stichtag')
    if (!xmlUrl) return emptyConsolidated(who, 'kein-xml')
    const documents = annexDocumentsOf(detail)
    const { blocks } = await draftArticlesOfXml(xmlUrl)
    return consolidate(who, blocks, asOf, konsSources((articles) => annexSourceFor(documents, articles)))
  },
  { name: 'kons-text-ris', base: DERIVED_CACHE, getKey: (id: string) => id, maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

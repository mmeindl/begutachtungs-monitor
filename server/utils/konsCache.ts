/**
 * The two cached RIS Bundesrecht lookups, shared by everything that needs
 * the standing law (docs/architecture.md §5, cache rule 5).
 *
 * `risKons.ts` is deliberately free of Nitro globals so the harnesses can
 * run it directly, which leaves the caching to be done somewhere else. It
 * was being done twice: the § names (`paraTitleService.ts`) and the annex
 * check (`annexGuardService.ts`) both want the same § document of the same
 * law at the same date, and two cached functions over one upstream document
 * means two copies in memory and two chances to key them differently.
 *
 * Both layers are the ones `cache/base.ts` prescribes:
 *
 *  - the § document is a **fetched** payload — a NOR version never changes,
 *    so it is kept for a month, and its *parse* is deliberately not cached:
 *    the structure rules live in `lawStructure.ts` and keep changing, so a
 *    cached tree would hide the next change to them for a month.
 *  - the law resolution is **derived** — `resolveLawByBgbl` walks pages of
 *    RIS results and decides which law a BGBl means, which is our reasoning
 *    and not RIS's answer.
 */
import { getText, resolveLawByBgbl } from './risKons'
import { DERIVED_ANALYSIS_TTL_S, PUBLISHED_DOCUMENT_TTL_S } from './cache/ttl'

/** One § document as RIS sent it, keyed by its NOR — parsed fresh by callers. */
export const fetchParagraphXml = defineCachedFunction(
  (nor: string, xmlUrl: string): Promise<string> => getText(xmlUrl),
  { name: 'kons-para-xml', getKey: (nor: string) => nor, maxAge: PUBLISHED_DOCUMENT_TTL_S, swr: false },
)

/**
 * Which law a Stammnorm means at a date, with its § index.
 *
 * `title` is the Artikel's own law name and matters more than it looks: one
 * BGBl can promulgate several laws, and it is the title that tells the
 * Bankwesengesetz from the Bausparkassengesetz when both came from BGBl. Nr.
 * 532/1993. It is part of the key, because a lookup with a title and one
 * without can legitimately give different answers.
 *
 * **Null is an answer; a failure is not.** `resolveLawByBgbl` returns null
 * when RIS knows no such law or cannot tell two apart, and that is a stable
 * fact worth keeping for a day. It *throws* when RIS is unreachable or
 * ignored the filter, and that has to leave here: an error caught into null
 * was cached like the answer, so one hiccup made a law "unresolvable" for
 * twenty-four hours and every § of it went out labelled as if there were
 * nothing to check against.
 */
export const resolveKonsLaw = defineCachedFunction(
  async (organ: string, nummer: string, date: string, title: string) => resolveLawByBgbl({ organ, nummer }, date, title || undefined),
  {
    name: 'kons-law-by-bgbl',
    base: DERIVED_CACHE,
    getKey: (organ: string, nummer: string, date: string, title: string) => `${organ}|${nummer}|${date}|${title}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

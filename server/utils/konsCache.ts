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
 * Both layers are the ones `cacheBase.ts` prescribes:
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

const TTL_S = 60 * 60 * 24
/** A NOR version document never changes, so it can be kept for a long time. */
const DOCUMENT_TTL_S = 60 * 60 * 24 * 30

/** One § document as RIS sent it, keyed by its NOR — parsed fresh by callers. */
export const fetchParagraphXml = defineCachedFunction(
  (nor: string, xmlUrl: string): Promise<string> => getText(xmlUrl),
  { name: 'kons-para-xml', getKey: (nor: string) => nor, maxAge: DOCUMENT_TTL_S, swr: false },
)

/**
 * Which law a Stammnorm means at a date, with its § index.
 *
 * `title` is the Artikel's own law name and matters more than it looks: one
 * BGBl can promulgate several laws, and it is the title that tells the
 * Bankwesengesetz from the Bausparkassengesetz when both came from BGBl. Nr.
 * 532/1993. It is part of the key, because a lookup with a title and one
 * without can legitimately give different answers.
 */
export const resolveKonsLaw = defineCachedFunction(
  async (organ: string, nummer: string, date: string, title: string) => resolveLawByBgbl({ organ, nummer }, date, title || undefined).catch(() => null),
  {
    name: 'kons-law-by-bgbl',
    base: DERIVED_CACHE,
    getKey: (organ: string, nummer: string, date: string, title: string) => `${organ}|${nummer}|${date}|${title}`,
    maxAge: TTL_S,
    swr: false,
  },
)

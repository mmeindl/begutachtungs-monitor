/**
 * The draft's own Gesetzestext, parsed once per draft and day.
 *
 * The same RIS document was fetched under two cache names and parsed three
 * times on one cold detail page: the Textgegenüberstellung, the konsolidierte
 * Lesefassung and the Erläuterungen each read it for the draft's Artikel, and
 * the Erläuterungen kept a second 30-day copy of the bytes under
 * `entwurfstext-xml` beside the 24-hour `law-html` that already held the same
 * URL. The fetch stays a fetched document, the parse moves here and dies with
 * the worker (`cache/base.ts`, rule 5).
 *
 * **Two sources, cached apart, and not unified.** Three callers read the RIS
 * XML of the draft; `amendedLawsService` reads the Parliament copy first and
 * the RIS XML only where the ME publishes no HTML. Which document a caller
 * reads is its own decision — one of them names the law the draft amends, and
 * the two documents are not guaranteed to segment alike — so the source is
 * part of the key rather than a choice made here.
 */
import { DERIVED_CACHE } from '../cache/base'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { findLawStations } from '../diff/stationDocuments'
import { fetchDocument } from '../upstream/fetchDocument'
import type { TextBlock } from '../lawtext/lawUnits'
import { parseParliamentHtml } from '../lawtext/parliamentHtml'
import { parseRisXml } from '../lawtext/risXml'
import { draftArticles, type DraftArticle } from '../lawtext/draftArticles'
import { getGegenstand } from '../parliament/drafts'
import { getRisMapForGp } from '../ris/begutCorpus'

/** Which text of the draft is read. */
export type DraftTextSource =
  /** The draft as RIS published it. */
  | 'ris-xml'
  /** The Parliament copy of the Ministerialentwurf, with the RIS XML as fallback. */
  | 'parliament-first'

export interface DraftText {
  /** The draft's blocks in printed order, as the parser read them. */
  blocks: TextBlock[]
  /** Its Artikel, each with the law it amends. */
  articles: DraftArticle[]
}

/** The RIS document of this draft, as the RIS↔ME join names it. */
async function risXmlUrl(gp: string, inr: number): Promise<string | null> {
  const row = (await getRisMapForGp(gp)).rows.find((r) => r.inr === inr) ?? null
  return row?.risDocument?.xml ?? null
}

/**
 * Nothing here catches: a draft that publishes no readable text answers with
 * an empty list through the structure (no document, no row, no XML), and both
 * parsers are total. Everything else is an upstream failure and has to leave
 * the cached function — a blip must not be stored as „this draft amends no
 * law" for a day (`amendedLawsService.ts`, `konsCache.ts`).
 */
async function blocksOfDraft(gp: string, inr: number, source: DraftTextSource): Promise<TextBlock[]> {
  if (source === 'parliament-first') {
    const detail = await getGegenstand(gp, 'ME', inr)
    const me = findLawStations(detail.content ?? {}).get('me')
    if (me?.html) return parseParliamentHtml(await fetchDocument(me.html))
  }
  const xml = await risXmlUrl(gp, inr)
  return xml ? parseRisXml(await fetchDocument(xml)) : []
}

/** The parse, shared by every section of one draft page that needs the Artikel. */
export const getDraftArticles = defineCachedFunction(
  async (gp: string, inr: number, source: DraftTextSource): Promise<DraftText> => {
    const blocks = await blocksOfDraft(gp, inr, source)
    return { blocks, articles: draftArticles(blocks) }
  },
  {
    name: 'draft-articles',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number, source: DraftTextSource) => `${gp}-${inr}-${source}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

/**
 * The same parse for a draft without a parliamentary Gegenstand, where there
 * is no (GP, Nummer) to key on — a Begutachtung that RIS carries alone.
 */
export async function draftArticlesOfXml(xmlUrl: string): Promise<DraftText> {
  const blocks = parseRisXml(await fetchDocument(xmlUrl))
  return { blocks, articles: draftArticles(blocks) }
}

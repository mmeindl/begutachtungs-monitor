/**
 * The name of each § a change amends (docs/architecture.md §12.11).
 *
 * "In § 9 Abs. 1 wird die Wortfolge …" is unreadable; "§ 9 Sofortlotterien"
 * is not. That name is the § heading in the standing law, so this is a
 * lookup in RIS Bundesrecht — quoted, exact, never generated. Measured
 * 2026-09-08: quoted headings inside the instructions cover 9 % of changed
 * units, and this covers the rest.
 *
 * Deliberately its **own endpoint**, not a field on the diff. A draft can
 * address dozens of paragraphs across three laws, and a slow or failing
 * lookup must not delay the comparison or take it down with it. The section
 * merges the names in when they arrive.
 *
 * It nevertheless keys off the **diff's own units**, not off a fresh parse of
 * the draft. `LawDiffUnit.id` is the Regierungsvorlage's numbering, and an RV
 * routinely inserts and renumbers instructions — keying by the draft's Ziffer
 * numbers put a real § heading onto the wrong change wherever the two
 * diverged (SNG 8/ME, Z 5, caught on screen 2026-09-09).
 *
 * Two rules, both the same rule: **a wrong name is worse than none.** The law
 * is identified by the Stammnorm of its Promulgationsklausel, not by title
 * matching, and `resolveLawByBgbl` returns nothing when the match is
 * ambiguous. Anything unresolved is simply absent from the map.
 */
import type { ParagraphTitlesResponse } from '#shared/types'
import { fetchLawHtml, findDiffSources, getLawDiff } from './lawDiffService'
import { parseParliamentHtml, parseRisXml, type TextBlock } from './lawText'
import { promulgationByArticle } from './lawTitles'
import { unitKey } from '#shared/utils/diffKey'
import { addressedParagraph } from './lawTitles'
import { parseKonsParagraph } from './lawStructure'
import { getConsultationsForGp, getGegenstand } from './parliament'
import { getRisMapForGp } from './ris'
import { getText, resolveLawByBgbl, type KonsParagraphRef } from './risKons'

const TTL_S = 60 * 60 * 24
/** A NOR version document never changes, so it can be kept for a long time. */
const DOCUMENT_TTL_S = 60 * 60 * 24 * 30
/** Ceiling on lookups per draft, so one monster Sammelgesetz cannot hang a request. */
const MAX_HEADINGS = 120
const CONCURRENCY = 4

/**
 * One paragraph document as RIS sent it. Cached, but not its heading: the
 * heading rules live in `lawStructure.ts` and that is where they keep
 * changing, so a cached *heading* would hide the next change to them for a
 * month (`cacheBase.ts`). The parse costs microseconds; the fetch does not.
 */
const fetchParagraphXml = defineCachedFunction(
  (nor: string, xmlUrl: string): Promise<string> => getText(xmlUrl),
  { name: 'kons-para-xml', getKey: (nor: string) => nor, maxAge: DOCUMENT_TTL_S, swr: false },
)

/** The § heading ("Sofortlotterien"), parsed on every call — see above. */
async function fetchHeading(ref: KonsParagraphRef): Promise<string | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await fetchParagraphXml(ref.nor, ref.xmlUrl))?.heading ?? null
}

const resolveLaw = defineCachedFunction(
  async (organ: string, nummer: string, date: string) => resolveLawByBgbl({ organ, nummer }, date).catch(() => null),
  { name: 'kons-law-by-bgbl', base: DERIVED_CACHE, getKey: (organ: string, nummer: string, date: string) => `${organ}|${nummer}|${date}`, maxAge: TTL_S, swr: false },
)

/**
 * Every document that can carry a Promulgationsklausel, draft first and
 * Regierungsvorlage last so the RV's wording wins on merge.
 */
async function clauseBlocks(gp: string, inr: number, detail: Awaited<ReturnType<typeof getGegenstand>>): Promise<TextBlock[][]> {
  const sources = findDiffSources(detail.content ?? {})
  const out: TextBlock[][] = []
  if (sources.me) out.push(parseParliamentHtml(await fetchLawHtml(sources.me.url)))
  else {
    const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
    const xml = row?.risDocument?.xml
    if (xml) out.push(parseRisXml(await fetchLawHtml(xml)))
  }
  if (sources.rv) out.push(parseParliamentHtml(await fetchLawHtml(sources.rv.url)))
  return out
}

export const getParagraphTitles = defineCachedFunction(
  async (gp: string, inr: number): Promise<ParagraphTitlesResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    // The reference date is the draft's Einlangen — the law as the draft
    // found it, not as it stands today. It lives on the list row, not on the
    // Gegenstand, and the list is cached anyway.
    const listed = (await getConsultationsForGp(gp).catch(() => null))?.items.find((i) => i.inr === inr) ?? null
    const asOf = listed?.arrivedAt || null
    const empty: ParagraphTitlesResponse = { gp, inr, asOf, titles: {} }
    if (!asOf) return empty

    // Clauses come from whichever documents exist; the RV wins where both
    // name an Artikel, because the diff's articles are the RV's.
    const clauses = new Map<string | null, ReturnType<typeof promulgationByArticle> extends Map<infer _K, infer V> ? V : never>()
    for (const blocks of await clauseBlocks(gp, inr, detail)) {
      for (const [article, bgbl] of promulgationByArticle(blocks)) clauses.set(article, bgbl)
    }
    if (clauses.size === 0) return empty

    const diff = await getLawDiff(gp, inr).catch(() => null)
    if (!diff?.available) return empty

    // Which § each change addresses, grouped by the law its Artikel amends.
    const wanted = new Map<string | null, Map<string, string[]>>()
    for (const unit of diff.units) {
      if (!clauses.has(unit.article)) continue
      // `heading` is the instruction line cut to about 100 characters for
      // display, which silently loses the longer instructions — and a closing
      // quotation mark with them, so the parse fails rather than degrades.
      // The unit's own text is the untruncated original.
      const line = unit.rvText ?? unit.meText ?? unit.heading
      if (!line) continue
      const para = addressedParagraph(line)
      if (!para) continue
      const byPara = wanted.get(unit.article) ?? new Map<string, string[]>()
      const keys = byPara.get(para) ?? []
      keys.push(unitKey(unit))
      byPara.set(para, keys)
      wanted.set(unit.article, byPara)
    }

    const titles: Record<string, string> = {}
    let fetched = 0
    for (const [article, byPara] of wanted) {
      const bgbl = clauses.get(article)
      if (!bgbl) continue
      const law = await resolveLaw(bgbl.organ, bgbl.nummer, asOf)
      if (!law) continue
      const jobs = [...byPara].filter(([para]) => law.paragraphs[para] !== undefined)
      const queue = [...jobs]
      const worker = async () => {
        for (;;) {
          const job = queue.shift()
          if (!job || fetched >= MAX_HEADINGS) return
          fetched++
          const [para, keys] = job
          const heading = await fetchHeading(law.paragraphs[para]!).catch(() => null)
          if (!heading) continue
          for (const key of keys) titles[key] = heading
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    }
    return { gp, inr, asOf, titles }
  },
  { name: 'para-titles', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)

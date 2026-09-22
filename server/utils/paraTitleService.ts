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
import type { LawStationId, ParagraphTitlesResponse } from '#shared/types'
import { fetchLawHtml, findLawStations, getLawDiff } from './lawDiffService'
import { parseParliamentHtml, parseRisXml, type TextBlock } from './lawText'
import { addressedParagraphOf, promulgationByArticle } from './lawTitles'
import { unitKey } from '#shared/utils/diffKey'
import { parseKonsParagraph } from './lawStructure'
import { getDraftsForGp, getGegenstand } from './parliament'
import { getRisMapForGp } from './ris'
import { fetchParagraphXml, resolveKonsLaw } from './konsCache'
import type { KonsParagraphRef } from './risKons'

const TTL_S = 60 * 60 * 24
/** Ceiling on lookups per draft, so one monster Sammelgesetz cannot hang a request. */
const MAX_HEADINGS = 120
const CONCURRENCY = 4

/** The § heading ("Sofortlotterien"), parsed on every call — see `konsCache.ts`. */
async function fetchHeading(ref: KonsParagraphRef): Promise<string | null> {
  if (!ref.xmlUrl) return null
  return parseKonsParagraph(await fetchParagraphXml(ref.nor, ref.xmlUrl))?.heading ?? null
}

/**
 * Both documents of the compared pair that can carry a
 * Promulgationsklausel, the EARLIER one first so the later side's wording
 * wins on merge — the same order the diff's articles are canonicalised in
 * (`lawDiff.ts`).
 *
 * The two stations of the pair, not a fixed ME plus RV: for a comparison of
 * two parliamentary versions the draft's clause is the wrong reference, and
 * where the pair renumbers an Artikel the later text is the one whose
 * numbering the units carry.
 */
async function clauseBlocks(
  gp: string,
  inr: number,
  detail: Awaited<ReturnType<typeof getGegenstand>>,
  from: LawStationId,
  to: LawStationId,
): Promise<TextBlock[][]> {
  const stations = findLawStations(detail.content ?? {})
  const out: TextBlock[][] = []
  for (const id of [from, to]) {
    const html = stations.get(id)?.html
    if (html) {
      out.push(parseParliamentHtml(await fetchLawHtml(html)))
      continue
    }
    // Only the draft has a second source; the parliamentary stations are
    // published as HTML throughout the measured periods.
    if (id !== 'me') continue
    const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
    const xml = row?.risDocument?.xml
    if (xml) out.push(parseRisXml(await fetchLawHtml(xml)))
  }
  return out
}

export const getParagraphTitles = defineCachedFunction(
  async (gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<ParagraphTitlesResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    // The reference date is the draft's Einlangen — the law as the draft
    // found it, not as it stands today. It lives on the list row, not on the
    // Gegenstand, and the list is cached anyway.
    const listed = (await getDraftsForGp(gp).catch(() => null))?.items.find((i) => i.inr === inr) ?? null
    const asOf = listed?.arrivedAt || null

    const diff = await getLawDiff(gp, inr, from, to).catch(() => null)
    // Der adressierte Paragraph steht in der Anweisung selbst und hängt an
    // keiner Auflösung. Er geht deshalb auch dann raus, wenn das RIS den Namen
    // schuldig bleibt — die Anzeige stellt ihn dem Namen voran, weil „Z 2" die
    // Nummer der Anordnung ist und nicht die des Paragraphen.
    const paragraphs: Record<string, string> = {}
    for (const unit of diff?.units ?? []) {
      const para = addressedParagraphOf(unit)
      if (para) paragraphs[unitKey(unit)] = para
    }

    const empty: ParagraphTitlesResponse = { asOf, titles: {}, paragraphs }
    if (!asOf || !diff?.available) return empty

    // Clauses come from whichever of the two documents exist; the later
    // station wins where both name an Artikel, because the diff's articles
    // are the later side's.
    const clauses = new Map<string | null, ReturnType<typeof promulgationByArticle> extends Map<infer _K, infer V> ? V : never>()
    for (const blocks of await clauseBlocks(gp, inr, detail, from, to)) {
      for (const [article, bgbl] of promulgationByArticle(blocks)) clauses.set(article, bgbl)
    }
    if (clauses.size === 0) return empty

    // Which § each change addresses, grouped by the law its Artikel amends.
    const wanted = new Map<string | null, Map<string, string[]>>()
    for (const unit of diff.units) {
      if (!clauses.has(unit.article)) continue
      const para = paragraphs[unitKey(unit)]
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
      // The Artikel's own heading, as the disambiguator it was built to be.
      // One Bundesgesetzblatt regularly creates several laws — 532/1993 the
      // Bankwesengesetz *and* the Bausparkassengesetz — and the Stammnorm
      // pair cannot tell them apart, so `resolveLawByBgbl` refuses and every
      // § of that law goes out without a name. The heading that separates
      // them ("Änderung des Bankwesengesetzes") is the key of this very loop
      // and was passed as the empty string; `lawNameScore` strips
      // "Änderung"/"des" as stopwords, so the raw heading is the right input
      // and an Artikel that carries only a number scores 0 and still refuses
      // (measured: 90 of 342 laws in this period's packages failed on exactly
      // this ambiguity, §12.12).
      const law = await resolveKonsLaw(bgbl.organ, bgbl.nummer, asOf, article ?? '')
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
    return { asOf, titles, paragraphs }
  },
  {
    name: 'para-titles',
    base: DERIVED_CACHE,
    // Per pair: a Ziffer renumbered between two stations addresses a
    // different § there, and a § name carried over from another pair would
    // be exactly the wrong name this module refuses to produce.
    getKey: (gp: string, inr: number, from: LawStationId, to: LawStationId) => `${gp}-${inr}-${from}-${to}`,
    maxAge: TTL_S,
    swr: false,
  },
)

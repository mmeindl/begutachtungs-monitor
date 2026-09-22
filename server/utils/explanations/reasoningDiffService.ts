/**
 * „Hat sich die Begründung geändert?" — the ressort's Erläuterungen from the
 * draft to the Regierungsvorlage, Paragraph by Paragraph
 * (docs/architecture.md §12.10b).
 *
 * Nuxt glue around `explanations/explanationsHtml.ts`. Measured before this
 * existed: over 64 evaluable pairs of GP XXVIII, 1.515 Paragraphen stand on
 * both sides, and for **728 of them (48 %)** the Begründung is a different
 * one. The comparison so far shows how the law text changes; this is the
 * second half of the same question — what the ressort says about it, and
 * whether it says that differently after the Begutachtung than before.
 *
 * BOTH SIDES FROM PARLIAMENT, with the same parser. The draft's Erläuterungen
 * would also be in RIS as typed XML, the Regierungsvorlage's would not. A
 * comparison of XML against Word HTML measures the converters first (§12.12,
 * sixth measurement), so `parseParliamentHtml` reads both.
 *
 * KEYED BY `unitKey` like the § names (`diff/paraTitleService.ts`), for the
 * same reason: the comparison's units carry the Regierungsvorlage's
 * numbering, and a second, home-made key would be the second chance to hang a
 * Begründung on the wrong change.
 *
 * The rule itself — one comparison per Paragraph, ambiguous numbers stay out
 * — lives in `explanations/reasoningDiff.ts` and is tested there.
 *
 * DRAFT → REGIERUNGSVORLAGE ONLY. The later stations have reports of their
 * own, not continued Erläuterungen; for those this service returns nothing
 * rather than comparing something similar.
 */
import type { LawStationId, ReasoningDiffResponse, TraceLink } from '#shared/types'
import { parseExplanationsHtml, passagesByParagraph, type HtmlPassage } from './explanationsHtml'
import { getLawDiff } from '../diff/lawDiffService'
import { fetchDocument } from '../upstream/fetchDocument'
import { findLastRvLink, mapDocuments, parseStages } from '../parliament/detailJson'
import { getGegenstand } from '../parliament/drafts'
import { compareReasoning } from './reasoningDiff'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'

/** One Gegenstand's Erläuterungen document, as HTML — or nothing. */
async function explanationsDocument(gp: string, ityp: string, inr: number): Promise<TraceLink | null> {
  const detail = await getGegenstand(gp, ityp, inr)
  const group = mapDocuments(detail.content?.documents).find((d) => /^Erläuterungen$/i.test(d.title.trim()))
  const url = group?.formats.find((f) => f.type === 'html')?.url
  return url ? { label: `Erläuterungen (${ityp === 'ME' ? 'Entwurf' : 'Regierungsvorlage'})`, url } : null
}

/** A document's passages as text per Paragraph number. */
function passageTexts(byParagraph: Map<string, HtmlPassage[]>): Map<string, string> {
  return new Map([...byParagraph].map(([id, passages]) => [id, passages.flatMap((p) => p.text).join(' ')]))
}

/** The answer without a comparison, with the sentence that says why — or without one. */
function empty(gp: string, inr: number, reason: string | null, sources: TraceLink[] = []): ReasoningDiffResponse {
  return {
    gp,
    inr,
    available: false,
    unavailableReason: reason,
    sources,
    units: {},
    paragraphs: {},
    stats: { compared: 0, changed: 0 },
  }
}

/**
 * Draft → Regierungsvorlage only, and the test stands BEFORE the cached
 * function: every other pairing gets the same empty answer, and a cache
 * behind it would create an entry for each of them that can never hold
 * anything else. No sentence for the reader — the page does not ask for those
 * pairings at all (see the file header).
 */
export function getReasoningDiff(gp: string, inr: number, from: LawStationId, to: LawStationId): Promise<ReasoningDiffResponse> {
  if (from !== 'me' || to !== 'rv') return Promise.resolve(empty(gp, inr, null))
  return compareMeToRv(gp, inr)
}

const compareMeToRv = defineCachedFunction(
  async (gp: string, inr: number): Promise<ReasoningDiffResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const rv = findLastRvLink(parseStages(detail.content?.stages))
    if (!rv) return empty(gp, inr, 'Zu diesem Entwurf gibt es noch keine Regierungsvorlage.')

    const [meDoc, rvDoc] = await Promise.all([
      explanationsDocument(gp, 'ME', inr),
      explanationsDocument(rv.gp, 'I', rv.inr),
    ])
    if (!meDoc || !rvDoc) {
      return empty(
        gp,
        inr,
        meDoc
          ? 'Die Regierungsvorlage veröffentlicht ihre Erläuterungen nicht als HTML; verglichen haben wir sie deshalb nicht.'
          : 'Der Entwurf veröffentlicht seine Erläuterungen nicht als HTML; verglichen haben wir sie deshalb nicht.',
        [meDoc, rvDoc].filter((d): d is TraceLink => d !== null),
      )
    }

    const [meHtml, rvHtml] = await Promise.all([fetchDocument(meDoc.url), fetchDocument(rvDoc.url)])
    const before = passageTexts(passagesByParagraph(parseExplanationsHtml(meHtml)))
    const after = passageTexts(passagesByParagraph(parseExplanationsHtml(rvHtml)))
    const sources = [meDoc, rvDoc]
    if (before.size === 0 && after.size === 0) {
      return empty(gp, inr, 'Die Erläuterungen dieses Entwurfs sind nicht nach Paragraphen gegliedert; ein Vergleich am Paragraphen ginge daneben.', sources)
    }

    const diff = await getLawDiff(gp, inr, 'me', 'rv')
    if (!diff.available) return empty(gp, inr, null, sources)

    const { units, paragraphs, stats } = compareReasoning(diff.units, before, after)
    return {
      gp,
      inr,
      available: stats.compared > 0,
      unavailableReason: stats.compared > 0 ? null : 'Zu den geänderten Bestimmungen führen beide Dokumente keine gemeinsame Begründung.',
      sources,
      units,
      paragraphs,
      stats,
    }
  },
  {
    name: 'reasoning-diff',
    base: DERIVED_CACHE,
    getKey: (gp: string, inr: number) => `${gp}-${inr}`,
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

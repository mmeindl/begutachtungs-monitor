/**
 * „Hat sich die Begründung geändert?" — the ressort's Erläuterungen from the
 * draft to the Regierungsvorlage, at each change of the § comparison
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
 * The rule itself — an instruction gets the passage of its Ziffer, a § or a
 * document titled by § the passages of the Paragraph, one comparison per
 * passage, ambiguous numbers stay out — lives in
 * `explanations/reasoningDiff.ts` and is tested there.
 *
 * DRAFT → REGIERUNGSVORLAGE ONLY. The later stations have reports of their
 * own, not continued Erläuterungen; for those this service returns nothing
 * rather than comparing something similar.
 */
import type { LawStationId, ReasoningDiffResponse, TraceLink } from '#shared/types'
import { parseExplanationsHtml, type HtmlExplanations } from './explanationsHtml'
import { getLawDiff } from '../diff/lawDiffService'
import { fetchDocument } from '../upstream/fetchDocument'
import { findComparisonRvLink, mapDocuments, parseStages } from '../parliament/detailJson'
import { findLawStations } from '../diff/stationDocuments'
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

/** The answer without a comparison, with the sentence that says why — or without one. */
function empty(gp: string, inr: number, reason: string | null, sources: TraceLink[] = []): ReasoningDiffResponse {
  return {
    gp,
    inr,
    available: false,
    unavailableReason: reason,
    sources,
    units: {},
    entries: {},
    stats: { compared: 0, changed: 0, uncompared: 0 },
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
    // The Vorlage whose Gesetzestext the § comparison beside it reads.
    const rvText = findLawStations(detail.content ?? {}).get('rv')
    const rv = findComparisonRvLink(parseStages(detail.content?.stages), rvText?.html ?? rvText?.fallbackUrl)
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
    const meParsed = parseExplanationsHtml(meHtml)
    const rvParsed = parseExplanationsHtml(rvHtml)
    const sources = [meDoc, rvDoc]
    // Addressed means by § or by Ziffer: „Zu Z 1 bis 3:" names no § and is
    // still the passage of three instructions.
    const addressed = (doc: HtmlExplanations) => doc.special.some((p) => p.paragraphs.length > 0 || p.ziffern.length > 0)
    if (!addressed(meParsed) && !addressed(rvParsed)) {
      return empty(gp, inr, 'Die Erläuterungen dieses Entwurfs sind weder nach Ziffern noch nach Paragraphen gegliedert; ein Vergleich an der Änderung ginge daneben.', sources)
    }

    const diff = await getLawDiff(gp, inr, 'me', 'rv')
    if (!diff.available) return empty(gp, inr, null, sources)

    const { units, entries, stats } = compareReasoning(diff.units, meParsed, rvParsed)
    // Shown is shown: an uncompared passage is Begründung on the page too.
    const shown = stats.compared + stats.uncompared > 0
    return {
      gp,
      inr,
      available: shown,
      unavailableReason: shown ? null : 'Zu den geänderten Bestimmungen führen beide Dokumente keine gemeinsame Begründung.',
      sources,
      units,
      entries,
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

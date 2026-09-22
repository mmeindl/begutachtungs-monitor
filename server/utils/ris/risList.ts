/**
 * The filter of `/api/ris-drafts` — the half of the list RIS publishes and
 * Parliament does not know (docs/architecture.md §12.16).
 *
 * Pure, so it is under test: which rows a station chip shows is a statement
 * about the Verfahren, not a layout question.
 */
// PURE MODULE — only relative imports (`risRecord.ts`), so vitest can
// execute the rule without Nuxt's aliases.
import type {
  BgblOutcome,
  DraftStation,
  DraftStatus,
  RisConsultation,
  RisConsultationKind,
} from '../../../shared/types'
import { matchesQuery } from '../../../shared/utils/textMatch'
import { stripMinistryMentions, type MinistryToken } from '../search/searchHaystack'

/**
 * Which half of the station axis this request means.
 *
 * This half stands at the Begutachtung and never moves on: no Gegenstand at
 * Parliament, so never a Regierungsvorlage (§12.16).
 *
 * Decision: under `begutachtung` they belong, because that is where they
 * stand; out of `rv` and `parlament` they stay, because they cannot reach
 * those — that is not a selection, it is the Verfahren. Whoever wants one
 * kind only has the Art filter next to it, and the count line names both
 * halves separately.
 *
 * Rejected after one afternoon: dropping them from the station axis
 * ALTOGETHER, because the chip „Begutachtung" otherwise shows 245 rows, 198
 * of them Verordnungsentwürfe. The number is the corpus, not a fault, and
 * the price was high — „Begutachtung + Stellungnahme möglich" showed 4 rows
 * instead of 7, three running Verordnungs-Begutachtungen disappeared, and
 * the start page's link („Alle 7 offenen Entwürfe") led to a list of 4
 * (docs/architecture.md §12.26).
 *
 * SINCE 19.09.2026 THAT NO LONGER HOLDS FOR `bgbl`. "They cannot reach the
 * later stations" was true only as long as nobody read the
 * Bundesgesetzblatt: a Verordnung does not pass through Parliament, but it
 * is very much promulgated — in Teil II (§12.32). Whoever filters for the
 * station „Bundesgesetzblatt" means both halves, and the half that was
 * silently missing there is the larger one.
 */
export function risStationWants(stations: readonly DraftStation[]): { begutachtung: boolean; bgbl: boolean } {
  return {
    begutachtung: !stations.length || stations.includes('begutachtung'),
    bgbl: stations.includes('bgbl'),
  }
}

export interface RisListFilter {
  wants: { begutachtung: boolean; bgbl: boolean }
  status: DraftStatus
  art: RisConsultationKind | undefined
  ministry: string | undefined
  /** Already lowercased. */
  q: string | undefined
  /** The period's Ressort vocabulary, as a strike list for the long title. */
  ministryTokens: readonly MinistryToken[]
  /** Empty where the outcome did not arrive in time — `bgbl` then filters nothing. */
  outcomes: Record<string, BgblOutcome>
}

export function filterRisConsultations<T extends RisConsultation>(
  items: readonly T[],
  filter: RisListFilter,
): T[] {
  const { wants, status, art, ministry, q, outcomes } = filter
  return items.filter((item) => {
    if (!wants.begutachtung && !(wants.bgbl && outcomes[item.id]?.state === 'kundgemacht')) return false
    if (status === 'open' && !item.active) return false
    if (status === 'closed' && item.active) return false
    if (art && item.kind !== art) return false
    if (ministry && item.ministryCode.toUpperCase() !== ministry) return false
    if (q) {
      // No aliases here: the alias file is keyed by gp/inr and these records
      // have neither. The long title is in the haystack instead — on a
      // Verordnung it is where the subject matter actually appears.
      //
      // WITHOUT THE RESSORT MENTION, since 21.09.2026
      // (docs/architecture.md §12.31). The rule behind it is **what is
      // searched is what the row shows**: a Verordnung's long title begins
      // with „Verordnung des Bundesministers für <the whole portfolio>", the
      // Ressort name carries the same thing once more, and neither stands
      // anywhere on the page. „klima" matched 36 rows that way, 2 of which
      // carried the word in the short title.
      //
      // The SHORT TITLE is therefore NOT struck, even where it carries the
      // same clause („Verordnung der Bundesministerin für Landesverteidigung
      // über den Krankentransport") — it stands in the row, the reader sees
      // the word, so they must be able to search for it. The code stays for
      // the same reason; for the Ressort as such there is its own filter.
      // Several words joined by AND, the same rule as in `/api/drafts`.
      const haystack = `${item.title} ${stripMinistryMentions(item.longTitle ?? '', filter.ministryTokens)} ${item.ministryCode}`
      if (!matchesQuery(haystack, q)) return false
    }
    return true
  })
}

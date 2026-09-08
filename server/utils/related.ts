/**
 * Related drafts by title (docs/architecture.md §12.10): the earlier or
 * later Ministerialentwurf whose title names the same laws.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The rule is exact equality of the normalised title token set (the RIS
 * join's tokenizer: stop words out, "…gesetzes" stemmed, years kept). It is
 * deliberately not fuzzy: on the 57 GP XXVII drafts without a
 * Regierungsvorlage, exact equality found the real re-submissions after
 * the change of government (310/ME → 32/ME XXVIII, the ElWG; 173/ME → 3/ME
 * XXVIII) and the re-run Begutachtungen inside a GP (41/ME → 55/ME), while
 * every fuzzy threshold that would have added "Dienstrechts-Novelle 2022 →
 * 2. Dienstrechts-Novelle 2022" also added "Bauarbeiter-…" pairs that are
 * different laws. No ministry condition either: portfolios move between
 * GPs (energy went from BMK to BMWET in 2025), and the claim the UI makes
 * — "gleichlautend" — is true regardless of who filed.
 *
 * Because "Tierschutzgesetz, Änderung" recurs every few years, the result
 * is a same-title draft, not "the same text"; the copy says exactly that.
 */
import type { ConsultationSummary, RelatedDraft } from '../../shared/types'
import { splitParliamentTitle, titleTokens } from './risJoin'

/** Sorted unique title tokens joined by a space; '' when nothing survives normalisation ("Bundesgesetz, Änderung"). */
export function titleKey(title: string | null | undefined): string {
  return [...new Set(titleTokens(splitParliamentTitle(title ?? '').core))].sort().join(' ')
}

export interface RelatedDrafts {
  /** Nearest earlier same-title draft, by arrival */
  predecessor: RelatedDraft | null
  /** Nearest later same-title draft, by arrival */
  successor: RelatedDraft | null
}

function toRelated(c: ConsultationSummary): RelatedDraft {
  return {
    gp: c.gp,
    inr: c.inr,
    citation: c.citation,
    title: c.title,
    arrivedAt: c.arrivedAt,
    deadline: c.deadline,
    hasRv: null,
  }
}

/** Arrival first; ties (dual-ministry duplicate rows, same-day filings) by GP number then INR. */
function order(a: ConsultationSummary, b: ConsultationSummary): number {
  return a.arrivedAt.localeCompare(b.arrivedAt) || a.gp.localeCompare(b.gp) || a.inr - b.inr
}

/**
 * Same-title drafts among `candidates` (any GPs; the caller decides how
 * far to look). The draft itself and its dual-ministry duplicate rows
 * (same GP + INR) are never their own relatives.
 */
export function findRelatedDrafts(
  me: Pick<ConsultationSummary, 'gp' | 'inr' | 'title' | 'arrivedAt'>,
  candidates: readonly ConsultationSummary[],
): RelatedDrafts {
  const key = titleKey(me.title)
  if (!key) return { predecessor: null, successor: null }
  const same = candidates
    .filter((c) => !(c.gp === me.gp && c.inr === me.inr) && titleKey(c.title) === key)
    .sort(order)
  const earlier = same.filter((c) => c.arrivedAt < me.arrivedAt || (c.arrivedAt === me.arrivedAt && c.inr < me.inr && c.gp === me.gp))
  const later = same.filter((c) => !earlier.includes(c))
  return {
    predecessor: earlier.length ? toRelated(earlier.at(-1)!) : null,
    successor: later.length ? toRelated(later[0]!) : null,
  }
}

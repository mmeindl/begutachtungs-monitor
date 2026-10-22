/**
 * The breakdown the statements panel renders — who filed, in the three
 * kinds the classifier knows.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute the module directly. It was inside `statements.ts` until
 * 23.09.2026, which is a Nitro file (`defineCachedFunction`, `createError`)
 * and therefore not importable by a test at all: the one rule here that the
 * page depends on — that the three numbers PARTITION the total (with
 * `unlisted` beside them above the cap, since 22.10.2026) — was asserted by
 * nothing.
 */
import type { StatementMeta, StatementsSummary } from '../../../shared/types'
import { groupOrganisationStatements } from './organisations'

/**
 * Headroom, not curation: the detail page ships EVERY organisation, so that an
 * organisation can find itself on the page — the point of the feedback layer —
 * and so the names sit in the SSR HTML for find-in-page and crawlers.
 *
 * Org populations don't scale with Stellungnahmen (88/ME: 707 statements, 23
 * organisations — the mass is private persons), but they do vary: measured in
 * GP XXVIII, 32/ME carries 100, 62/ME 43, 8/ME 35. The cap is a guard against
 * a pathological Verfahren, not a display limit, hence set above all of those.
 * 150 rows ≈ 20 KB worst case on one page, and the summary has exactly one
 * consumer (the detail page), so this multiplies with nothing. When it does
 * bind, `organisations` is still the true statement count — the UI says how
 * many it dropped instead of silently showing a subset.
 *
 * Counts GROUPED organisations (one row = one organisation, however often it
 * filed), which is what the page renders — so the cap binds even later than
 * the measured populations suggest.
 */
export const ORG_LIST_CAP = 150

/**
 * `unlisted`: Stellungnahmen upstream counts and nobody read — the rest of a
 * list above `STATEMENTS_CAP`, whose `items` are the institutions alone
 * (since 22.10.2026, `parliament/statements.ts`). They count towards `total`
 * and towards none of the three kinds, so the partition becomes: the kinds
 * plus `unlisted` add up to `total`. `total` stays the number of
 * Stellungnahmen the summary is about, because on the draft page it is THE
 * number — the bar's Begutachtung row and the share preview print it
 * (`DraftDetail.statements`), and 164/ME has 106,183, not the 117 that were
 * read.
 */
export function buildStatementsSummary(items: StatementMeta[], unlisted = 0): StatementsSummary {
  const organisations: StatementMeta[] = []
  let privatePersons = 0
  let nonPublic = 0
  for (const s of items) {
    if (s.submitterKind === 'organisation') organisations.push(s)
    else if (s.submitterKind === 'person') privatePersons++
    else nonPublic++
  }
  return {
    total: items.length + unlisted,
    /* Statements, not distinct organisations: this number is one part of the
     * partition of `total` that the panel renders as a legend and a mix bar,
     * and it has to keep adding up. The entry count of organisationList is
     * the distinct-organisation number, and the panel says so where it
     * differs. */
    organisations: organisations.length,
    privatePersons,
    nonPublic,
    /* Only where it is not zero: a summary of a whole list looks exactly as
     * it did before the cap existed. */
    ...(unlisted > 0 ? { unlisted } : {}),
    organisationList: groupOrganisationStatements(organisations).slice(0, ORG_LIST_CAP),
  }
}

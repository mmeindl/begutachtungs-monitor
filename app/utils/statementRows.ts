/**
 * What `StatementsPanel` prints about the Stellungnahmen: the order of its
 * rows, the grouping of an organisation that filed more than once — and the
 * GDPR guard on what a row is allowed to say at all.
 *
 * Pure module with tests, and the guard is the reason. It used to sit in the
 * component, where nothing could reach it: a rule that decides whether a
 * private person's name appears on a public page has to be executable by a
 * test, not only by a browser. The rule itself is unchanged and is not to be
 * simplified (CLAUDE.md, GDPR; refactor-plan.md §9).
 */
import type { StatementMeta, StatementsSummary } from '../../shared/types'
import { countLabelDe } from '../../shared/utils/format'

/**
 * Two orders, answering different questions — "who mobilized" and "what came
 * in last". ISO dates sort lexicographically, and a missing date ends up
 * last, where it belongs: it carries no position in a chronology.
 */
export type StatementSort = 'endorsements' | 'date'

interface SortableRow {
  endorsements: number
  date: string | null
}

/** Both keys are always applied; the control only decides which one leads. */
export function compareStatementRows(a: SortableRow, b: SortableRow, sort: StatementSort): number {
  const byEndorsements = b.endorsements - a.endorsements
  const byDate = (b.date ?? '').localeCompare(a.date ?? '')
  return sort === 'endorsements' ? byEndorsements || byDate : byDate || byEndorsements
}

/* GDPR defense in depth: persons and non-public submissions always render a
 * fixed label — never a name — regardless of what the API delivered. */
export function submitterLabel(s: StatementMeta): string {
  if (s.submitterKind === 'organisation') return s.submitterName ?? 'Organisation'
  if (s.submitterKind === 'nonpublic') return 'Nicht-öffentliche Stellungnahme'
  return 'Privatperson'
}

/* Same guard for the link's accessible name: only an organisation is named. */
export function submitterName(s: StatementMeta): string | null {
  return s.submitterKind === 'organisation' ? s.submitterName : null
}

type OrgEntry = StatementsSummary['organisationList'][number]

/* A grouped entry sorts by its LATEST submission, and prints that same date
 * when its statements span more than one day — so a row always sits where
 * its printed date says it does. */
export function orgSortDate(org: OrgEntry): string | null {
  return org.statements.reduce<string | null>(
    (latest, s) => ((s.date ?? '') > (latest ?? '') ? s.date : latest),
    null,
  )
}

/* The day the organisation filed when that is one day, the latest otherwise
 * (the sub-list carries the exact ones then). "–" stays what it has to mean:
 * upstream ships no date for this submission. */
export function orgRowDate(org: OrgEntry): string | null {
  const dates = org.statements.map((s) => s.date)
  return new Set(dates).size === 1 ? (dates[0] ?? null) : orgSortDate(org)
}

export interface OrgRow {
  org: OrgEntry
  /** Several Stellungnahmen under one name, so the row opens into them. */
  expanded: boolean
  row: {
    date: string | null
    label: string
    links: { citation: string; href: string }[] | null
    detail: string | null
    submitter: string
  }
}

/**
 * One row per organisation, in the panel's order.
 *
 * The name breaks remaining ties, which is most of them: without endorsements
 * and on a shared date, a name you can scan for is the only useful order.
 * (Spread first: this must never sort the summary it was handed.)
 *
 * One organisation, several Stellungnahmen: the entry is grouped server-side,
 * so a row can stand for more than one submission — and then it always opens
 * into the sub-list. Because the number that matters is counted PER
 * STELLUNGNAHME: a Zustimmung means someone read that text and signed it. A
 * row that folds three documents into one line can only show their sum, which
 * is an index number and describes nothing anyone endorsed. So the parts get
 * their own rows, and the sum stays on the group row wearing the word
 * „gesamt".
 */
export function orgRowsOf(summary: StatementsSummary, sort: StatementSort): OrgRow[] {
  const sorted = [...summary.organisationList].sort(
    (a, b) =>
      compareStatementRows(
        { endorsements: a.endorsements, date: orgSortDate(a) },
        { endorsements: b.endorsements, date: orgSortDate(b) },
        sort,
      ) || a.name.localeCompare(b.name, 'de'),
  )
  return sorted.map((org) => {
    const expanded = org.statements.length > 1
    return {
      /* The sub-rows obey the control the reader set, like every other row
       * in the panel: under „Neueste" a group whose parent prints its LATEST
       * date must not open with its oldest submission, and under „Meiste
       * Zustimmungen" it would be the one list ignoring the key everything
       * else is ranked by. The comparator applies both keys, so the sequence
       * a multi-day group is there to show survives either way — reversed
       * under „Neueste", which is the direction the reader asked for.
       * (Copy, never a sort in place: the summary is a prop.) */
      org: { ...org, statements: [...org.statements].sort((a, b) => compareStatementRows(a, b, sort)) },
      expanded,
      row: {
        date: orgRowDate(org),
        label: org.name,
        links: expanded
          ? null
          : org.statements.map((s) => ({ citation: s.citation, href: s.parliamentUrl })),
        detail: expanded ? countLabelDe(org.statements.length, 'Stellungnahme', 'Stellungnahmen') : null,
        submitter: org.name,
      },
    }
  })
}

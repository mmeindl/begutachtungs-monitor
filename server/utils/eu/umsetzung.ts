/**
 * THE LIST „Richtlinien, die umzusetzen sind" and the page of a directive
 * no draft names yet — joined from three sources that stay three (step 7
 * of the EU cycle): the Cellar's directives of the window, the country's
 * notifications to the Commission, and the monitor's own map of drafts.
 *
 * PURE MODULE — relative imports only.
 *
 * TWO OBSERVATIONS, NEVER A VERDICT (rule D6). A row carries the drafts
 * the monitor found and the number of measures the country notified. Each
 * can be unknown (no map built; the Cellar silent), and unknown is null,
 * never 0. Nothing here says „umgesetzt", „offen" or „überfällig", counts
 * the rows without a measure, or orders by them: the list is in the order
 * of the deadlines, as the Cellar reader returns it.
 */
import type { EuActHead, EuActSummary, EuDirectiveToTranspose, EuUmsetzungRow } from '../../../shared/types/eu'
import { euActPath } from '../../../shared/utils/eu'
import { parseEuActCitations } from './actCitations'
import type { TranspositionDates } from './cellar'
import { deadlineOf } from './cellar'

const DIRECTIVE_RE = /^3(\d{4})L(\d{4})$/

/** The directive in EUR-Lex, German, by its ELI — the address the map's acts carry. */
function eurLexOf(celex: string): string {
  const m = DIRECTIVE_RE.exec(celex)!
  return `https://eur-lex.europa.eu/eli/dir/${m[1]}/${Number(m[2])}/oj/deu`
}

/**
 * „Richtlinie (EU) 2024/1069", read from the official title as the drafts'
 * citations are (`parseEuActCitations`), so a directive is named the same
 * in this list and on the map. Where the title is missing or names another
 * act first, the form since 2015 from the CELEX; before 2015 the number's
 * suffix („/EG", „/EU") is not in the CELEX, so the CELEX itself stands.
 */
export function directiveLabel(celex: string, title: string | null): string {
  const cited = title ? parseEuActCitations(title.slice(0, 120)).find((a) => a.celex === celex) : undefined
  if (cited) return cited.label
  const m = DIRECTIVE_RE.exec(celex)
  if (m && Number(m[1]) >= 2015) return `Richtlinie (EU) ${m[1]}/${Number(m[2])}`
  return `Richtlinie ${celex}`
}

/**
 * The rows of the list. `counts` null: the country's notifications could
 * not be read. `summaries` null: no map of drafts is built. A directive
 * the map does not hold has no draft in the monitor's window — 0, a
 * statement about the monitor's own reading, not about the country.
 */
export function umsetzungRows(
  directives: readonly EuDirectiveToTranspose[],
  counts: ReadonlyMap<string, number> | null,
  summaries: readonly EuActSummary[] | null,
): EuUmsetzungRow[] {
  const drafts = summaries ? new Map(summaries.map((s) => [s.celex, s.counts])) : null
  return directives.flatMap((d) => {
    const path = euActPath(d.celex)
    if (!path) return []
    return [{
      ...d,
      label: directiveLabel(d.celex, d.title),
      path,
      drafts: drafts ? { ...(drafts.get(d.celex) ?? { bund: 0, laender: 0 }) } : null,
      measures: counts ? counts.get(d.celex) ?? 0 : null,
    }]
  })
}

/**
 * The head of a directive's page where no draft of the map names it, from
 * the Cellar's own record of the act — null where the Cellar does not know
 * the act, or the CELEX is no directive's. The page then lists no draft
 * and says that the monitor found none.
 */
export function directiveHeadOf(celex: string, dates: TranspositionDates): EuActHead | null {
  const path = euActPath(celex)
  if (!DIRECTIVE_RE.test(celex) || !path || !dates.found) return null
  return {
    celex,
    kind: 'richtlinie',
    label: directiveLabel(celex, dates.title),
    eurLexUrl: eurLexOf(celex),
    path,
    adopted: dates.adopted,
    title: dates.title,
    transposition: deadlineOf(dates.dates),
  }
}

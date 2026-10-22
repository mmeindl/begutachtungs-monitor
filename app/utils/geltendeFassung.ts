/**
 * What „Im Bundesgesetzblatt" says about the laws a Kundmachung touched —
 * the facts after „Kundgemacht", for both sections that show them: the
 * law's (`BgblStationSection`) and the Verordnung's
 * (`RegulationBgblSection`). Out of the two components on 22.10.2026, when
 * the answer gained a third case and the two copies would have had to learn
 * it twice.
 *
 * The three cases, from `/geltende-fassung` (`server/utils/ris/bgblLaws.ts`):
 *
 *  - laws to link — „Geltende Fassung", one link each (`GeltendeFassungList`);
 *  - laws the Bundesgesetzblatt repealed whole — „Aufgehoben", by name: there
 *    is no Fassung left to link, and for a Kundmachung that ONLY repealed,
 *    „Im RIS noch nicht eingearbeitet" stood there for good, waiting for a
 *    consolidation that never comes (BGBl. I Nr. 131/2022: the
 *    COVID-19-Impfpflichtgesetz and its two Verordnungen);
 *  - neither — RIS has not consolidated yet, which follows a Kundmachung by
 *    days to weeks.
 *
 * PURE, so tests/geltendeFassung.test.ts can hold the three apart.
 */
import type { BgblLawsResponse } from '#shared/types'
import { risSource, type SourceEntry } from '#shared/utils/provenance'

/** A row of `FactList` (its `Fact`, structurally — utils import no component). */
export interface FassungFact {
  key: 'fassung' | 'aufgehoben'
  title: string
  text?: string
}

export const NOT_CONSOLIDATED_YET = 'Im RIS noch nicht eingearbeitet: Die konsolidierte Fassung folgt der Kundmachung mit einigen Tagen Verzug.'

/**
 * The facts for the laws of one Kundmachung, or none while the answer is
 * on its way (`fassung` null) or names no Bundesgesetzblatt. `noun` is the
 * plural the title counts in („Gesetze", „Verordnungen").
 *
 * The „Geltende Fassung" fact carries no text where there are laws: its
 * value is the list, passed as the `value-fassung` slot (`FactList`).
 */
export function fassungFacts(fassung: BgblLawsResponse | null | undefined, noun: string): FassungFact[] {
  if (!fassung?.bgbl) return []
  const repealed = fassung.repealed ?? []
  const out: FassungFact[] = []
  if (fassung.laws.length) {
    out.push({ key: 'fassung', title: fassung.laws.length === 1 ? 'Geltende Fassung' : `Geltende Fassung, ${fassung.laws.length} ${noun}` })
  } else if (!repealed.length) {
    out.push({ key: 'fassung', title: 'Geltende Fassung', text: NOT_CONSOLIDATED_YET })
  }
  if (repealed.length) {
    out.push({ key: 'aufgehoben', title: 'Aufgehoben', text: `${listDe(repealed.map((law) => law.title))}.` })
  }
  return out
}

/** „A", „A und B", „A, B und C" — a German enumeration. */
export function listDe(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`
}

/**
 * The credit under the facts: RIS, for what the section shows of it — the
 * links („Geltende Fassung"), the names of what was repealed
 * („Aufhebungen"), or both. None while there is neither: „noch nicht
 * eingearbeitet" shows nothing RIS said.
 */
export function fassungSources(fassung: BgblLawsResponse | null | undefined): SourceEntry[] {
  const shown = [
    fassung?.laws.length ? 'Geltende Fassung' : null,
    fassung?.repealed?.length ? 'Aufhebungen' : null,
  ].filter((what): what is string => what !== null)
  return shown.length ? [risSource(shown.join(' und '))] : []
}

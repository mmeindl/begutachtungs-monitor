import { describe, expect, it } from 'vitest'
import { buildStatementsSummary, ORG_LIST_CAP } from '../server/utils/parliament/statementsSummary'
import type { StatementMeta } from '../shared/types'

/**
 * The breakdown under the statements panel
 * (`server/utils/parliament/statementsSummary.ts`).
 *
 * The rule the page depends on is that the three numbers PARTITION the
 * total: the panel draws them as one mix bar with a legend, so a
 * miscounted kind does not render as an error — it renders as a bar that
 * silently does not add up to the figure printed beside it.
 *
 * Names are synthetic throughout. Private persons never travel by name at
 * all (`submitterName` is null for them by the time the classifier is
 * done), and no real submitter belongs in a test file.
 */

function statement(over: Partial<StatementMeta> = {}): StatementMeta {
  return {
    citation: '1/SN-88/ME',
    date: '2026-03-20',
    submitterKind: 'organisation',
    submitterName: 'Muster GmbH',
    endorsements: 0,
    parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/SNME/1',
    ...over,
  }
}

const org = (name: string, over: Partial<StatementMeta> = {}) =>
  statement({ submitterKind: 'organisation', submitterName: name, ...over })
const person = () => statement({ submitterKind: 'person', submitterName: null })
const nonPublic = () => statement({ submitterKind: 'nonpublic', submitterName: null })

describe('buildStatementsSummary', () => {
  it('partitions the total into the three kinds', () => {
    const summary = buildStatementsSummary([
      org('Muster GmbH'),
      org('Verein Musterstadt'),
      person(),
      person(),
      person(),
      nonPublic(),
    ])
    expect(summary.total).toBe(6)
    expect(summary.organisations).toBe(2)
    expect(summary.privatePersons).toBe(3)
    expect(summary.nonPublic).toBe(1)
    expect(summary.organisations + summary.privatePersons + summary.nonPublic).toBe(summary.total)
  })

  it('holds the partition for every mix, including the lopsided ones', () => {
    const mixes: StatementMeta[][] = [
      [],
      [person()],
      [org('Muster GmbH')],
      [nonPublic(), nonPublic()],
      Array.from({ length: 50 }, () => person()),
      [...Array.from({ length: 7 }, (_, i) => org(`Kammer ${i}`)), person(), nonPublic()],
    ]
    for (const items of mixes) {
      const s = buildStatementsSummary(items)
      expect(s.organisations + s.privatePersons + s.nonPublic, String(items.length)).toBe(s.total)
      expect(s.total).toBe(items.length)
    }
  })

  /* `organisations` counts STATEMENTS, `organisationList` rows count
   * ORGANISATIONS — the same office can file twice in one Verfahren (132/ME).
   * If the count followed the list, the partition above would stop adding up
   * exactly where the page shows both numbers next to each other. */
  it('counts statements, not organisations, in the partition', () => {
    const summary = buildStatementsSummary([
      org('Muster GmbH', { citation: '1/SN-88/ME' }),
      org('Muster GmbH', { citation: '2/SN-88/ME' }),
      org('Verein Musterstadt'),
    ])
    expect(summary.organisations).toBe(3)
    expect(summary.organisationList).toHaveLength(2)
    expect(summary.organisationList[0]!.statements).toHaveLength(2)
  })

  it('answers an empty Verfahren with zeros and an empty list', () => {
    expect(buildStatementsSummary([])).toEqual({
      total: 0,
      organisations: 0,
      privatePersons: 0,
      nonPublic: 0,
      organisationList: [],
    })
  })

  /* A guard, not a display limit: it is set above every population measured
   * in GP XXVIII (32/ME: 100 organisations), and when it does bind the true
   * statement count stays in `organisations`, so the page can say how many
   * rows it dropped instead of showing a subset as if it were everything. */
  it('caps the organisation LIST without touching the counts', () => {
    const items = Array.from({ length: ORG_LIST_CAP + 20 }, (_, i) =>
      org(`Verein ${String(i).padStart(4, '0')}`))
    const summary = buildStatementsSummary([...items, person()])
    expect(summary.organisationList).toHaveLength(ORG_LIST_CAP)
    expect(summary.organisations).toBe(ORG_LIST_CAP + 20)
    expect(summary.total).toBe(ORG_LIST_CAP + 21)
    expect(summary.organisations + summary.privatePersons + summary.nonPublic).toBe(summary.total)
  })

  it('leaves the cap above every measured population', () => {
    // 32/ME of GP XXVIII carries 100 organisations, the largest measured.
    expect(ORG_LIST_CAP).toBeGreaterThan(100)
  })
})

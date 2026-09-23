import { describe, expect, it } from 'vitest'
import {
  groupOrganisationStatements,
  normalizeOrgName,
} from '../server/utils/parliament/organisations'
import type { StatementMeta } from '../shared/types'

describe('normalizeOrgName', () => {
  it('collapses whitespace runs and normalizes separator spacing', () => {
    expect(
      normalizeOrgName('Universität Wien / Rechtswissenschaftliche Fakultät ; Institut'),
    ).toBe('Universität Wien / Rechtswissenschaftliche Fakultät; Institut')
    expect(normalizeOrgName('Kammer  für   Arbeiter,und Angestellte')).toBe(
      'Kammer für Arbeiter, und Angestellte',
    )
  })

  it('never merges distinct names — display cleanup only', () => {
    expect(normalizeOrgName('Rechtswisssenschaftliche Fakultät')).toBe(
      'Rechtswisssenschaftliche Fakultät',
    )
  })
})

describe('groupOrganisationStatements', () => {
  /* The real case that produced this function: 132/ME, where the same office
   * filed twice and the panel rendered its name in two identical-looking
   * rows (95/SN on 26.08.2026, 103/SN on 07.09.2026). */
  const org = (
    name: string,
    citation: string,
    date: string | null,
    endorsements = 0,
  ): StatementMeta => ({
    citation,
    date,
    submitterKind: 'organisation',
    submitterName: name,
    endorsements,
    parliamentUrl: `https://www.parlament.gv.at/gegenstand/XXVIII/SNME/${citation}`,
  })

  it('collapses repeated submissions of one organisation into one entry', () => {
    const entries = groupOrganisationStatements([
      org('Amt der Tiroler Landesregierung', '95/SN-132/ME', '2026-08-26'),
      org('Amt der Tiroler Landesregierung', '103/SN-132/ME', '2026-09-07'),
      org('UX Melange GmbH', '30/SN-132/ME', '2026-08-04'),
    ])
    expect(entries.map((e) => e.name)).toEqual([
      'Amt der Tiroler Landesregierung',
      'UX Melange GmbH',
    ])
    // Chronological inside the group, and every statement stays reachable.
    expect(entries[0]!.statements.map((s) => s.citation)).toEqual([
      '95/SN-132/ME',
      '103/SN-132/ME',
    ])
    expect(entries[1]!.statements).toHaveLength(1)
  })

  it('sums endorsements over a group and ranks by that total', () => {
    const entries = groupOrganisationStatements([
      org('Zweimal', 'a', '2026-01-01', 3),
      org('Zweimal', 'b', '2026-02-01', 4),
      org('Einmal', 'c', '2026-01-15', 5),
    ])
    expect(entries.map((e) => [e.name, e.endorsements])).toEqual([
      ['Zweimal', 7],
      ['Einmal', 5],
    ])
    // The per-statement numbers survive the grouping.
    expect(entries[0]!.statements.map((s) => s.endorsements)).toEqual([3, 4])
  })

  it('keeps the distinctions upstream makes — a suffix is not a typo', () => {
    const entries = groupOrganisationStatements([
      org('epicenter.works', '14/SN-8/ME', '2025-04-22', 22),
      org('epicenter.works - Plattform Grundrechtspolitik', '27/SN-62/ME', '2025-11-13', 2),
    ])
    expect(entries).toHaveLength(2)
  })

  it('merges separator variants of one name', () => {
    const entries = groupOrganisationStatements([
      org('Universität Wien / Rechtswissenschaftliche Fakultät', 'a', '2026-08-18'),
      org('Universität Wien, Rechtswissenschaftliche Fakultät', 'b', '2026-08-18'),
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.statements).toHaveLength(2)
  })

  /* The live case: 126/ME listed one institute three times, twice under a
   * spelling with a doubled s. */
  it('merges a one-letter typo and keeps the majority spelling', () => {
    const correct =
      'Universität Wien / Rechtswissenschaftliche Fakultät; Institut für Strafrecht und Kriminologie'
    const typo =
      'Universität Wien, Rechtswisssenschaftliche Fakultät; Institut für Strafrecht und Kriminologie'
    const entries = groupOrganisationStatements([
      org(correct, '453/SN-126/ME', '2026-08-18', 0),
      org(correct, '455/SN-126/ME', '2026-08-18', 1),
      org(typo, '452/SN-126/ME', '2026-08-18', 1),
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe(correct)
    expect(entries[0]!.endorsements).toBe(2)
    expect(entries[0]!.statements.map((s) => s.citation)).toEqual([
      '452/SN-126/ME',
      '453/SN-126/ME',
      '455/SN-126/ME',
    ])
  })

  /* Both input orders, because the merge walks the variants in a sorted list
   * and a guard that only holds one way round holds by accident. */
  const groupsFor = (first: string, second: string): number => {
    const one = groupOrganisationStatements([
      org(first, 'a', '2026-01-01'),
      org(second, 'b', '2026-01-01'),
    ]).length
    const other = groupOrganisationStatements([
      org(second, 'b', '2026-01-01'),
      org(first, 'a', '2026-01-01'),
    ]).length
    expect(one).toBe(other)
    return one
  }

  /* An enumerator with anything behind it used to slip past the guard, which
   * only looked at the last three characters of the key: every one of these
   * pairs came back as a single body (found 23.09.2026). They are the shapes
   * Austrian authorities number their units in — clinic, chamber, senate,
   * section, department. */
  it('never merges on an enumerator that is not the last word', () => {
    expect(
      groupsFor(
        'Universitätsklinik für Innere Medizin I, Graz',
        'Universitätsklinik für Innere Medizin II, Graz',
      ),
    ).toBe(2)
    expect(
      groupsFor(
        'Landesgericht Innsbruck, Abteilung I, Zivilrecht',
        'Landesgericht Innsbruck, Abteilung II, Zivilrecht',
      ),
    ).toBe(2)
    expect(
      groupsFor(
        'Oberlandesgericht Wien, Senat I, Strafsachen',
        'Oberlandesgericht Wien, Senat II, Strafsachen',
      ),
    ).toBe(2)
    expect(
      groupsFor(
        'Bundesministerium für Finanzen, Sektion I, Präsidium',
        'Bundesministerium für Finanzen, Sektion V, Präsidium',
      ),
    ).toBe(2)
    expect(
      groupsFor(
        'Bezirksgericht Graz-Ost, Abteilung C, Familienrecht',
        'Bezirksgericht Graz-Ost, Abteilung D, Familienrecht',
      ),
    ).toBe(2)
  })

  /* Two real municipalities, one deletion apart, in a name long enough that
   * the key-length guard lets them through. The word that differs is what
   * decides here, not the name around it. */
  it('never merges a short word inside a long name', () => {
    expect(
      groupsFor(
        'Stadtgemeinde Neunkirchen, Niederösterreich',
        'Stadtgemeinde Neukirchen, Niederösterreich',
      ),
    ).toBe(2)
  })

  it('still merges the typo it was built for, in a long word', () => {
    expect(
      groupsFor(
        'Universität Wien / Rechtswissenschaftliche Fakultät; Institut für Strafrecht',
        'Universität Wien / Rechtswisssenschaftliche Fakultät; Institut für Strafrecht',
      ),
    ).toBe(1)
  })

  it('keeps a numbered unit distinct when the enumerator carries a sub-number', () => {
    expect(
      groupsFor(
        'Amt der Kärntner Landesregierung; Abteilung II/2',
        'Amt der Kärntner Landesregierung; Abteilung II/3',
      ),
    ).toBe(2)
  })

  it('keeps two institutes of one faculty apart', () => {
    expect(
      groupsFor(
        'Universität Wien / Rechtswissenschaftliche Fakultät; Institut für Staatsrecht',
        'Universität Wien / Rechtswissenschaftliche Fakultät; Institut für Strafrecht',
      ),
    ).toBe(2)
  })

  it('never merges on a digit — numbered units are distinct bodies', () => {
    const entries = groupOrganisationStatements([
      org('Amt der Kärntner Landesregierung; Abteilung 1 – Verfassungsdienst', 'a', '2026-01-01'),
      org('Amt der Kärntner Landesregierung; Abteilung 2 – Verfassungsdienst', 'b', '2026-01-01'),
    ])
    expect(entries).toHaveLength(2)
  })

  it('never merges on a trailing letter — that is an enumeration', () => {
    const entries = groupOrganisationStatements([
      org('Amt der Kärntner Landesregierung; Abteilung I', 'a', '2026-01-01'),
      org('Amt der Kärntner Landesregierung; Abteilung II', 'b', '2026-01-01'),
    ])
    expect(entries).toHaveLength(2)
  })

  /* Bezirksgericht Linz and Bezirksgericht Lienz are one edit apart and two
   * different courts: in a short name every character carries meaning. */
  it('never merges short names — no length to absorb a typo', () => {
    const entries = groupOrganisationStatements([
      org('Bezirksgericht Linz', 'a', '2026-01-01'),
      org('Bezirksgericht Lienz', 'b', '2026-01-01'),
    ])
    expect(entries).toHaveLength(2)
  })

  it('orders equal-endorsement groups by name and undated statements last', () => {
    const entries = groupOrganisationStatements([
      org('Zeta', 'z', '2026-01-01'),
      org('Alpha', 'a1', null),
      org('Alpha', 'a2', '2026-03-01'),
    ])
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Zeta'])
    expect(entries[0]!.statements.map((s) => s.citation)).toEqual(['a2', 'a1'])
  })
})

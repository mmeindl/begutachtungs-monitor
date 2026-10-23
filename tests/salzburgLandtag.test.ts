import { describe, expect, it } from 'vitest'
import { germanDate, reportFacts } from '../server/utils/laender/texts/salzburgLandtag'

describe('Salzburg committee report — the facts in its own sentences', () => {
  const report = 'Nr. 184 der Beilagen zum stenographischen Protokoll des Salzburger Landtages (6. Session der 16. Gesetzgebungsperiode) ' +
    'Bericht des Verfassungs- und Verwaltungsausschusses zur Vorlage der Landesregierung (Nr. 148 der Beilagen) betreffend ein Gesetz, mit dem das Salzburger Schulorganisations-Ausführungsge- setz 1995 geändert wird ' +
    'Der Verfassungs- und Verwaltungsausschuss hat sich in der Sitzung vom 14. Dezember 2022 mit der Vorlage befasst. ' +
    'Der Vorsitzende: Ing. Sampl eh. Beschluss des Salzburger Landtages vom 14. Dezember 2022: Der Antrag wurde einstimmig zum Beschluss erhoben.'

  it('reads the committee, its sitting, and the Landtag\'s Beschluss with its vote', () => {
    expect(reportFacts(report)).toEqual({ committee: 'Verfassungs- und Verwaltungsausschuss', sitting: '2022-12-14', vote: 'Einstimmig', decided: '2022-12-14' })
  })

  it('reads German dates and nothing else', () => {
    expect(germanDate('vom 3. Jänner 2024')).toBe('2024-01-03')
    expect(germanDate('vom 3.1.2024')).toBeNull()
  })
})

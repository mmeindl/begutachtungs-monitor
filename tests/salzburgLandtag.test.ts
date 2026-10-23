import { describe, expect, it } from 'vitest'
import { germanDate, reportFacts, voteOf } from '../server/utils/laender/texts/salzburgLandtag'

describe('Salzburg committee report — the facts in its own sentences', () => {
  const report = 'Nr. 184 der Beilagen zum stenographischen Protokoll des Salzburger Landtages (6. Session der 16. Gesetzgebungsperiode) ' +
    'Bericht des Verfassungs- und Verwaltungsausschusses zur Vorlage der Landesregierung (Nr. 148 der Beilagen) betreffend ein Gesetz, mit dem das Salzburger Schulorganisations-Ausführungsge- setz 1995 geändert wird ' +
    'Der Verfassungs- und Verwaltungsausschuss hat sich in der Sitzung vom 14. Dezember 2022 mit der Vorlage befasst. ' +
    'Der Vorsitzende: Ing. Sampl eh. Beschluss des Salzburger Landtages vom 14. Dezember 2022: Der Antrag wurde einstimmig zum Beschluss erhoben.'

  it('reads the committee, its sitting, and the Landtag\'s Beschluss with its vote', () => {
    expect(reportFacts(report)).toEqual({ committee: 'Verfassungs- und Verwaltungsausschuss', sitting: '2022-12-14', vote: 'Einstimmig', decided: '2022-12-14' })
  })

  it('reads a split vote in the report\'s words, and a Beschluss without its full stop', () => {
    const split = report.replace('Der Antrag wurde einstimmig zum Beschluss erhoben.',
      'Der Antrag wurde mit den Stimmen von ÖVP, FPÖ, KPÖ PLUS und GRÜNEN gegen die Stimmen der SPÖ – sohin mehrstimmig – zum Beschluss erhoben')
    expect(reportFacts(split)).toMatchObject({
      vote: 'Mehrstimmig, mit den Stimmen von ÖVP, FPÖ, KPÖ PLUS und GRÜNEN gegen die Stimmen der SPÖ',
      decided: '2022-12-14',
    })
    expect(voteOf('Der Antrag wurde mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN - sohin mehrstimmig - '))
      .toBe('Mehrstimmig, mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN')
    // A plenary amendment instead of a vote: no vote is said.
    expect(voteOf('In der Sitzung wurde von der FPÖ folgender Abänderungsantrag eingebracht: Das in der Nr. 452 enthaltene Gesetz wird mit folgender Änderung ')).toBeNull()
  })

  it('reads German dates and nothing else', () => {
    expect(germanDate('vom 3. Jänner 2024')).toBe('2024-01-03')
    expect(germanDate('vom 3.1.2024')).toBeNull()
  })
})

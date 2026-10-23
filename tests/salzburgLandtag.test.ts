import { describe, expect, it } from 'vitest'
import { germanDate, motionStep, reportFacts, voteOf } from '../server/utils/laender/texts/salzburgLandtag'

describe('Salzburg committee report — the facts in its own sentences', () => {
  const report = 'Nr. 184 der Beilagen zum stenographischen Protokoll des Salzburger Landtages (6. Session der 16. Gesetzgebungsperiode) ' +
    'Bericht des Verfassungs- und Verwaltungsausschusses zur Vorlage der Landesregierung (Nr. 148 der Beilagen) betreffend ein Gesetz, mit dem das Salzburger Schulorganisations-Ausführungsge- setz 1995 geändert wird ' +
    'Der Verfassungs- und Verwaltungsausschuss hat sich in der Sitzung vom 14. Dezember 2022 mit der Vorlage befasst. ' +
    'Der Vorsitzende: Ing. Sampl eh. Beschluss des Salzburger Landtages vom 14. Dezember 2022: Der Antrag wurde einstimmig zum Beschluss erhoben.'

  it('reads the committee, its sitting, and the Landtag\'s Beschluss with its vote', () => {
    expect(reportFacts(report)).toEqual({ committee: 'Verfassungs- und Verwaltungsausschuss', sitting: '2022-12-14', vote: 'Einstimmig', decided: '2022-12-14', motions: [] })
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

  const split = 'mit den Stimmen von ÖVP, FPÖ und SPÖ gegen die Stimmen von KPÖ PLUS und GRÜNEN - sohin mehrstimmig –'

  it('reads the committee\'s motions with their outcome, and no names', () => {
    // As the report of 2026 on the building laws records three (r43).
    const committee = report.replace('Der Vorsitzende:',
      'Abg. A. bringt folgenden Abänderungsantrag ein: Art 4 Ziffer 3 § 31 Abs 3 lautet: „Für bauliche Anlagen mit mehr als fünf Wohnungen gilt Abs 2 Z 1 bis 3.“ ' +
      `Dieser Abänderungsantrag wird ${split} abgelehnt. ` +
      'Abg. B. bringt folgende Abänderungsanträge ein: Artikel 1 Ziffer 13 dahingehend abzuändern, dass die Änderungen entfallen. ' +
      `Diese Abänderungsanträge werden jeweils ${split} abgelehnt. ` +
      'Abg. C. bringt zu Art. 1 folgenden Abänderungsantrag ein: 1. Im Artikel 1 wird nach der Z 6a eingefügt: „Z 6a 1.1.“ ' +
      'Dieser Abänderungsantrag wird mit den Stimmen von ÖVP, FPÖ, SPÖ und KPÖ PLUS gegen die Stimme der GRÜNEN - sohin mehrstimmig – angenommen. ' +
      'Abg. D. bringt für die GRÜNEN folgenden Zusatzantrag ein: § 5 wird angefügt. Dieser Zusatzantrag wird zurückgezogen. Die Vorlage wird einstimmig angenommen. ' +
      'Der Vorsitzende:')
    const motions = reportFacts(committee).motions
    expect(motions).toEqual([
      { where: 'ausschuss', kind: 'Abänderungsantrag', party: null, outcome: 'abgelehnt', vote: 'Mehrstimmig, mit den Stimmen von ÖVP, FPÖ und SPÖ gegen die Stimmen von KPÖ PLUS und GRÜNEN', each: false },
      { where: 'ausschuss', kind: 'Abänderungsanträge', party: null, outcome: 'abgelehnt', vote: 'Mehrstimmig, mit den Stimmen von ÖVP, FPÖ und SPÖ gegen die Stimmen von KPÖ PLUS und GRÜNEN', each: true },
      { where: 'ausschuss', kind: 'Abänderungsantrag', party: null, outcome: 'angenommen', vote: 'Mehrstimmig, mit den Stimmen von ÖVP, FPÖ, SPÖ und KPÖ PLUS gegen die Stimme der GRÜNEN', each: false },
      // Withdrawn: the outcome is read within its own sentence, never from the next one's.
      { where: 'ausschuss', kind: 'Zusatzantrag', party: 'GRÜNE', outcome: null, vote: null, each: false },
    ])
    expect(motions.map((m) => motionStep(m, '2026-03-04').label)).toEqual([
      'Abänderungsantrag im Ausschuss, mehrstimmig abgelehnt – mit den Stimmen von ÖVP, FPÖ und SPÖ gegen die Stimmen von KPÖ PLUS und GRÜNEN',
      'Abänderungsanträge im Ausschuss, jeweils mehrstimmig abgelehnt – mit den Stimmen von ÖVP, FPÖ und SPÖ gegen die Stimmen von KPÖ PLUS und GRÜNEN',
      'Abänderungsantrag im Ausschuss, mehrstimmig angenommen – mit den Stimmen von ÖVP, FPÖ, SPÖ und KPÖ PLUS gegen die Stimme der GRÜNEN',
      'Zusatzantrag der GRÜNEN im Ausschuss',
    ])
  })

  it('reads a committee motion adopted with the Vorlage it changed (r37)', () => {
    const committee = report.replace('Der Vorsitzende:',
      'Abschließend erläutert Abg. A., dass nun eine Lösung gefunden worden sei, und bringt folgenden Abänderungsantrag ein: 1. Im § 9 Abs 3 erhält die bisherige Z 10 die Ziffernbezeichnung „11.“ ' +
      'Zu Abschnitt 4 meldet sich niemand zu Wort und wird dieser mit folgenden Änderungen angenommen. ' +
      'Die Vorlage der Landesregierung wird in der durch den Abänderungsantrag modifizierten Fassung mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN – sohin mehrstimmig - angenommen. ' +
      'Der Vorsitzende:')
    expect(reportFacts(committee).motions).toEqual([
      { where: 'ausschuss', kind: 'Abänderungsantrag', party: null, outcome: 'angenommen', vote: 'Mehrstimmig, mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN', each: false },
    ])
  })

  it('reads a plenary motion, and the Beschluss\'s vote past the motion\'s own wording (r41, r24)', () => {
    const plenary = report.replace('Der Antrag wurde einstimmig zum Beschluss erhoben.',
      'In der Sitzung wurde von der FPÖP folgender Abänderungsantrag eingebracht: Das in der Nr. 452 enthaltene Gesetz wird mit folgender Änderung zum Beschluss erhoben. ' +
      'Im § 14 Abs. 1 Z 2 wird nach der lit f eingefügt: „g) Jugendzentren“. ' +
      'Der Abänderungsantrag wurde mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN – sohin mehrstimmig – zum Beschluss erhoben.')
    const facts = reportFacts(plenary)
    expect(facts.vote).toBe('Mehrstimmig, mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN')
    expect(facts.motions).toEqual([
      { where: 'landtag', kind: 'Abänderungsantrag', party: 'FPÖ', outcome: 'angenommen', vote: 'Mehrstimmig, mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN', each: false },
    ])
    expect(motionStep(facts.motions[0]!, facts.decided).label)
      .toBe('Abänderungsantrag der FPÖ im Landtag, mehrstimmig angenommen – mit den Stimmen von ÖVP und FPÖ gegen die Stimmen von SPÖ, KPÖ PLUS und GRÜNEN')

    const budget = report.replace('Der Antrag wurde einstimmig zum Beschluss erhoben.',
      'In der Sitzung des Salzburger Landtages wurde folgender ÖVP-Abänderungsantrag eingebracht, welche in der Folge einstimmig zum Beschluss erhoben wurde: ' +
      'der Salzburger Landtag wolle beschließen: 1. Der vorliegende Landesvoranschlag wird mit folgenden Änderungen zum Beschluss erhoben:')
    expect(reportFacts(budget)).toMatchObject({
      vote: 'Einstimmig',
      motions: [{ where: 'landtag', kind: 'Abänderungsantrag', party: 'ÖVP', outcome: 'angenommen', vote: 'Einstimmig', each: false }],
    })
  })

  it('reads German dates and nothing else', () => {
    expect(germanDate('vom 3. Jänner 2024')).toBe('2024-01-03')
    expect(germanDate('vom 3.1.2024')).toBeNull()
  })
})

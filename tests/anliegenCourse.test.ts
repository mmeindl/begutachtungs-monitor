/**
 * Step 1 of `docs/research/umsetzungsplan-petitionen-volksbegehren.md`: the
 * course of a Petition, a Bürgerinitiative and a Volksbegehren read from the
 * Verlauf (`server/utils/parliament/anliegen.ts`), each trap that step 0
 * measured (15.11.2026), and the rule that no private person's name reaches
 * the answer.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AnliegenRoot } from '../shared/types'
import {
  VOLKSBEGEHREN_FIRST_GP,
  anliegenIsFollowed,
  assembleAnliegenDetail,
  assertAnliegenContent,
  carriedFromOf,
  carriedToOf,
  endedWithPeriod,
  lastStageDate,
  participationOf,
  presentersOf,
  readAnliegenCourse,
  readClubVote,
  reduceAnliegenContent,
  stagesByDate,
  type AnliegenContent,
  type RawAnliegenPhase,
} from '../server/utils/parliament/anliegen'

const fixture = (name: string): AnliegenContent =>
  (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/${name}.json`, import.meta.url), 'utf8')) as { content: AnliegenContent }).content

const PB = 'Ausschuss für Petitionen und Bürgerinitiativen'
const ALL_FIVE = ['FPÖ', 'ÖVP', 'SPÖ', 'NEOS', 'GRÜNE']

/** A record of one phase with the given stages, for the traps that need no recording. */
function record(stages: [string, string][], extra: Partial<AnliegenContent> = {}): AnliegenContent {
  return { phase: [{ name: 'Ausschussberatungen NR', stages: stages.map(([date, text]) => ({ date, text })) }], ...extra }
}

describe('readAnliegenCourse — recorded items', () => {
  // XXVIII/BI/5: carried over from XXVII/BI/53, Kenntnisnahme im Ausschuss,
  // reported in the Sammelbericht 159 d.B., which the plenary took note of.
  it('reads a Kenntnisnahme im Ausschuss and the plenary’s vote on the report (XXVIII/BI/5)', () => {
    const c = readAnliegenCourse(fixture('XXVIII-BI-5'), 'buergerinitiative')
    expect(c.arrivedAt).toBe('2024-10-24')
    expect(c.carriedFrom).toEqual({ gp: 'XXVII', inr: 53 })
    expect(c.carriedTo).toBeNull()
    expect(c.committee).toEqual({
      name: PB,
      assignedAt: '2025-02-26',
      reassignedFrom: null,
      sittings: [{ date: '2025-04-03', adjourned: false }, { date: '2025-06-26', adjourned: false }],
      statementRequests: [{ date: '2025-04-03', adopted: true }],
    })
    const report = { citation: '159 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/159' }
    expect(c.disposal).toEqual({
      kind: 'kenntnisnahme',
      date: '2025-06-26',
      to: null,
      vote: { for: ['ÖVP', 'SPÖ', 'NEOS'], against: ['FPÖ', 'GRÜNE'] },
      majorityOnly: false,
      report,
    })
    expect(c.plenary).toEqual({ date: '2025-09-24', kind: 'bericht-zur-kenntnis', report, vote: { for: ALL_FIVE, against: [] }, majorityOnly: false })
    expect(c.subjectCommittee).toBeNull()
    expect(c.end).toBe('plenum')
    expect(c.unreadStages).toBe(0)
  })

  // XXVIII/BI/1: forwarded to the Bildungsausschuss, adjourned there on
  // 25.06.2025 — the record goes on after the Zuweisung.
  it('follows a forwarded item into the subject committee (XXVIII/BI/1)', () => {
    const c = readAnliegenCourse(fixture('XXVIII-BI-1'), 'buergerinitiative')
    expect(c.disposal).toMatchObject({ kind: 'zuweisung', date: '2025-04-03', to: 'Bildungsausschuss', vote: { for: ALL_FIVE, against: [] } })
    expect(c.subjectCommittee).toEqual({
      name: 'Bildungsausschuss',
      assignedAt: '2025-04-10',
      report: null,
      lastSitting: '2025-06-25',
      adjourned: true,
      noEntry: false,
    })
    expect(c.plenary).toMatchObject({ date: '2025-04-24', report: { citation: '65 d.B.' } })
    expect(c.carriedFrom).toEqual({ gp: 'XXVII', inr: 25 })
    expect(c.unreadStages).toBe(0)
  })

  // XXVIII/PET/13: still in deliberation, adjourned twice and resumed.
  it('leaves an item in deliberation open (XXVIII/PET/13)', () => {
    const content = fixture('XXVIII-PET-13')
    const c = readAnliegenCourse(content, 'petition')
    expect(c.end).toBe('offen')
    expect(c.disposal).toBeNull()
    expect(c.plenary).toBeNull()
    expect(c.committee?.sittings.map((s) => s.adjourned)).toEqual([false, true, true, false])
    expect(c.committee?.statementRequests.length).toBeGreaterThan(0)
    expect(c.unreadStages).toBe(0)
    expect(participationOf(content)).toEqual({ statements: 'open', support: 'open' })
  })

  // GP XXV: „Ersuchen an die Präsidentin". The forwarded-to committee has no
  // stage of its own — 34 of 59 forwarded items of GP XXVI and XXVII.
  it('reads a Zuweisung asked of „die Präsidentin“, and says when the subject committee left no entry (XXV/BI/1)', () => {
    const c = readAnliegenCourse(fixture('XXV-BI-1'), 'buergerinitiative')
    expect(c.disposal).toMatchObject({ kind: 'zuweisung', to: 'Ausschuss für Arbeit und Soziales', date: '2014-03-25' })
    expect(c.subjectCommittee).toEqual({
      name: 'Ausschuss für Arbeit und Soziales',
      assignedAt: '2014-03-26',
      report: null,
      lastSitting: null,
      adjourned: false,
      noEntry: true,
    })
    expect(c.unreadStages).toBe(0)
  })

  // GP XXV: „mehrstimmig ( dafür: S,V dagegen: F,G,N nicht anwesend: T )" —
  // no clubs read, „mit Mehrheit" only.
  it('reads the older „mehrstimmig“ vote as majority only (XXV/BI/12)', () => {
    const c = readAnliegenCourse(fixture('XXV-BI-12'), 'buergerinitiative')
    expect(c.disposal).toMatchObject({ kind: 'kenntnisnahme', vote: null, majorityOnly: true })
    expect(c.plenary?.vote).toEqual({ for: ['SPÖ', 'ÖVP', 'GRÜNE', 'STRONACH', 'NEOS'], against: ['FPÖ'] })
    // „Die Sitzung wurde am 18. März 2014 unterbrochen!" is a sitting, not an adjournment.
    expect(c.committee?.sittings[0]).toEqual({ date: '2014-03-18', adjourned: false })
    expect(c.carriedFrom).toEqual({ gp: 'XXIV', inr: 40 })
  })

  // XXVIII/I/98: erste Lesung, Verfassungsausschuss with both dated duties,
  // Bericht 200 d.B., „41. Sitzung des Nationalrates: Kenntnisnahme Dafür: …".
  it('reads a Volksbegehren’s erste Lesung, duties, report and Kenntnisnahme (XXVIII/I/98)', () => {
    const content = fixture('XXVIII-I-98')
    const c = readAnliegenCourse(content, 'volksbegehren')
    const report = { citation: '200 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/200' }
    expect(c.firstReading).toBe('2025-07-11')
    expect(c.committee).toMatchObject({ name: 'Verfassungsausschuss', assignedAt: '2025-07-11', sittings: [{ date: '2025-09-15', adjourned: false }] })
    expect(c.duties).toEqual({ deliberationBy: '2025-10-05', reportBy: '2026-02-05' })
    expect(c.committeeReport).toEqual(report)
    expect(c.plenary).toEqual({ date: '2025-09-24', kind: 'kenntnisnahme', report, vote: { for: ALL_FIVE, against: [] }, majorityOnly: false })
    expect(c.disposal).toBeNull()
    expect(c.resolutions).toEqual([])
    expect(c.end).toBe('plenum')
    expect(c.unreadStages).toBe(0)
    expect(participationOf(content)).toEqual({ statements: 'closed', support: 'impossible' })
  })

  // XXVIII/I/2: carried over from 2547 d.B. XXVII, adjourned and resumed in
  // the Umweltausschuss, an adopted Entschließung 6/AEA with the report.
  it('reads a carried-over Volksbegehren with an adopted Entschließung (XXVIII/I/2)', () => {
    const c = readAnliegenCourse(fixture('XXVIII-I-2'), 'volksbegehren')
    expect(c.carriedFrom).toEqual({ gp: 'XXVII', inr: 2547 })
    expect(c.firstReading).toBeNull()
    expect(c.committee?.sittings).toEqual([{ date: '2025-03-26', adjourned: true }, { date: '2025-07-03', adjourned: false }])
    expect(c.duties).toEqual({ deliberationBy: '2025-03-26', reportBy: '2025-09-19' })
    expect(c.committeeReport?.citation).toBe('180 d.B.')
    expect(c.resolutions).toEqual([{ date: '2025-07-10', ref: '6/AEA' }])
    expect(c.unreadStages).toBe(0)
  })
})

describe('readAnliegenCourse — the traps of step 0', () => {
  // A reader anchored on „den Präsidenten" missed every Zuweisung of GP XXV.
  it('takes „den Präsidenten“ and „die Präsidentin“ alike', () => {
    for (const whom of ['den Präsidenten', 'die Präsidentin']) {
      const c = readAnliegenCourse(record([['01.03.2016', `${PB}: Ersuchen an ${whom} um Zuweisung an den <a href="/ausschuss/XXV/A-VE/1/1">Verkehrsausschuss</a><br>Dafür: SPÖ, ÖVP, dagegen: -`]]), 'petition')
      expect(c.disposal).toMatchObject({ kind: 'zuweisung', to: 'Verkehrsausschuss' })
      expect(c.end).toBe('zuweisung')
    }
  })

  // The motion names the kind: „die Petition" and „die parlamentarische Bürgerinitiative".
  it('reads the Kenntnisnahme motion for both kinds', () => {
    for (const [kind, words] of [['petition', 'die Petition'], ['buergerinitiative', 'die parlamentarische Bürgerinitiative']] as const) {
      const c = readAnliegenCourse(record([['26.06.2025', `${PB}: Antrag, ${words} durch Kenntnisnahme im Ausschuss zu erledigen<br>Dafür: ÖVP, SPÖ, NEOS, dagegen: FPÖ, GRÜNE`]]), kind)
      expect(c.disposal?.kind).toBe('kenntnisnahme')
      expect(c.end).toBe('kenntnisnahme-ausschuss')
    }
  })

  // „Antrag auf Kenntnisnahme angenommen" is the older wording of the same
  // vote on the report (19 times in GP XXV–XXVIII).
  it('reads the plenary’s older „Antrag auf Kenntnisnahme angenommen“ as a vote on the report', () => {
    const c = readAnliegenCourse(record([['09.07.2014', '36. Sitzung des Nationalrates: Antrag auf Kenntnisnahme angenommen<br>Dafür: SPÖ, ÖVP, dagegen: FPÖ']]), 'petition')
    expect(c.plenary).toMatchObject({ kind: 'bericht-zur-kenntnis', vote: { for: ['SPÖ', 'ÖVP'], against: ['FPÖ'] } })
  })

  // „In der Sitzung vom 25. Juni 2025 vertagt" adjourns; „Wiederaufnahme der
  // am … vertagten Verhandlungen" is a sitting that did not.
  it('tells an adjourned sitting from a resumed one', () => {
    const c = readAnliegenCourse(record([
      ['25.06.2025', `${PB}: auf <a href="/x">Tagesordnung</a> in der <a href="/y">6. Sitzung des Ausschusses</a><br>In der Sitzung vom 25. Juni 2025 vertagt`],
      ['22.10.2025', `${PB}: auf Tagesordnung in der 7. Sitzung des Ausschusses<br>Wiederaufnahme der am 25. Juni 2025 vertagten Verhandlungen`],
    ]), 'petition')
    expect(c.committee?.sittings).toEqual([{ date: '2025-06-25', adjourned: true }, { date: '2025-10-22', adjourned: false }])
  })

  // The report's link is the stage's own href, not one we build.
  it('takes the Sammelbericht’s number and link from the stage', () => {
    const c = readAnliegenCourse(record([
      ['26.06.2025', `${PB}: Antrag, die Petition durch Kenntnisnahme im Ausschuss zu erledigen`],
      ['26.06.2025', `${PB}: <a href="/gegenstand/XXVIII/I/159">Sammelbericht des Ausschusses für Petitionen und Bürgerinitiativen (159 d.B.)</a>`],
    ]), 'petition')
    expect(c.disposal?.report).toEqual({ citation: '159 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/159' })
  })

  // „Zuweisung an den Gesundheitsausschuss (Frist: 23.03.2022)" is the older
  // spelling of the Frist für die Aufnahme der Vorberatung (1179 d.B. XXVII).
  it('reads the Frist in a Volksbegehren’s Zuweisung as the deliberation duty', () => {
    const c = readAnliegenCourse(record([['23.02.2022', '141. Sitzung des Nationalrates: Zuweisung an den <a href="/a">Gesundheitsausschuss</a> (Frist: 23.03.2022)']]), 'volksbegehren')
    expect(c.committee).toMatchObject({ name: 'Gesundheitsausschuss', assignedAt: '2022-02-23' })
    expect(c.duties).toEqual({ deliberationBy: '2022-03-23', reportBy: null })
  })

  // Only an adopted Entschließung is an event.
  it('keeps adopted Entschließungen only', () => {
    const c = readAnliegenCourse(record([
      ['10.07.2025', '37. Sitzung des Nationalrates: Abstimmung über die dem Auschussbericht beigedruckten Entschließung <a href="/gegenstand/XXVIII/AEA/6">6/AEA</a><br><b>angenommen</b> (6/AEA)'],
      ['10.07.2025', '37. Sitzung des Nationalrates: Abstimmung über die dem Ausschussbericht beigedruckten Entschließung 7/AEA<br><b>abgelehnt</b>'],
    ]), 'volksbegehren')
    expect(c.resolutions).toEqual([{ date: '2025-07-10', ref: '6/AEA' }])
  })

  // A request names no committee; with none named in the whole record it is
  // counted, not dropped.
  it('counts requests as unread where no committee is named', () => {
    const c = readAnliegenCourse(record([['03.04.2025', 'Antrag auf Einholung einer Stellungnahme von (gekürzt) - <b>angenommen</b>']]), 'petition')
    expect(c.committee).toBeNull()
    expect(c.unreadStages).toBe(1)
  })

  // Known lines without a fact do not count as unread.
  it('counts no known line as unread', () => {
    const c = readAnliegenCourse(record([
      ['24.09.2025', 'Wortmeldungen in der Debatte'],
      ['24.09.2025', 'Auf der <a href="/t">Tagesordnung</a> der <a href="/s">41. Sitzung des Nationalrates</a>'],
      ['15.07.2025', 'Vorgesehen für den <a href="/a">Ausschuss für Petitionen und Bürgerinitiativen</a>'],
      ['24.10.2024', '<a href="/s">1. Sitzung des Nationalrates</a>: Mitteilung des Einlangens'],
      ['03.04.2025', 'Antrag auf Ausschussbegutachtung der Vorlage (<a href="/a">6/AUA</a>)'],
      ['03.04.2025', `${PB}: Beschlussfassung auf Einholung schriftlicher Stellungnahmen im Rahmen eines "Ausschussbegutachtungsverfahrens"`],
      ['09.07.2014', '36. Sitzung des Nationalrates: Debatte'],
      ['24.04.2025', '17. Sitzung des Nationalrates: Mitteilung der auf Ersuchen des Ausschusses für Petitionen und Bürgerinitiativen erfolgten Zuweisung an den <a href="/a">Bildungsausschuss</a>'],
    ]), 'petition')
    expect(c.unreadStages).toBe(0)
  })

  // A line no pattern knows is counted — and its text is nowhere in the answer.
  it('counts an unknown line and returns no text of it', () => {
    const c = readAnliegenCourse(record([
      ['01.01.2026', 'Eine Zeile, die niemand kennt: Unbekanntwort'],
      // „… Miterledigung" is known since GP XXII–XXIV were read (15.11.2026); this line is not.
      ['02.01.2026', 'Auf der Tagesordnung der 12. Sitzung des Nationalrates<br>Zurückgestellt'],
    ]), 'petition')
    expect(c.unreadStages).toBe(2)
    expect(JSON.stringify(c)).not.toContain('Unbekanntwort')
    expect(JSON.stringify(c)).not.toContain('Zurückgestellt')
  })

  // A step of the other kind's vocabulary is not this kind's fact.
  it('counts a Volksbegehren line on a Petition as unread', () => {
    const c = readAnliegenCourse(record([['11.07.2025', '39. Sitzung des Nationalrates: Erste Lesung']]), 'petition')
    expect(c.firstReading).toBeNull()
    expect(c.unreadStages).toBe(1)
  })
})

describe('stagesByDate — the stages come phase by phase, not in order of time', () => {
  const phases: RawAnliegenPhase[] = [
    { name: 'Ausschussberatungen NR', stages: [
      { date: '26.02.2025', text: 'b' },
      { date: '26.06.2025', text: 'c' },
    ] },
    { name: 'Plenarberatungen NR', stages: [
      { date: '10.12.2024', text: 'a' },
      { date: '26.06.2025', text: 'd' },
    ] },
  ]

  // The plenary's „Mitteilung des Einlangens" of December stands after the
  // committee's sitting of February.
  it('sorts by date, a later phase’s earlier stage first, and keeps the order within a day', () => {
    expect(stagesByDate(phases).map((s) => s.html)).toEqual(['a', 'b', 'c', 'd'])
    expect(lastStageDate(phases)).toBe('2025-06-26')
  })

  // The last sitting is the last by date, not the last in the record.
  it('judges „adjourned“ by the latest sitting, wherever its phase stands', () => {
    const c = readAnliegenCourse({
      phase: [
        { name: 'Ausschussberatungen NR', stages: [
          { date: '03.04.2025', text: `${PB}: Ersuchen an den Präsidenten um Zuweisung an den Bildungsausschuss` },
          { date: '25.06.2025', text: 'Bildungsausschuss: auf Tagesordnung in der 5. Sitzung des Ausschusses<br>In der Sitzung vom 25. Juni 2025 vertagt' },
        ] },
        { name: 'Ausschussberatungen NR', stages: [
          { date: '01.05.2025', text: 'Bildungsausschuss: auf Tagesordnung in der 4. Sitzung des Ausschusses' },
        ] },
      ],
    }, 'buergerinitiative')
    expect(c.subjectCommittee).toMatchObject({ lastSitting: '2025-06-25', adjourned: true })
  })
})

describe('the period’s end', () => {
  // A Bürgerinitiative is carried over: the status names the successor.
  it('reads the successor from the status, by link or by citation', () => {
    expect(carriedToOf('Verhandlungsgegenstand der nächstfolgenden GP gem. § 21 Abs. 1a GOG (5/BI/XXVI. GP)')).toEqual({ gp: 'XXVI', inr: 5 })
    expect(carriedToOf('Verhandlungsgegenstand der nächstfolgenden GP gem. § 21 Abs. 1a GOG (<a href="/gegenstand/XXVIII/I/1">1 d.B./XXVIII. GP</a>)')).toEqual({ gp: 'XXVIII', inr: 1 })
    const c = readAnliegenCourse({ status: { description: 'Verhandlungsgegenstand der nächstfolgenden GP gem. § 21 Abs. 1a GOG ( 5/BI/XXVI. GP )' }, phase: [] }, 'buergerinitiative')
    expect(c.carriedTo).toEqual({ gp: 'XXVI', inr: 5 })
    expect(c.end).toBe('uebernommen')
  })

  it('reads the predecessor from „Neuverteilung gem. § 21 Abs. 1a GOG-NR“ only', () => {
    expect(carriedFromOf([{ text: 'Neuverteilung gem. § 21 Abs. 1a GOG-NR', url: '/gegenstand/XXVII/BI/53' }])).toEqual({ gp: 'XXVII', inr: 53 })
    expect(carriedFromOf([{ text: 'Bezug zu', url: '/gegenstand/XXVII/BI/53' }])).toBeNull()
  })

  // A Petition is never carried over; that it ended with the period is said
  // from the period, not from a field.
  it('says an open item of a past period ended with it', () => {
    expect(endedWithPeriod({ end: 'offen' }, 'XXVII', 'XXVIII')).toBe(true)
    expect(endedWithPeriod({ end: 'offen' }, 'XXVIII', 'XXVIII')).toBe(false)
    expect(endedWithPeriod({ end: 'plenum' }, 'XXVII', 'XXVIII')).toBe(false)
    expect(endedWithPeriod({ end: 'offen' }, 'XXVII', null)).toBe(false)
  })
})

describe('readClubVote', () => {
  it('reads „Dafür: …, dagegen: …“, and „dagegen: -“ as no club against', () => {
    expect(readClubVote('… Dafür: ÖVP, SPÖ, NEOS, dagegen: FPÖ, GRÜNE')).toEqual({ vote: { for: ['ÖVP', 'SPÖ', 'NEOS'], against: ['FPÖ', 'GRÜNE'] }, majorityOnly: false })
    expect(readClubVote('… Dafür: FPÖ, ÖVP, SPÖ, NEOS, GRÜNE, dagegen: -')).toEqual({ vote: { for: ALL_FIVE, against: [] }, majorityOnly: false })
  })

  // A remark after the clubs makes the split ours to misread.
  it('reads no clubs where a remark or the older shape follows', () => {
    expect(readClubVote('Dafür: SPÖ, ÖVP, dagegen: FPÖ, GRÜNE, NEOS (dafür teilweise STRONACH)')).toEqual({ vote: null, majorityOnly: true })
    expect(readClubVote('mehrstimmig ( dafür S, V; dagegen F, G, N; nicht anwesend T )')).toEqual({ vote: null, majorityOnly: true })
    expect(readClubVote('Einstimmig')).toEqual({ vote: null, majorityOnly: false })
  })
})

describe('participationOf', () => {
  it('reads the two doors from the two flags', () => {
    expect(participationOf({ statementsstate: '1', approvalstate: '1' })).toEqual({ statements: 'open', support: 'open' })
    expect(participationOf({ statementsstate: '0', approvalstate: '0' })).toEqual({ statements: 'closed', support: 'closed' })
    // Every Volksbegehren: „9 Keine Zustimmung bei dem Doktyp "VOLKBG" möglich".
    expect(participationOf({ statementsstate: '0', approvalstate: '9 Keine Zustimmung bei dem Doktyp "VOLKBG" möglich' })).toEqual({ statements: 'closed', support: 'impossible' })
    expect(participationOf(null)).toEqual({ statements: 'closed', support: 'closed' })
  })
})

describe('assertAnliegenContent — the endpoint has answered with another item of the same number', () => {
  const pet: AnliegenRoot = { gp: 'XXVIII', kind: 'petition', inr: 13 }
  const vb: AnliegenRoot = { gp: 'XXVIII', kind: 'volksbegehren', inr: 98 }
  it('holds the type of the record to the kind asked for', () => {
    expect(assertAnliegenContent({ ityp: 'PET' }, pet)).toBe(true)
    expect(assertAnliegenContent({ ityp: 'BI' }, pet)).toBe(false)
    expect(assertAnliegenContent({ ityp: 'I', doktyp: 'VOLKBG' }, vb)).toBe(true)
    expect(assertAnliegenContent({ ityp: 'I', doktyp: 'RV' }, vb)).toBe(false)
    expect(assertAnliegenContent(null, vb)).toBe(false)
  })
})

describe('no private person’s name reaches the answer', () => {
  const PLACEHOLDER = 'Mustername, Vorname'
  const root: AnliegenRoot = { gp: 'XXVIII', kind: 'buergerinitiative', inr: 99 }
  const content: AnliegenContent = {
    ityp: 'BI',
    doktyp: 'BI',
    title: 'Eine Bürgerinitiative',
    zitation: '99/BI',
    einlangen: '2025-01-01T00:00:00',
    statementsstate: '1',
    approvalstate: '1',
    names: [
      { funktext: 'Erstunterzeichnerin/Erstunterzeichner', name: PLACEHOLDER, frak_code: null },
      { funktext: 'Petition überreicht von', name: 'Abg. Beispiel', frak_code: 'V' },
    ],
    phase: [{ name: 'Ausschussberatungen NR', stages: [
      { date: '26.02.2025', text: `Zuweisung an den <a href="/ausschuss/XXVIII/A-PB/1/00932">${PB}</a>` },
      { date: '03.04.2025', text: `Antrag auf Einholung einer Stellungnahme von Beispielbehörde; ${PLACEHOLDER} - <b>angenommen</b>` },
      { date: '04.04.2025', text: `Antrag auf Einholung einer Stellungnahme von ${PLACEHOLDER}` },
      { date: '05.04.2025', text: `Eine unbekannte Zeile über ${PLACEHOLDER}` },
    ] }],
  }

  // `names[]`: the function text decides, whatever the kind — the
  // Erstunterzeichner goes, a member who handed it in stays by club, never by name.
  it('keeps only the club of a member who handed the item in, and no name', () => {
    expect(presentersOf(content.names)).toEqual([{ club: 'V' }])
  })

  // No name of a presenter reaches the answer or the cached record either.
  it('keeps a presenter’s name out of the detail and the reduced record', () => {
    const detail = assembleAnliegenDetail(root, content, { statements: null, support: null })
    expect(detail.presenters).toEqual([{ club: 'V' }])
    expect(JSON.stringify(detail)).not.toContain('Abg. Beispiel')
    const reduced = reduceAnliegenContent(content)
    expect(reduced?.names).toEqual([{ funktext: 'Petition überreicht von', frak_code: 'V' }])
    expect(JSON.stringify(reduced)).not.toContain('Abg. Beispiel')
  })

  // The request keeps its date and result; the addressee goes, alone or behind „;".
  it('keeps no addressee of a request, and no text of an unread line', () => {
    const detail = assembleAnliegenDetail(root, content, { statements: null, support: null })
    expect(detail.course.committee?.statementRequests).toEqual([{ date: '2025-04-03', adopted: true }, { date: '2025-04-04', adopted: false }])
    expect(detail.course.unreadStages).toBe(1)
    expect(JSON.stringify(detail)).not.toContain('Mustername')
  })

  // The record as the cache keeps it.
  it('reduces the record before it is cached', () => {
    const reduced = reduceAnliegenContent(content)
    expect(JSON.stringify(reduced)).not.toContain('Antrag auf Einholung einer Stellungnahme von Beispielbehörde')
    expect(JSON.stringify(reduced?.names)).not.toContain('Mustername')
    // The reduced record reads the same course.
    expect(readAnliegenCourse(reduced, 'buergerinitiative')).toEqual(readAnliegenCourse(content, 'buergerinitiative'))
  })
})

describe('anliegenIsFollowed', () => {
  // A Volksbegehren's page is true from GP XXII on (step 0: single-stage records
  // in GP X–XVIII, reports without a plenary step in GP XX–XXI).
  it('follows a Volksbegehren from GP XXII on and refuses the ones before', () => {
    expect(VOLKSBEGEHREN_FIRST_GP).toBe('XXII')
    expect(anliegenIsFollowed({ gp: 'XXII', kind: 'volksbegehren', inr: 206 })).toBe(true)
    expect(anliegenIsFollowed({ gp: 'XXVIII', kind: 'volksbegehren', inr: 98 })).toBe(true)
    expect(anliegenIsFollowed({ gp: 'XXI', kind: 'volksbegehren', inr: 1 })).toBe(false)
    expect(anliegenIsFollowed({ gp: 'XVI', kind: 'volksbegehren', inr: 607 })).toBe(false)
  })

  // Petitionen and Bürgerinitiativen of any period are followed.
  it('follows a Petition and a Bürgerinitiative of any period', () => {
    expect(anliegenIsFollowed({ gp: 'XX', kind: 'petition', inr: 1 })).toBe(true)
    expect(anliegenIsFollowed({ gp: 'XXV', kind: 'buergerinitiative', inr: 1 })).toBe(true)
  })
})

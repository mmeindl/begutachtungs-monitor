/**
 * GP XXII to XXIV (15.11.2026): the shapes the reader learnt to open these
 * periods' list — the older Sammelbericht, the Miterledigung on the agenda,
 * the committee's „Antrag auf Ergänzung der Tagesordnung", a sitting named
 * alone, media references, an Entschließung on a Petition, the Übermittlung
 * an die Volksanwaltschaft as the committee's third ending — and the rule
 * that no name of a member, an author or an Erstunterzeichner survives.
 *
 * Fixtures: `tests/fixtures/anliegen/XXII-*.json`, `XXIV-*.json` (README),
 * every person's name a „Platzhalter".
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AnliegenDetail, AnliegenKind, AnliegenRow } from '../shared/types'
import { anliegenStateOf } from '../shared/utils/anliegen'
import {
  anliegenTitleOf,
  assembleAnliegenDetail,
  lastStepDate,
  readAnliegenCourse,
  reduceAnliegenContent,
  type AnliegenContent,
} from '../server/utils/parliament/anliegen'
import {
  anliegenHeadline,
  anliegenNotShown,
  anliegenRail,
  anliegenRowStateDe,
  anliegenRowView,
  anliegenView,
  factText,
  type AnliegenRailRow,
} from '../app/utils/anliegenView'

const PB = 'Ausschuss für Petitionen und Bürgerinitiativen'

function content(name: string): AnliegenContent {
  return (JSON.parse(readFileSync(new URL(`./fixtures/anliegen/${name}.json`, import.meta.url), 'utf8')) as { content: AnliegenContent }).content
}

function kindOf(name: string): AnliegenKind {
  return name.includes('-BI-') ? 'buergerinitiative' : 'petition'
}

function detail(name: string): AnliegenDetail {
  const [gp, , nr] = name.split('-') as [string, string, string]
  // Every one of these periods has ended.
  return { ...assembleAnliegenDetail({ gp, kind: kindOf(name), inr: Number(nr) }, content(name), { statements: 0, support: 12 }), periodEnded: true }
}

function rowOf(name: string): AnliegenRow {
  const d = detail(name)
  return {
    root: d.root,
    title: d.title,
    arrivedAt: d.course.arrivedAt,
    lastStepAt: lastStepDate(content(name), d.root.kind),
    state: anliegenStateOf(d.root, d.course, true),
    open: false,
    counts: d.counts,
  }
}

function line(row: AnliegenRailRow): string {
  return `${row.name}${row.marked ? '*' : ''} [${row.state}] — ${row.facts.map(factText).join(' · ')}`
}

/** A record of one phase with the given stages. */
function record(stages: [string, string][], extra: Partial<AnliegenContent> = {}): AnliegenContent {
  return { phase: [{ name: 'Ausschussberatungen NR', stages: stages.map(([date, text]) => ({ date, text })) }], ...extra }
}

const FIXTURES = ['XXIV-PET-144', 'XXII-PET-80', 'XXII-BI-3', 'XXIV-BI-71', 'XXIV-BI-37', 'XXII-PET-47', 'XXII-PET-64']

describe('the older Sammelbericht', () => {
  // Every spelling of GP XXII–XXIV, the items listed in the line, the Beilage
  // at its end and one link: the same fact as „Sammelbericht … (159 d.B.)".
  it.each([
    'Sammelbericht über die Petitionen Nr. 24, 33, 35 bis 40 sowie über die Bürgerinitiativen Nr. 18, 20 und 25 (974 d.B.)',
    'Sammelbericht des Ausschusses für Petitionen und Bürgerinitiativen über die Petitionen Nr. 125, 129 und 137 sowie über die Bürgerinitiative Nr. 37 (974 d.B.)',
    'SAMMELBERICHT über die Petitionen Nr. 17, 19 und 20 sowie über die Bürgerinitiativen Nr. 19 (974 d.B.)',
    'SAMMELBERICHT Petitionen Nr. 2-7, 9 und 13 Bürgerinitiativen Nr. 1, 3, 4, 7, 9 und 10 (974 d.B.)',
    'Petitionen Nr. 60, 65, 66, 70 sowie über die Bürgerinitiativen Nr. 23 und 28 bis 31 (974 d.B.)',
  ])('reads „%s"', (words) => {
    for (const prefix of [`${PB}: `, `<a href="/ausschuss/XXII/A-PB/1/1">${PB}</a> : `]) {
      const c = readAnliegenCourse(record([
        ['26.06.2005', `${PB}: Antrag, die Petition durch Kenntnisnahme im Ausschuss zu erledigen<br>Dafür: ÖVP, SPÖ, F, GRÜNE, dagegen: -`],
        ['27.06.2005', `${prefix}<a href="/gegenstand/XXII/I/974">${words}</a>`],
        ['07.07.2005', '113. Sitzung des Nationalrates: Antrag, den Ausschussbericht zur Kenntnis zu nehmen, <b>angenommen</b><br>Dafür: ÖVP, SPÖ, F, dagegen: GRÜNE'],
      ]), 'petition')
      const report = { citation: '974 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXII/I/974' }
      expect(c.unreadStages).toBe(0)
      expect(c.disposal?.report).toEqual(report)
      expect(c.plenary).toMatchObject({ kind: 'bericht-zur-kenntnis', date: '2005-07-07', report })
      // The items listed in the line go nowhere.
      expect(JSON.stringify(c)).not.toContain('Nr.')
    }
  })

  // 47/PET XXII: the report's citation and link from the record; the Verkehrsausschuss's own report later.
  it('reads the report of a recorded item (XXII/PET/47)', () => {
    const c = readAnliegenCourse(content('XXII-PET-47'), 'petition')
    expect(c.unreadStages).toBe(0)
    expect(c.disposal).toMatchObject({ kind: 'zuweisung', to: 'Verkehrsausschuss', report: { citation: '974 d.B.' } })
    expect(c.plenary?.report?.url).toBe('https://www.parlament.gv.at/gegenstand/XXII/I/974')
  })
})

describe('the plenary’s step on a subject committee’s report is not the step on the Sammelbericht', () => {
  // 47/PET XXII: the Sammelbericht 974 d.B. taken note of on 09.06.2005; the
  // Verkehrsausschuss's 1123 d.B. on 19.10.2005. The second step used to
  // overwrite the first, and the page dated the Sammelbericht 19.10.2005.
  it('keeps the plenary’s first step, on the Sammelbericht (XXII/PET/47)', () => {
    const c = readAnliegenCourse(content('XXII-PET-47'), 'petition')
    expect(c.plenary).toMatchObject({ date: '2005-06-09', report: { citation: '974 d.B.' } })
    expect(c.subjectCommittee).toMatchObject({ name: 'Verkehrsausschuss', report: { citation: '1123 d.B.' } })
  })
})

describe('known lines that carry no fact', () => {
  it('counts none of them as unread, and keeps nothing of them', () => {
    const c = readAnliegenCourse(record([
      ['12.05.2005', 'Auf der Tagesordnung der <a href="/gegenstand/XXII/NRSITZ/110">110. Sitzung des Nationalrates</a> Miterledigung'],
      ['15.12.2004', `${PB}: Antrag auf Ergänzung der Tagesordnung`],
      ['05.11.2003', '<a href="/ausschuss/XXII/A-JU/1/1">Justizausschuss</a> : Antrag auf Ergänzung der Tagesordnung'],
      ['15.07.2014', '<a href="/gegenstand/XXIV/NRSITZ/220">220. Sitzung des Nationalrates</a>'],
      ['03.05.2006', 'siehe auch Autor Platzhalter (2006): Schlagzeile Platzhalter. (3432/MED-K/K. GP)'],
    ]), 'petition')
    expect(c.unreadStages).toBe(0)
    expect(JSON.stringify(c)).not.toContain('Platzhalter')
  })

  // A sitting named alone (dated after XXIV ended) and a media reference date no step.
  it('dates the last step by neither a sitting named alone nor a media reference (XXIV/BI/71, XXII/PET/80)', () => {
    expect(lastStepDate(content('XXIV-BI-71'), 'buergerinitiative')).toBe('2013-10-28')
    expect(lastStepDate(content('XXII-PET-80'), 'petition')).toBe('2006-09-21')
  })

  // 3/BI XXII: the Miterledigung, the subject committee's Ergänzung der Tagesordnung, „SAMMELBERICHT Petitionen Nr. …".
  it('reads a recorded item with all three without an unread stage (XXII/BI/3)', () => {
    const c = readAnliegenCourse(content('XXII-BI-3'), 'buergerinitiative')
    expect(c.unreadStages).toBe(0)
    expect(c.disposal).toMatchObject({ kind: 'zuweisung', to: 'Justizausschuss', report: { citation: '261 d.B.' } })
    expect(c.subjectCommittee).toMatchObject({ name: 'Justizausschuss', report: { citation: '406 d.B.' } })
  })

  // 71/BI XXIV: carried into XXV; the bare sitting line is no step.
  it('reads a carried-over Bürgerinitiative with a sitting named alone (XXIV/BI/71)', () => {
    const d = detail('XXIV-BI-71')
    expect(d.course.unreadStages).toBe(0)
    expect(anliegenHeadline(d)).toMatchObject({ kind: 'uebernommen', text: 'In die XXV. Gesetzgebungsperiode übernommen' })
  })

  // Still unknown: „Abstandnahme von der weiteren Verhandlung" (once, XXII) is counted, not guessed.
  it('counts „Abstandnahme von der weiteren Verhandlung“ as unread', () => {
    const c = readAnliegenCourse(record([['04.11.2003', `${PB}: Abstandnahme von der weiteren Verhandlung<br>Dafür: ÖVP, SPÖ, F, GRÜNE, dagegen: -`]]), 'buergerinitiative')
    expect(c.disposal).toBeNull()
    expect(c.unreadStages).toBe(1)
  })
})

describe('an Entschließung on a Petition or a Bürgerinitiative', () => {
  // 37/BI XXIV: forwarded to the Justizausschuss, its 2086 d.B. carried the Entschließung 77/AEA.
  it('reads it, and the page puts it at the subject committee that reported (XXIV/BI/37)', () => {
    const d = detail('XXIV-BI-37')
    expect(d.course.unreadStages).toBe(0)
    expect(d.course.resolutions).toEqual([{ date: '2013-01-31', ref: '77/AEA' }])
    const rail = anliegenRail(d).map(line)
    expect(rail.find((l) => l.startsWith('Justizausschuss'))).toContain('Entschließung am 31.01.2013 angenommen (77/AEA)')
    expect(rail.find((l) => l.startsWith('Nationalrat'))).not.toContain('Entschließung')
  })

  // With the Sammelbericht, no subject committee: the Nationalrat's row.
  it('puts it at the Nationalrat where no subject committee reported', () => {
    const c: AnliegenContent = record([
      ['26.06.2005', `${PB}: Antrag, die Petition durch Kenntnisnahme im Ausschuss zu erledigen`],
      ['21.09.2006', '163. Sitzung des Nationalrates: Abstimmung über die dem Auschussbericht beigedruckten Entschließung <a href="/gegenstand/XXII/AEA/62">62/AEA</a><br><b>angenommen</b> (<a href="/gegenstand/XXII/AEA/62">62/AEA</a>)<br>Dafür: ÖVP, SPÖ, F-BZÖ, GRÜNE, dagegen: -'],
      ['21.09.2006', '163. Sitzung des Nationalrates: Antrag, den Ausschussbericht zur Kenntnis zu nehmen, <b>angenommen</b>'],
    ], { ityp: 'PET', title: 'Eine Petition' })
    const d = assembleAnliegenDetail({ gp: 'XXII', kind: 'petition', inr: 74 }, c, { statements: null, support: null })
    expect(d.course.unreadStages).toBe(0)
    expect(anliegenRail(d).map(line).find((l) => l.startsWith('Nationalrat'))).toContain('Entschließung am 21.09.2006 angenommen (62/AEA)')
  })
})

describe('the Übermittlung an die Volksanwaltschaft — the committee’s third ending', () => {
  // 144/PET XXIV: the committee's motion on 12.03.2012 in the Sammelbericht
  // 1688 d.B., the plenary agreed on 29.03.2012.
  it('reads the motion and the plenary’s agreement (XXIV/PET/144)', () => {
    const c = readAnliegenCourse(content('XXIV-PET-144'), 'petition')
    expect(c.unreadStages).toBe(0)
    expect(c.disposal).toEqual({
      kind: 'volksanwaltschaft',
      date: '2012-03-12',
      to: null,
      vote: null,
      majorityOnly: false,
      report: { citation: '1688 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXIV/I/1688' },
    })
    expect(c.plenary).toMatchObject({ kind: 'uebermittlung-zugestimmt', date: '2012-03-29', vote: { for: ['SPÖ', 'ÖVP', 'GRÜNE', 'BZÖ'], against: ['FPÖ'] } })
    expect(c.end).toBe('plenum')
  })

  it('decides the state: agreed by the plenary, or the committee’s motion alone', () => {
    const root = { gp: 'XXIV', kind: 'petition', inr: 144 } as const
    expect(anliegenStateOf(root, readAnliegenCourse(content('XXIV-PET-144'), 'petition'), true))
      .toEqual({ kind: 'volksanwaltschaft', date: '2012-03-29', agreed: true })
    const moved = readAnliegenCourse(record([['12.03.2012', `${PB}: Antrag auf Übermittlung an Volksanwaltschaft`]]), 'petition')
    expect(moved.end).toBe('volksanwaltschaft')
    // The period's end does not override the motion.
    expect(anliegenStateOf(root, moved, true)).toEqual({ kind: 'volksanwaltschaft', date: '2012-03-12', agreed: false })
  })

  // In the Nationalrat the plenary step on this item is not the Volksbegehren's.
  it('counts the plenary’s agreement as unread on a Volksbegehren', () => {
    const c = readAnliegenCourse(record([['29.03.2012', '150. Sitzung des Nationalrates: Antrag, der Übermittlung an die Volksanwaltschaft zuzustimmen, <b>angenommen</b>']]), 'volksbegehren')
    expect(c.plenary).toBeNull()
    expect(c.unreadStages).toBe(1)
  })

  it('words the page: headline, rail, and what the page cannot show (XXIV/PET/144)', () => {
    const d = detail('XXIV-PET-144')
    const view = anliegenView(d)
    expect(view.headline).toEqual({ kind: 'volksanwaltschaft', text: 'An die Volksanwaltschaft übermittelt', link: null })
    expect(view.rail.map(line)).toEqual([
      // `frak_code` „B": not in `CLUB_NAMES` (read on GP XXVIII), so no club is named rather than a bare letter.
      'Eingebracht [done] — am 05.12.2011 · überreicht von einem Mitglied des Nationalrates (BZÖ)',
      `${PB} [done] — zugewiesen am 06.12.2011 · 1 Sitzung am 12.03.2012`,
      'Erledigung im Ausschuss [done] — Übermittlung an die Volksanwaltschaft beantragt am 12.03.2012',
      'Nationalrat* [done] — Der Übermittlung an die Volksanwaltschaft am 29.03.2012 zugestimmt · dafür: SPÖ, ÖVP, GRÜNE, BZÖ · dagegen: FPÖ',
    ])
    expect(view.notShown).toContainEqual({
      lead: 'Was die Volksanwaltschaft mit dem Anliegen getan hat:',
      text: 'Der Verlauf des Parlaments endet mit der Übermittlung.',
    })
    // A Kenntnisnahme's gap is not this item's.
    expect(view.notShown.map((n) => n.lead)).not.toContain('Warum der Ausschuss zur Kenntnis genommen hat:')
  })

  it('says nothing of the Volksanwaltschaft’s work where only the motion stands', () => {
    const c = record([['12.03.2012', `${PB}: Antrag auf Übermittlung an Volksanwaltschaft`]], { ityp: 'PET', title: 'Eine Petition' })
    const d = { ...assembleAnliegenDetail({ gp: 'XXIV', kind: 'petition', inr: 1 }, c, { statements: null, support: null }), periodEnded: true }
    expect(anliegenHeadline(d).text).toBe('Übermittlung an die Volksanwaltschaft beantragt')
    expect(anliegenNotShown(d).map((n) => n.lead)).not.toContain('Was die Volksanwaltschaft mit dem Anliegen getan hat:')
  })

  // The row's grey box: the state on the first line, its day on the second.
  it('words the list row in two lines (XXIV/PET/144)', () => {
    const row = rowOf('XXIV-PET-144')
    expect(anliegenRowView(row).state).toEqual({ label: 'An die Volksanwaltschaft übermittelt', detail: '29.03.2012', tone: 'inactive', actionable: false })
    expect(anliegenRowStateDe(row)).toBe('An die Volksanwaltschaft übermittelt · 29.03.2012')
  })
})

describe('no name of a person survives the older records', () => {
  // Members named in their own motions, as the records of the Nationalrat carry them.
  const motions: AnliegenContent = record([
    ['10.07.2014', '<a href="/gegenstand/XXV/NRSITZ/37">37. Sitzung des Nationalrates</a>: Unselbständiger Entschließungsantrag der Abgeordneten <a href="/person/0" target="_blank">Abgeordnete Platzhalter</a> , Kolleginnen und Kollegen betreffend Etwas (223/UEA)<br>abgelehnt'],
    ['10.07.2014', '<a href="/gegenstand/XXIV/NRSITZ/1">1. Sitzung des Nationalrates</a>: Antrag der Abgeordneten <a href="/person/0" target="_blank">Antragsteller Platzhalter</a>, Kolleginnen und Kollegen auf Rückverweisung an den Verfassungsausschuss (12/GO) abgelehnt'],
    ['09.07.2003', `${PB}: auf Tagesordnung in der 4. Sitzung des Ausschusses<br>Petition Nr. 11 betreffend "Etwas",überreicht von den Abgeordneten Mitglied Platzhalter und Mitglied Zweitplatzhalter`],
  ], { ityp: 'PET', title: 'Autobahn - Ortsdurchfahrt, überreicht vom Abgeordneten Mitglied Platzhalter' })

  it('cuts members’ motions and the presenter in a title or a line, and reads the same course', () => {
    const reduced = reduceAnliegenContent(motions)
    const text = JSON.stringify(reduced)
    expect(text).not.toContain('Platzhalter')
    expect(text).toContain('37. Sitzung des Nationalrates: Unselbständiger Entschließungsantrag der Abgeordneten (gekürzt)')
    expect(text).toContain('1. Sitzung des Nationalrates: Antrag der Abgeordneten (gekürzt) (12/GO)')
    expect(reduced?.title).toBe('Autobahn - Ortsdurchfahrt')
    expect(readAnliegenCourse(reduced, 'petition')).toEqual(readAnliegenCourse(motions, 'petition'))
    const d = assembleAnliegenDetail({ gp: 'XXII', kind: 'petition', inr: 11 }, motions, { statements: null, support: null })
    expect(JSON.stringify(anliegenView(d))).not.toContain('Platzhalter')
  })

  // list 101's title passes the same cut (`getAnliegenOfKind`).
  it('cuts the presenter from a title as list 101 gives it (XXII/PET/64)', () => {
    expect(anliegenTitleOf(content('XXII-PET-64').title)).toBe('Autobahn - Ortsdurchfahrt von Altlengbach (Bereich A1 Knoten Steinhäusl)')
    expect(anliegenTitleOf('Eine Petition ohne Zusatz')).toBe('Eine Petition ohne Zusatz')
  })

  // Every placeholder of every fixture — names[], members, authors and headlines — against
  // the record as the cache keeps it, the detail and the page.
  it.each(FIXTURES)('lets no placeholder of %s through', (name) => {
    const raw = content(name)
    const d = detail(name)
    for (const out of [JSON.stringify(reduceAnliegenContent(raw)), JSON.stringify(d), JSON.stringify(anliegenView(d)), JSON.stringify(anliegenRowView(rowOf(name)))]) {
      expect(out).not.toContain('Platzhalter')
    }
    expect(readAnliegenCourse(reduceAnliegenContent(raw), kindOf(name))).toEqual(d.course)
  })

  // 80/PET XXII: 19 media references, each cut to one line in the record.
  it('cuts every media reference to „siehe auch (gekürzt)“ (XXII/PET/80)', () => {
    const reduced = reduceAnliegenContent(content('XXII-PET-80'))
    const lines = (reduced?.phase ?? []).flatMap((p) => p.stages ?? []).map((s) => s.text).filter((t) => t?.startsWith('siehe auch'))
    expect(lines).toHaveLength(19)
    expect(new Set(lines)).toEqual(new Set(['siehe auch (gekürzt)']))
    expect(JSON.stringify(reduced)).not.toContain('MED-K')
  })
})

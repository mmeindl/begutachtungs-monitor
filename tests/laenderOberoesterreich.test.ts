import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ooeFristOf, ooeLandtagOf, ooeStageOf, ooeStationSteps, parseOoeDetail, parseOoeGesetze, parseOoeVerordnungen } from '../server/utils/laender/oberoesterreich'
import { LandSourceError } from '../server/utils/laender/gate'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/laender/${name}-2026-10-22.html`, import.meta.url), 'utf8')
const HEADING = /Begutachtungsentw(?:ü|&uuml;)rfe von Landesgesetzen/

describe('Oberösterreich — the lists, as served on 22.10.2026', () => {
  it('reads each Gesetz with its Landtag number and a Frist written in words', () => {
    const gesetze = parseOoeGesetze(fixture('ooe-gesetze'), HEADING)
    expect(gesetze.map((g) => [g.id, g.deadline])).toEqual([
      ['ooe-2026-16124', '2026-11-09'],
      ['ooe-2026-16123', '2026-10-15'],
      ['ooe-2026-16122', '2026-09-25'],
      ['ooe-2026-16121', '2026-07-27'],
    ])
    // The SessionID of the Land's links is dropped: the address stays stable.
    expect(gesetze[0]!.url).toBe('https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/InternetLtgBeilagenAnzeige2020.jsp?jahr=2026&nummer=16124')
  })

  it('reads the archive, which keeps the Frist of the closed ones', () => {
    expect(parseOoeGesetze(fixture('ooe-gesetze-archiv'), /Archiv der Begutachtungsentw/)).toHaveLength(87)
  })

  it('reads the Verordnungen with their Erläuterungen and plans as further documents', () => {
    const vo = parseOoeVerordnungen(fixture('ooe-verordnungen'))
    expect(vo).toHaveLength(7)
    const oedseen = vo.find((d) => d.id === 'ooe-v560552')!
    expect(oedseen.deadline).toBe('2026-10-20')
    expect(oedseen.documents.map((d) => d.title)).toEqual(['Entwurf', 'Erläuterungen', 'Plan - Anlage 1/1', 'Plan Anlage 1/2'])
  })

  it('reads every month name, März included', () => {
    expect(ooeFristOf('Begutachtungsfrist: 27. M&auml;rz 2026')).toBe('2026-03-27')
    expect(ooeFristOf('Begutachtungsfrist: 3. Jänner 2027')).toBe('2027-01-03')
  })

  it('refuses a page that is not the list', () => {
    expect(() => parseOoeGesetze('<html>Wartung</html>', HEADING)).toThrow(LandSourceError)
    expect(() => parseOoeVerordnungen('<html>Wartung</html>')).toThrow(LandSourceError)
  })
})

describe('Oberösterreich — the Landtag’s page of one draft', () => {
  it('reads the summary, the documents and that the form is open', () => {
    const d = parseOoeDetail(fixture('ooe-detail-16124'))!
    expect(d.title).toBe('Landesgesetz, mit dem das Oö. Umweltschutzgesetz 1996 geändert wird (Oö. Umweltschutzgesetz-Novelle 2026)')
    expect(d.summary).toHaveLength(12)
    expect(d.startedAt).toBe('2026-10-09')
    expect(d.documents.map((x) => x.title)).toEqual(['Begutachtungsentwurf', 'Textgegenüberstellung'])
    expect(d.formOpen).toBe(true)
  })

  it('reads the Stellungnahmen dated, withholding a private person and linking the Beilage behind a stub', () => {
    const d = parseOoeDetail(fixture('ooe-detail-16121'))!
    expect(d.statements).toHaveLength(11)
    expect(d.statements[0]).toMatchObject({ name: 'Bundesministerium für Inneres', date: '2026-07-09' })
    // „Ekber Gercek", published with consent by the Land; not by the monitor.
    expect(d.statements[3]).toMatchObject({ name: null, date: '2026-07-20' })
    expect(d.statements.find((s) => s.name === 'Caritas Oberösterreich')!.url).toContain('id=23175')
    expect(d.formOpen).toBe(false)
  })

  it('reads the Landtag’s steps in its own words', () => {
    const d = parseOoeDetail(fixture('ooe-detail-16121'))!
    expect(d.procedure[0]).toMatchObject({ date: '2026-09-28', label: 'Einlangen Regierungsvorlage Beilage 1454/2026' })
    expect(d.procedure.map((s) => s.label)).toContain('Zuweisung an Ausschuss für Gesundheit und Soziales')
  })

  it('says null for a number the Landtag cannot load, and refuses any other page', () => {
    expect(parseOoeDetail('<p>FEHLER: Informationen zur Landtagsbeilage konnten nicht geladen werden.</p>')).toBeNull()
    expect(() => parseOoeDetail('<html>Wartung</html>')).toThrow(LandSourceError)
  })
})

describe('Oberösterreich — what the Landtag did', () => {
  const step = (label: string, date = '2026-01-01') => ({ label, date, url: null })

  it('reads committee, report, motions and vote, each in the record’s words', () => {
    const l = ooeLandtagOf([
      step('Einlangen Regierungsvorlage Beilage 1390/2026'),
      step('Zuweisung an Ausschuss für Bauen und Naturschutz'),
      step('Einsetzung eines Unterausschusses Oö. Naturschutzgesetz-Novelle'),
      step('Ausschussbericht Beilage 1420/2026', '2026-06-25'),
      step('Abänderungsantrag Beilage 1430/2026 mehrstimmig abgelehnt - Dagegen: ÖVP, FPÖ / Dafür: SPÖ, GRÜNE'),
      step('Antrag angenommen - mehrstimmig (ÖVP, FPÖ, SPÖ, MFG und NEOS dafür; Grüne dagegen)', '2026-07-09'),
    ])!
    expect(l.committee).toBe('Ausschuss für Bauen und Naturschutz')
    expect(l.subcommittee).toBe(true)
    expect(l.report).toMatchObject({ label: 'Ausschussbericht Beilage 1420/2026', date: '2026-06-25' })
    expect(l.motions.map((m) => m.label)).toEqual(['Abänderungsantrag Beilage 1430/2026 mehrstimmig abgelehnt - Dagegen: ÖVP, FPÖ / Dafür: SPÖ, GRÜNE'])
    expect(l.decision).toEqual({ date: '2026-07-09', vote: 'mehrstimmig (ÖVP, FPÖ, SPÖ, MFG und NEOS dafür; Grüne dagegen)' })
  })

  it('says nothing it did not read: no committee, no decision', () => {
    expect(ooeLandtagOf([step('Einlangen Regierungsvorlage Beilage 1/2026')])).toEqual({
      committee: null, subcommittee: false, report: null, motions: [], decision: null,
    })
    expect(ooeLandtagOf([])).toBeNull()
  })

  it('links only the end where the record links only the end', () => {
    const d = parseOoeDetail(fixture('ooe-detail-16121'))!
    const eingang = d.procedure.find((s) => s.label.startsWith('Eingang in der'))!
    expect(eingang.linkText).toBe('Wortprotokolle des Oö. Landtags')
    expect(eingang.label.endsWith('Wortprotokolle des Oö. Landtags')).toBe(true)
  })

  it('says „Antrag angenommen" once where the record typed it twice', () => {
    const html = `<div id="uebersicht">Langtitel:<div class="col-sm-10">Oö. Testgesetz</div></div>
      <ul id="verfahren"><li><span class="col-sm-3 datum">11.06.2026</span><span>Antrag angenommen - Antrag angenommen - Art VII mehrstimmig - Dafür: ÖVP</span></li></ul>`
    const d = parseOoeDetail(html)!
    expect(d.procedure[0]!.label).toBe('Antrag angenommen - Art VII mehrstimmig - Dafür: ÖVP')
    expect(ooeLandtagOf(d.procedure)!.decision!.vote).toBe('Art VII mehrstimmig - Dafür: ÖVP')
  })
})

describe('Oberösterreich — the station a draft reached', () => {
  const step = (label: string, date = '2026-01-01') => ({ label, date, url: null })

  it('takes the furthest step the Landtag recorded', () => {
    expect(ooeStageOf([])).toBeNull()
    expect(ooeStageOf([step('Einlangen Regierungsvorlage Beilage 1454/2026', '2026-09-28')]))
      .toEqual({ station: 'rv', label: 'Regierungsvorlage', detail: 'eingelangt am 28.09.2026', date: '2026-09-28' })
    expect(ooeStageOf([step('Einlangen Regierungsvorlage Beilage 1/2026'), step('Antrag angenommen - mehrstimmig - Dafür: ÖVP, FPÖ', '2026-03-05')]))
      .toMatchObject({ station: 'parlament', label: 'Im Landtag beschlossen', detail: 'mehrstimmig' })
    expect(ooeStageOf([step('Antrag angenommen - einstimmig'), step('Kundmachung im Landesgesetzblatt LGBl. Nr. 45/2026', '2026-04-01')]))
      .toEqual({ station: 'bgbl', label: 'Kundgemacht', detail: 'LGBl. Nr. 45/2026', date: '2026-04-01', url: 'https://www.ris.bka.gv.at/eli/lgbl/OB/2026/45' })
  })

  it('reads the Land’s „LGBI" with a capital I, 18 of 83 times', () => {
    expect(ooeStageOf([step('Kundmachung im Landesgesetzblatt LGBI. Nr. 7/2025')])!.detail).toBe('LGBl. Nr. 7/2025')
  })

  it('does not count a rejected amendment as the Landtag’s decision', () => {
    expect(ooeStageOf([step('Einlangen Regierungsvorlage Beilage 1/2026'), step('Abänderungsantrag Beilage 2/2026 mehrstimmig abgelehnt')])!.station).toBe('rv')
  })

  it('tags the one step per station the bar lands on — the last of its form', () => {
    const steps = [
      step('Einlangen Regierungsvorlage Beilage 1/2026'),
      step('Zuweisung an Ausschuss'),
      step('Antrag angenommen - einstimmig'),
      step('Antrag angenommen - mehrstimmig'),
    ]
    expect(ooeStationSteps(steps)).toEqual({ rv: 0, parlament: 3 })
    const d = parseOoeDetail(fixture('ooe-detail-16121'))!
    expect(d.procedure.filter((s) => s.station).map((s) => [s.station, s.label]))
      .toEqual([['rv', 'Einlangen Regierungsvorlage Beilage 1454/2026']])
  })

  it('reads the July draft as waiting in the Landtag’s committee: a Regierungsvorlage', () => {
    expect(ooeStageOf(parseOoeDetail(fixture('ooe-detail-16121'))!.procedure)!.station).toBe('rv')
  })
})

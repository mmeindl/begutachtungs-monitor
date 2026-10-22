import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ooeFristOf, parseOoeDetail, parseOoeGesetze, parseOoeVerordnungen } from '../server/utils/laender/oberoesterreich'
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

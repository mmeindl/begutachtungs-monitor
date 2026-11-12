/** Parliament's three-column working annex of an Antrag, read as two columns (`parlDionAnnex.ts`). */
import { describe, expect, it } from 'vitest'
import { parlDionTwoColumns } from '../server/utils/annex/parlDionAnnex'

const td = (s: string) => `<td valign=top><p class=51Abs>${s}</p></td>`
const doc = (rows: string[]) => `<html><body><table class=MsoTableGrid><thead><tr>${td('Geltende Fassung lt. BKA/RIS<br> (Bundesrecht konsolidiert)')}${td('Änderungen laut Antrag vom 09.07.2025')}${td('Eingearbeiteter Antrag<br> (konsolidierte Fassung)')}</tr></thead>${rows.join('')}</table></body></html>`

describe('parlDionTwoColumns', () => {
  it('keeps the column in force and the proposed wording, without the instructions and the deletions', () => {
    const html = doc([
      `<tr>${td('&nbsp;')}${td('Bundesgesetz, mit dem das Waffengesetz 1996 geändert wird')}${td('&nbsp;')}</tr>`,
      `<tr>${td('(2) … erst drei Werktage nach …')}${td('In § 33 Abs. 2 werden …')}${td('(2) … erst <span class=msoDel><del cite="x">drei Werktage</del></span><span class=msoIns><ins cite="x">nach Ablauf von vier Wochen</ins></span> nach …')}</tr>`,
    ])
    const out = parlDionTwoColumns(html)!
    expect(out).toContain('<td><p>Geltende Fassung</p></td><td><p>Vorgeschlagene Fassung</p></td>')
    expect(out).not.toContain('In § 33 Abs. 2 werden')
    expect(out).toContain('nach Ablauf von vier Wochen')
    expect(out).not.toContain('drei Werktage</del>')
    expect(out.match(/drei Werktage/g)).toHaveLength(1) // only the column in force
  })
  it('refuses another shape', () => {
    expect(parlDionTwoColumns('<table><tr><td>Geltende Fassung</td><td>Vorgeschlagene Fassung</td></tr></table>')).toBeNull()
    expect(parlDionTwoColumns(doc([`<tr>${td('a')}${td('b')}</tr>`]))).toBeNull()
  })
})

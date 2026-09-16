import { describe, expect, it } from 'vitest'
import { MIN_DRAFTS_WITH_ANNEX, classAFindings, summarize, type AnnexDraftReport, type AnnexReport } from '../scripts/annex-report'

/**
 * Der Alarm selbst, gegen erfundene Berichte.
 *
 * Erfunden ist hier richtig: Klasse A prüft Zusicherungen, und eine
 * Zusicherung lässt sich nur dadurch testen, dass man sie bricht — im echten
 * Korpus ist heute jede davon erfüllt (gemessen 16.09.2026, beide Pfade),
 * ein Test gegen echte Daten wäre also ein Test, der nie etwas beweist.
 * Dasselbe Argument wie bei der Fehlerinjektion in
 * `scripts/annex-fault-injection.ts`: das Tor zeigt seine Schärfe nur an
 * Fehlern, die man hineinlegt.
 */

/** Ein Entwurf, an dem nichts auszusetzen ist. */
const sound = (over: Partial<AnnexDraftReport> = {}): AnnexDraftReport => ({
  cite: '42/ME',
  source: 'xml',
  note: null,
  checked: 12,
  clean: 12,
  substantial: 12,
  substantialClean: 12,
  noLaw: 0,
  droppedPages: 0,
  ran: true,
  notRunReason: null,
  verifiedParas: 10,
  withheldParas: 2,
  withheldStanding: 2,
  withheldAlreadyStanding: 0,
  withheldNotInDraft: 0,
  uncheckedParas: 5,
  rowsNoPara: 3,
  changeRowsNoPara: 1,
  verdictless: 0,
  wronglyVerified: 0,
  withheldWithText: 0,
  withheldWithoutCause: 0,
  ...over,
})

/** Ein Lauf, der die Schwelle sicher überschreitet. */
const report = (drafts: AnnexDraftReport[], over: Partial<AnnexReport> = {}): AnnexReport => ({
  at: '2026-09-16T09:00:00.000Z',
  gp: 'XXVIII',
  path: 'xml',
  limit: 400,
  records: 400,
  drafts: [...drafts, ...Array.from({ length: MIN_DRAFTS_WITH_ANNEX }, (_, i) => sound({ cite: `${i}/ME` }))],
  ...over,
})

describe('Klasse A schweigt, wo nichts ist', () => {
  it('meldet über einem gesunden Lauf nichts', () => {
    expect(classAFindings(report([]))).toEqual([])
  })

  it('duldet die Kennzahlen, die heute nicht null sind', () => {
    // `changeRowsNoPara` 75 und `noLaw` 12 stehen am 16.09.2026 auf dem
    // Tabellenpfad — als Klasse-A-Regel hätten sie beim ersten Lauf
    // angeschlagen. Sie gehören in Klasse B, und dieser Test hält fest,
    // dass sie hier bewusst nichts auslösen.
    expect(classAFindings(report([sound({ changeRowsNoPara: 75, noLaw: 12 })]))).toEqual([])
  })
})

describe('die vier Zusicherungen des Tors', () => {
  const cases: [keyof AnnexDraftReport, string][] = [
    ['verdictless', 'ohne Urteil'],
    ['wronglyVerified', 'als geprüft ausgeliefert'],
    ['withheldWithText', 'tragen noch ihren Text'],
    ['withheldWithoutCause', 'ohne einen Grund'],
  ]
  for (const [field, phrase] of cases) {
    it(`schlägt an, wenn \`${field}\` nicht null ist`, () => {
      const found = classAFindings(report([sound({ cite: 'X/ME', [field]: 3 })]))
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ kind: 'zusicherung', draft: 'X/ME' })
      expect(found[0]!.text).toContain(phrase)
    })
  }

  it('verlangt, dass die Gründe der Einbehaltung aufgehen', () => {
    // Eine vierte Ursache, die niemand in die Summe aufnimmt, fiele sonst
    // lautlos aus der Kopie auf der Seite heraus.
    const found = classAFindings(report([sound({ cite: 'Y/ME', withheldParas: 5, withheldStanding: 2, withheldAlreadyStanding: 1, withheldNotInDraft: 1 })]))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'zusicherung', draft: 'Y/ME' })
    expect(found[0]!.text).toContain('summieren auf 4')
  })

  it('lässt eine aufgehende Summe in Ruhe', () => {
    expect(classAFindings(report([sound({ withheldParas: 7, withheldStanding: 4, withheldAlreadyStanding: 2, withheldNotInDraft: 1 })]))).toEqual([])
  })
})

describe('die Gestalt des Dokuments', () => {
  it('meldet eine nicht gelesene Seite als eigene Klasse', () => {
    const found = classAFindings(report([sound({ cite: 'Z/ME', droppedPages: 2 })]))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'form', draft: 'Z/ME' })
    expect(found[0]!.text).toContain('2 Seiten')
  })

  it('beugt die Einzahl', () => {
    expect(classAFindings(report([sound({ droppedPages: 1 })]))[0]!.text).toContain('1 Seite der Beilage wurde')
  })
})

describe('ein Lauf, der nichts gemessen hat', () => {
  it('meldet einen leeren RIS-Antwortsatz und hört dann auf', () => {
    // Nicht weiterprüfen: „0 Zusicherungen verletzt" über null Entwürfen ist
    // keine Entwarnung, und zwei Befunde über dieselbe Ursache sind Rauschen.
    const found = classAFindings({ ...report([]), records: 0, drafts: [] })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'messung', draft: null })
  })

  it('meldet einen geschrumpften Korpus, prüft aber weiter', () => {
    const found = classAFindings({
      ...report([]),
      drafts: [sound({ cite: 'A/ME', verdictless: 1 })],
    })
    expect(found.map((f) => f.kind)).toEqual(['messung', 'zusicherung'])
    expect(found[0]!.text).toContain(`Schwelle ${MIN_DRAFTS_WITH_ANNEX}`)
  })
})

describe('summarize', () => {
  it('nennt die Klassen, nicht die Zahl der Entwürfe', () => {
    expect(summarize([])).toBe('ohne Befund')
    expect(
      summarize([
        { kind: 'form', draft: 'a', text: '' },
        { kind: 'zusicherung', draft: 'b', text: '' },
        { kind: 'form', draft: 'c', text: '' },
      ]),
    ).toBe('1× Zusicherung, 2× Gestalt')
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_BASELINE_AGE_DAYS, MIN_DRAFTS_WITH_ANNEX, classAFindings, classBFindings, maintenanceFindings, summarize, toBaseline, type AnnexDraftReport, type AnnexReport } from '../scripts/lib/annexReport'

/**
 * Der Alarm selbst, gegen erfundene Berichte.
 *
 * Erfunden ist hier richtig: Klasse A prüft Zusicherungen, und eine
 * Zusicherung lässt sich nur dadurch testen, dass man sie bricht — im echten
 * Korpus ist heute jede davon erfüllt (gemessen 16.09.2026, beide Pfade),
 * ein Test gegen echte Daten wäre also ein Test, der nie etwas beweist.
 * Dasselbe Argument wie bei der Fehlerinjektion in
 * `scripts/harness/faultInjection.ts`: das Tor zeigt seine Schärfe nur an
 * Fehlern, die man hineinlegt.
 */

/** Ein Entwurf, an dem nichts auszusetzen ist. */
const sound = (over: Partial<AnnexDraftReport> = {}): AnnexDraftReport => ({
  id: 'BEGUT_0000',
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
  drafts: [...drafts, ...Array.from({ length: MIN_DRAFTS_WITH_ANNEX }, (_, i) => sound({ id: `BEGUT_F${i}`, cite: `${i}/ME` }))],
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

describe('Klasse B: der Entwurf, den wir schon einmal gemessen haben', () => {
  const before = report([sound({ id: 'BEGUT_A', cite: 'A/ME', verifiedParas: 10 })])
  const baseline = toBaseline([before])

  it('schweigt, wenn sich nichts bewegt hat', () => {
    expect(classBFindings(before, baseline)).toEqual([])
  })

  it('meldet einen Entwurf, dessen Zahlen sich bewegt haben', () => {
    const now = report([sound({ id: 'BEGUT_A', cite: 'A/ME', verifiedParas: 8, withheldParas: 4, withheldStanding: 4 })])
    const found = classBFindings(now, baseline)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'grundlinie', draft: 'A/ME' })
    expect(found[0]!.text).toContain('bestätigt: 10 → 8')
    expect(found[0]!.text).toContain('einbehalten: 2 → 4')
  })

  it('fasst einen Entwurf zu einem Befund zusammen, nicht zu einem je Feld', () => {
    // Ein verschobener Parse bewegt ein Dutzend Zähler auf einmal.
    const now = report([sound({ id: 'BEGUT_A', cite: 'A/ME', checked: 1, clean: 1, substantial: 1, substantialClean: 1, verifiedParas: 1, uncheckedParas: 99 })])
    expect(classBFindings(now, baseline)).toHaveLength(1)
  })

  it('lässt einen neuen Entwurf in Ruhe', () => {
    // Neu heißt: für ihn gilt Klasse A und sonst nichts.
    const now = report([sound({ id: 'BEGUT_NEU', cite: 'N/ME', verifiedParas: 3, withheldParas: 0, withheldStanding: 0 })])
    expect(classBFindings(now, baseline)).toEqual([])
  })

  it('meldet nicht, dass ein Entwurf aus dem Fenster gerutscht ist', () => {
    // Das ist der Normalfall des wandernden Fensters, keine Meldung.
    const now = { ...report([]), drafts: report([]).drafts.slice(0, 5) }
    expect(classBFindings(now, baseline).filter((f) => f.draft !== null)).toEqual([])
  })

  it('sagt es, wenn die Grundlinie den Pfad gar nicht kennt', () => {
    const found = classBFindings({ ...before, path: 'pdf' }, baseline)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'grundlinie', draft: null })
    expect(found[0]!.text).toContain('PDF-Pfad')
  })

  it('hält die beiden Pfade auseinander', () => {
    const both = toBaseline([before, { ...before, path: 'pdf' }])
    expect(Object.keys(both.paths.xml).length).toBe(Object.keys(both.paths.pdf).length)
    expect(both.paths.xml['BEGUT_A']).toMatchObject({ cite: 'A/ME', verifiedParas: 10 })
  })
})

describe('Wartung: die Grundlinie mahnt sich selbst an', () => {
  const baseline = (at: string) => ({ ...toBaseline([report([sound({ id: 'BEGUT_A' })])]), at })
  const day = (n: number) => new Date(Date.UTC(2026, 8, 17) + n * 86_400_000)
  const on = (ageDays: number) => maintenanceFindings(baseline(day(-ageDays).toISOString()), day(0))

  it('schweigt, solange die Grundlinie frisch ist', () => {
    expect(on(0)).toEqual([])
    expect(on(MAX_BASELINE_AGE_DAYS - 1)).toEqual([])
  })

  it('mahnt an der Schwelle, nicht erst danach', () => {
    const found = on(MAX_BASELINE_AGE_DAYS)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'wartung', draft: null })
  })

  it('nennt das Alter und den Befehl, mit dem es zu beheben ist', () => {
    const text = on(90)[0]!.text
    expect(text).toContain('90 Tage alt')
    expect(text).toContain('--grundlinie-schreiben=tests/fixtures/annex-baseline.json')
    // Keine Panik: nichts ist kaputt, nur ungenutzt.
    expect(text).toContain('Nichts ist kaputt')
  })

  it('mahnt nur einmal, nicht je Pfad', () => {
    // Die Grundlinie ist EINE Datei für beide Pfade.
    expect(on(90)).toHaveLength(1)
  })

  it('meldet eine Grundlinie ohne lesbares Datum', () => {
    const found = maintenanceFindings(baseline('irgendwann'), day(0))
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('kein lesbares Datum')
  })

  it('verlangt ohne Grundlinie keine Wartung', () => {
    // Ohne `--grundlinie` prüft Klasse B nichts; das sagt der Lauf separat.
    expect(maintenanceFindings(null, day(0))).toEqual([])
  })

  it('zählt in der Zusammenfassung als eigene Klasse', () => {
    expect(summarize(on(90))).toBe('1× Wartung')
  })
})

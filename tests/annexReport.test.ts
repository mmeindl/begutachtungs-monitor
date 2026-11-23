import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_BASELINE_AGE_DAYS, MAX_WINDOW_AGE_DAYS, MIN_DRAFTS_WITH_ANNEX, classAFindings, classBFindings, maintenanceFindings, reportHeading, summarize, toBaseline, windowLine, windowOf, type AnnexBaseline, type AnnexDraftReport, type AnnexReport } from '../scripts/lib/annexReport'

/**
 * The alarm itself, against invented reports.
 *
 * Invented is right here: class A checks assurances, and an assurance can
 * only be tested by breaking it — in the real corpus every one of them holds
 * today (measured 16.09.2026, both paths), so a test against real data would
 * be a test that never proves anything. The same argument as with the fault
 * injection in `scripts/harness/faultInjection.ts`: a gate shows its edge
 * only on faults somebody puts in.
 */

/** A draft there is nothing to complain about. */
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

/** A run that safely clears the threshold. */
const report = (drafts: AnnexDraftReport[], over: Partial<AnnexReport> = {}): AnnexReport => ({
  at: '2026-09-16T09:00:00.000Z',
  gp: 'XXVIII',
  path: 'xml',
  limit: 400,
  records: 400,
  window: { newest: '2026-09-15', oldest: '2024-04-29', listFetchedAt: '2026-09-16T08:55:00.000Z', fromCache: false },
  drafts: [...drafts, ...Array.from({ length: MIN_DRAFTS_WITH_ANNEX }, (_, i) => sound({ id: `BEGUT_F${i}`, cite: `${i}/ME` }))],
  ...over,
})

describe('Klasse A schweigt, wo nichts ist', () => {
  it('meldet über einem gesunden Lauf nichts', () => {
    expect(classAFindings(report([]))).toEqual([])
  })

  it('duldet die Kennzahlen, die heute nicht null sind', () => {
    // `changeRowsNoPara` 75 and `noLaw` 12 stand on the table path on
    // 16.09.2026 — as a class-A rule they would have fired on the first run.
    // They belong in class B, and this test records that they deliberately
    // trigger nothing here.
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
    // A fourth cause that nobody adds to the sum would otherwise drop out of
    // the page's copy silently.
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

  // 19.11.2026: the Methodenverordnung Wasser's 72 pages, known and said on
  // the page, held the weekly issue open for good.
  it('schweigt zu einer Gestalt, die die Grundlinie mit genau diesen Seiten kennt', () => {
    const r = report([sound({ cite: 'Z/ME', droppedPages: 72 })])
    const known = toBaseline([r])
    expect(classAFindings(r, known)).toEqual([])
    const more = report([sound({ cite: 'Z/ME', droppedPages: 80 })])
    expect(classAFindings(more, known)[0]).toMatchObject({ kind: 'form', draft: 'Z/ME' })
  })

  it('beugt die Einzahl', () => {
    expect(classAFindings(report([sound({ droppedPages: 1 })]))[0]!.text).toContain('1 Seite der Beilage wurde')
  })
})

describe('ein Lauf, der nichts gemessen hat', () => {
  it('meldet einen leeren RIS-Antwortsatz und hört dann auf', () => {
    // Do not check on: „0 Zusicherungen verletzt" over zero drafts is no
    // all-clear, and two findings about one cause are noise.
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
    // A shifted parse moves a dozen counters at once.
    const now = report([sound({ id: 'BEGUT_A', cite: 'A/ME', checked: 1, clean: 1, substantial: 1, substantialClean: 1, verifiedParas: 1, uncheckedParas: 99 })])
    expect(classBFindings(now, baseline)).toHaveLength(1)
  })

  it('lässt einen neuen Entwurf in Ruhe', () => {
    // New means: class A applies to it and nothing else.
    const now = report([sound({ id: 'BEGUT_NEU', cite: 'N/ME', verifiedParas: 3, withheldParas: 0, withheldStanding: 0 })])
    expect(classBFindings(now, baseline)).toEqual([])
  })

  it('meldet nicht, dass ein Entwurf aus dem Fenster gerutscht ist', () => {
    // That is the normal case of the moving window, not a report.
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
    // No panic: nothing is broken, only unused.
    expect(text).toContain('Nichts ist kaputt')
  })

  it('mahnt nur einmal, nicht je Pfad', () => {
    // The baseline is ONE file for both paths.
    expect(on(90)).toHaveLength(1)
  })

  it('meldet eine Grundlinie ohne lesbares Datum', () => {
    const found = maintenanceFindings(baseline('irgendwann'), day(0))
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('kein lesbares Datum')
  })

  it('verlangt ohne Grundlinie keine Wartung', () => {
    // Without `--grundlinie` class B checks nothing; the run says so separately.
    expect(maintenanceFindings(null, day(0))).toEqual([])
  })

  it('zählt in der Zusammenfassung als eigene Klasse', () => {
    expect(summarize(on(90))).toBe('1× Wartung')
  })
})

describe('das Fenster eines Laufs', () => {
  const record = (beginn: string | undefined) => ({ Data: { Metadaten: { Bundesrecht: { Begut: beginn === undefined ? {} : { BeginnBegutachtungsfrist: beginn } } } } })
  const sept = new Date('2026-09-09T14:49:43.948Z')
  const later = new Date('2026-09-09T22:09:20.410Z')

  it('nimmt den jüngsten und den ältesten Beginn der gelesenen Datensätze', () => {
    const w = windowOf([record('2026-03-05'), record('2026-09-08'), record(undefined), record('2024-04-29')], [{ fromCache: false, fetchedAt: sept }])
    expect(w).toEqual({ newest: '2026-09-08', oldest: '2024-04-29', listFetchedAt: sept.toISOString(), fromCache: false })
  })

  it('ist so alt wie seine älteste Seite, und aus dem Cache, sobald eine Seite es ist', () => {
    const w = windowOf([record('2026-09-08')], [{ fromCache: false, fetchedAt: later }, { fromCache: true, fetchedAt: sept }])
    expect(w.listFetchedAt).toBe(sept.toISOString())
    expect(w.fromCache).toBe(true)
  })

  it('sagt, was es nicht weiß, statt zu raten', () => {
    // A Beginn RIS writes in another shape is not read as a date.
    expect(windowOf([record('08.09.2026'), record(undefined)], [])).toEqual({ newest: null, oldest: null, listFetchedAt: null, fromCache: false })
  })

  it('steht in einer Zeile: Beginn von–bis und woher die Liste kam', () => {
    expect(windowLine({ newest: '2026-09-08', oldest: '2024-04-29', listFetchedAt: sept.toISOString(), fromCache: true })).toBe('Beginn 29.04.2024 bis 08.09.2026, Liste aus dem Cache, abgerufen am 09.09.2026')
    expect(windowLine({ newest: '2026-11-19', oldest: '2025-01-02', listFetchedAt: '2026-11-20T08:00:00.000Z', fromCache: false })).toBe('Beginn 02.01.2025 bis 19.11.2026, Liste frisch abgerufen am 20.11.2026')
    expect(windowLine({ newest: null, oldest: null, listFetchedAt: null, fromCache: false })).toBe('Beginn unbekannt, Abruf der Liste unbekannt')
  })
})

describe('der Kopf eines Berichts', () => {
  it('nennt Pfad, Lauf und Fenster', () => {
    const r = report([], { window: { newest: '2026-09-08', oldest: '2024-04-29', listFetchedAt: '2026-09-09T14:49:43.948Z', fromCache: true } })
    expect(reportHeading(r)).toBe(`Tabellenpfad (GP XXVIII, ${r.drafts.length} Entwürfe mit Beilage, gemessen 2026-09-16; Beginn 29.04.2024 bis 08.09.2026, Liste aus dem Cache, abgerufen am 09.09.2026)`)
  })

  it('sagt es, wenn ein älterer Bericht sein Fenster nicht kennt', () => {
    const { window: _, ...older } = report([], { path: 'pdf' })
    expect(reportHeading(older)).toContain('PDF-Pfad')
    expect(reportHeading(older)).toContain('Fenster nicht im Bericht')
  })
})

describe('ein Fenster, das stehen geblieben ist', () => {
  // The list of 09.09.2026, replayed from the cache on 20.11.2026: every
  // round in between measured it, and the alarm could not see a new draft.
  const at = '2026-11-20T05:23:00.000Z'
  const stale = { newest: '2026-09-08', oldest: '2024-04-29', listFetchedAt: '2026-09-09T14:49:43.948Z', fromCache: true }

  it('meldet ein Fenster, dessen jüngster Beginn mehr als 35 Tage vor dem Lauf liegt', () => {
    const found = classAFindings(report([], { at, window: stale }))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'messung', draft: null })
    expect(found[0]!.text).toMatch(/^Fenster veraltet/)
    expect(found[0]!.text).toContain('08.09.2026, 73 Tage vor diesem Lauf')
    expect(found[0]!.text).toContain('aus dem Cache')
    // The reason, not only the fact: only a new draft can show a new layout.
    expect(found[0]!.text).toContain('neue Gestalt')
  })

  it('zählt die Schwelle mit: 35 Tage sind noch kein Befund, 36 sind einer', () => {
    expect(MAX_WINDOW_AGE_DAYS).toBe(35)
    const window = (newest: string) => ({ ...stale, newest, fromCache: false })
    expect(classAFindings(report([], { at, window: window('2026-10-16') }))).toEqual([])
    expect(classAFindings(report([], { at, window: window('2026-10-15') }))[0]!.text).toMatch(/^Fenster veraltet/)
  })

  it('sagt es, wenn ein Bericht sein Fenster nicht kennt, statt es für frisch zu halten', () => {
    const { window: _, ...older } = report([])
    const found = classAFindings(older)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'messung', draft: null })
    expect(found[0]!.text).toMatch(/^Fenster unbekannt/)
    const undated = classAFindings(report([], { window: { ...stale, newest: null, oldest: null } }))
    expect(undated[0]!.text).toMatch(/^Fenster unbekannt/)
  })

  it('prüft die Entwürfe trotzdem', () => {
    const found = classAFindings(report([sound({ cite: 'A/ME', verdictless: 1 })], { at, window: stale }))
    expect(found.map((f) => f.kind)).toEqual(['messung', 'zusicherung'])
  })
})

describe('Klasse B: die Felder, die der Bericht seit dem 19.11.2026 trägt', () => {
  const fields = { lostDiffering: 2, frontMatterLaws: 1, withheldRepealUnproven: 1, withheldRepeated: 1 } as const
  const now = sound({ id: 'BEGUT_A', cite: 'A/ME', withheldParas: 4, withheldStanding: 1, ...fields })

  it('vergleicht sie, wo die Grundlinie sie hält', () => {
    const baseline = toBaseline([report([sound({ id: 'BEGUT_A', cite: 'A/ME', withheldParas: 4, withheldStanding: 1, lostDiffering: 0, frontMatterLaws: 0, withheldRepealUnproven: 2, withheldRepeated: 0 })])])
    const found = classBFindings(report([now]), baseline)
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain('Spaltenzeilen ohne Zeile, von der anderen Spalte verschieden: 0 → 2')
    expect(found[0]!.text).toContain('Gesetze mit abweichendem Vorspann: 0 → 1')
    expect(found[0]!.text).toContain('einbehalten (als aufgehoben gezeigt, Aufhebung nicht angeordnet): 2 → 1')
    expect(found[0]!.text).toContain('einbehalten (mehrfach gedruckt, nicht zuzuordnen): 0 → 1')
  })

  it('zieht sie mit in die Grundlinie', () => {
    expect(toBaseline([report([now])]).paths.xml['BEGUT_A']).toMatchObject(fields)
  })

  it('vergleicht nicht, was eine ältere Grundlinie noch nicht hält', () => {
    const before = report([sound({ id: 'BEGUT_A', cite: 'A/ME', withheldParas: 4, withheldStanding: 1 })])
    expect(classBFindings(report([now]), toBaseline([before]))).toEqual([])
  })

  it('lässt die eingecheckte Grundlinie gelten, wie sie ist', () => {
    // Written from a CI artefact, and since 23.11.2026 it holds these four
    // fields too. Every draft it holds, measured exactly as it says, is no
    // finding.
    const fixture = JSON.parse(readFileSync('tests/fixtures/annex-baseline.json', 'utf8')) as AnnexBaseline
    for (const path of ['xml', 'pdf'] as const) {
      const drafts = Object.entries(fixture.paths[path]).map(([id, entry]) => ({ ...sound(), ...entry, id, source: path }))
      expect(drafts.length).toBeGreaterThan(MIN_DRAFTS_WITH_ANNEX)
      expect(classBFindings({ ...report([]), path, drafts }, fixture)).toEqual([])
    }
  })
})

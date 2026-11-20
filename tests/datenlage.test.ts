import { describe, expect, it } from 'vitest'
import {
  DATENLAGE_ANLIEGEN,
  DATENLAGE_EU,
  DATENLAGE_OBJECTS,
  DATENLAGE_FIGURES,
  DATENLAGE_LAW_STATES,
  DATENLAGE_PHASES,
  DATENLAGE_SOURCES,
  DATENLAGE_STATE_META,
  DATENLAGE_STATE_ORDER,
  DATENLAGE_STEP_KEYS,
  DATENLAGE_STEPS,
  datenlageByState,
  parseDatenlageView,
} from '../shared/utils/datenlage'
import { LAND_CODES } from '../shared/utils/laender'
import { COVERAGE_ROWS, LAND_COVERAGE } from '../shared/utils/laenderCoverage'
import type { LandCode } from '../shared/types'

const isLand = (key: string): key is LandCode => (LAND_CODES as readonly string[]).includes(key)

describe('datenlage', () => {
  it('gives every source a cell for every step', () => {
    for (const source of DATENLAGE_SOURCES) {
      expect(Object.keys(source.cells).sort()).toEqual([...DATENLAGE_STEP_KEYS].sort())
      for (const step of DATENLAGE_STEP_KEYS) {
        expect(source.cells[step].text.length, `${source.key}/${step}`).toBeGreaterThan(0)
        expect(DATENLAGE_STATE_ORDER).toContain(source.cells[step].state)
      }
    }
  })

  it('takes every Land cell text from LAND_COVERAGE, word for word', () => {
    for (const source of DATENLAGE_SOURCES.filter((s) => isLand(s.key))) {
      for (const row of COVERAGE_ROWS) {
        expect(source.cells[row.key].text).toBe(LAND_COVERAGE[source.key as LandCode].cells[row.key])
      }
    }
  })

  it('names the step as the Länder table does', () => {
    for (const row of COVERAGE_ROWS) {
      expect(DATENLAGE_STEPS.find((s) => s.key === row.key)?.label).toBe(row.label)
    }
  })

  it('never calls a „–" of the Länder table published', () => {
    for (const source of DATENLAGE_SOURCES.filter((s) => isLand(s.key))) {
      for (const row of COVERAGE_ROWS) {
        if (source.cells[row.key].text === '–') expect(source.cells[row.key].state).not.toBe('published')
      }
    }
  })

  it('lists the EU, the Bund, then every Land in alphabetical order, each once', () => {
    expect(DATENLAGE_SOURCES.map((s) => s.key)).toEqual(['eu', 'bund', ...LAND_CODES])
    const ids = DATENLAGE_SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puts every step in exactly one phase, and gives each a unique anchor', () => {
    const inPhases = DATENLAGE_PHASES.flatMap((p) => p.steps)
    expect([...inPhases].sort()).toEqual([...DATENLAGE_STEP_KEYS].sort())
    const anchors = [...DATENLAGE_STEPS.map((s) => s.id), ...DATENLAGE_SOURCES.map((s) => s.id), ...DATENLAGE_PHASES.map((p) => p.id)]
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('gives the Anliegen an das Parlament a block of their own, its anchor unique, every gap with its reason', () => {
    const anchors = [...DATENLAGE_STEPS.map((s) => s.id), ...DATENLAGE_SOURCES.map((s) => s.id), ...DATENLAGE_PHASES.map((p) => p.id)]
    expect(anchors).not.toContain(DATENLAGE_ANLIEGEN.id)
    expect(DATENLAGE_ANLIEGEN.link.href).toBe('/anliegen')
    expect(DATENLAGE_ANLIEGEN.covered.length).toBeGreaterThan(0)
    expect(DATENLAGE_ANLIEGEN.sources.join(' ')).toMatch(/Liste 101/)
    expect(DATENLAGE_ANLIEGEN.sources.join(' ')).toMatch(/Liste 143/)
    for (const gap of DATENLAGE_ANLIEGEN.notCovered) {
      expect(gap.what.length).toBeGreaterThan(0)
      expect(gap.why.length, gap.what).toBeGreaterThan(0)
    }
    for (const f of DATENLAGE_ANLIEGEN.figures) {
      expect(f.population.length).toBeGreaterThan(0)
      expect(f.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    }
  })

  it('gives the EU\'s lawmaking a block of its own, and no EU cell says nobody looked where the EU pages show it (16.11.2026)', () => {
    expect(DATENLAGE_OBJECTS).toEqual([DATENLAGE_EU, DATENLAGE_ANLIEGEN])
    const anchors = [...DATENLAGE_STEPS.map((s) => s.id), ...DATENLAGE_SOURCES.map((s) => s.id), ...DATENLAGE_PHASES.map((p) => p.id), ...DATENLAGE_OBJECTS.map((o) => o.id)]
    expect(new Set(anchors).size).toBe(anchors.length)
    for (const object of DATENLAGE_OBJECTS) {
      expect(object.covered.length).toBeGreaterThan(0)
      expect(object.sources.length).toBeGreaterThan(0)
      for (const gap of object.notCovered) expect(gap.why.length, gap.what).toBeGreaterThan(0)
      for (const f of object.figures) expect(f.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    }
    const eu = DATENLAGE_SOURCES.find((s) => s.key === 'eu')!
    // The windows, the feedback and the procedure are on the EU pages: „nicht erhoben" (legend: „Der Monitor zeigt es nicht") would be false.
    for (const step of ['frist', 'statements', 'statementCount', 'way'] as const) expect(eu.cells[step].state, step).toBe('ownObject')
    // The state names the block it points to, in the legend and in the cell.
    expect(DATENLAGE_STATE_META.ownObject.meaning).toContain(DATENLAGE_EU.name)
    expect(eu.cells.frist.reason).toContain(DATENLAGE_EU.name)
    expect(eu.summary).toContain(DATENLAGE_EU.name)
    // Only the EU has an object of its own beside its cells.
    for (const source of DATENLAGE_SOURCES.filter((s) => s.key !== 'eu')) {
      for (const step of DATENLAGE_STEP_KEYS) expect(source.cells[step].state, `${source.key}/${step}`).not.toBe('ownObject')
    }
  })

  it('has a meaning for every state', () => {
    for (const state of DATENLAGE_STATE_ORDER) expect(DATENLAGE_STATE_META[state].label).toBeTruthy()
  })

  it('groups a step by state without losing or doubling a source', () => {
    for (const step of DATENLAGE_STEP_KEYS) {
      const groups = datenlageByState(step)
      const keys = groups.flatMap((g) => g.entries.map((e) => e.source.key))
      expect(keys.sort()).toEqual(DATENLAGE_SOURCES.map((s) => s.key).sort())
      expect(groups.every((g) => g.entries.length > 0)).toBe(true)
    }
  })

  it('keeps every figure with its population and date, at a step that exists', () => {
    for (const f of DATENLAGE_FIGURES) {
      expect(DATENLAGE_STEP_KEYS).toContain(f.step)
      expect(f.population).toBeTruthy()
      expect(f.date).toMatch(/\d{4}/)
      if (f.source !== 'laender') expect(DATENLAGE_SOURCES.map((s) => s.key)).toContain(f.source)
    }
  })

  it('keeps the law step and the law states to each other (14.11.2026)', () => {
    for (const source of DATENLAGE_SOURCES) {
      for (const step of DATENLAGE_STEP_KEYS) {
        const isLaw = DATENLAGE_LAW_STATES.includes(source.cells[step].state)
        if (step === 'begutachtungRecht') expect(isLaw || source.cells[step].state === 'notSurveyed', source.key).toBe(true)
        else expect(isLaw, `${source.key}/${step}`).toBe(false)
      }
    }
  })

  it('a legal fact is nobody\'s gap, and no Länder-table row', () => {
    for (const state of DATENLAGE_LAW_STATES) expect(DATENLAGE_STATE_META[state].owner).toBeNull()
    expect(COVERAGE_ROWS.map((r) => r.key as string)).not.toContain('begutachtungRecht')
  })

  it('states the constitutions as read: required in K, N, St, T, V; soll/kann in B, O; nothing in S, W', () => {
    const state = (key: string) => DATENLAGE_SOURCES.find((s) => s.key === key)!.cells.begutachtungRecht.state
    for (const land of ['ktn', 'noe', 'stmk', 't', 'vbg']) expect(state(land), land).toBe('required')
    for (const land of ['bgld', 'ooe']) expect(state(land), land).toBe('optional')
    for (const land of ['sbg', 'w', 'bund']) expect(state(land), land).toBe('notRequired')
    expect(state('eu')).toBe('notSurveyed')
  })

  it('keeps the states datenlage-pruefung.md found against the sources (14.11.2026)', () => {
    const cell = (key: string, step: string) => DATENLAGE_SOURCES.find((s) => s.key === key)!.cells[step as keyof typeof DATENLAGE_SOURCES[number]['cells']]
    // Vorarlberg keeps closed drafts, their way and their Stellungnahmen on a page per
    // Gesetzesvorhaben: the monitor's gap, not the Land's.
    for (const step of ['archive', 'way', 'kundmachung', 'texts', 'statements']) {
      expect(cell('vbg', step).state, `vbg/${step}`).toBe('notRead')
      expect(DATENLAGE_STATE_META[cell('vbg', step).state].owner).toBe('monitor')
    }
    expect(cell('vbg', 'verordnungen').state).toBe('notSurveyed')
    expect(cell('stmk', 'archive').state).toBe('partlyRead')
    expect(cell('bgld', 'tgu').state).toBe('partial')
    expect(cell('t', 'kundmachung').state).toBe('partial')
    expect(cell('ooe', 'frist').state).toBe('partial')
    expect(cell('bund', 'way').state).toBe('partial')
    expect(cell('noe', 'statements').state).toBe('notRead')
    expect(cell('bgld', 'tgu').text).toBe('selten beigelegt')
    expect(cell('sbg', 'frist').text).toBe('ja, solange sie läuft')
  })

  it('never calls Vorarlberg\'s closed drafts, way or Stellungnahmen the Land\'s gap (14.11.2026)', () => {
    const vbg = DATENLAGE_SOURCES.find((s) => s.key === 'vbg')!
    for (const step of ['archive', 'way', 'kundmachung', 'texts', 'statements'] as const) {
      expect(DATENLAGE_STATE_META[vbg.cells[step].state].owner, `vbg/${step}`).not.toBe('source')
      expect(vbg.cells[step].text, `vbg/${step}`).not.toMatch(/^(?:–|nein|nicht auf der Seite)$/)
    }
  })

  it('says what is missing wherever a source or the monitor covers only part', () => {
    for (const source of DATENLAGE_SOURCES) {
      for (const step of DATENLAGE_STEP_KEYS) {
        const c = source.cells[step]
        if (['partial', 'partlyRead', 'notRead'].includes(c.state)) expect(c.reason, `${source.key}/${step}`).toBeTruthy()
      }
    }
  })

  it('reads the view from the query, defaulting to the sources', () => {
    expect(parseDatenlageView(undefined)).toBe('quelle')
    expect(parseDatenlageView('schritt')).toBe('schritt')
    expect(parseDatenlageView(['schritt'])).toBe('schritt')
    expect(parseDatenlageView('quatsch')).toBe('quelle')
  })
})

describe('what the text comparison would need', () => {
  it('takes every count from the measurement record, so the two pages never differ', async () => {
    const { datenlageBedarf } = await import('../shared/utils/datenlage')
    const { GENAUIGKEIT } = await import('../shared/utils/genauigkeit')
    const record = structuredClone(GENAUIGKEIT)
    record.lesefassung.funnel.causes = { ...record.lesefassung.funnel.causes, verweigert: 1234, 'anhang-ungeteilt': 77, 'anhang-schweigt': 66 }
    record.laender.stations = { ...record.laender.stations, unread: 44, withheld: 33 }
    const text = datenlageBedarf(record).flatMap((g) => g.needs.map((x) => x.today)).join(' ')
    for (const figure of ['1.234', '77', '66', '44', '33']) expect(text).toContain(figure)
  })

  it('names a need and what happens today, each a closed sentence, for Bund and Länder', async () => {
    const { datenlageBedarf } = await import('../shared/utils/datenlage')
    const groups = datenlageBedarf()
    expect(groups.map((g) => g.from)).toEqual(['Vom Bund', 'Von den Ländern'])
    for (const need of groups.flatMap((g) => g.needs)) {
      expect(need.what).not.toMatch(/[.:]$/)
      expect(need.today).toMatch(/\.$/)
      expect(`${need.what} ${need.today}`).not.toMatch(/undefined|NaN|Paragraf(?!h)/)
    }
  })
})

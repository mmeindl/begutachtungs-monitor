import { describe, expect, it } from 'vitest'
import {
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

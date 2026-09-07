import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyRisRecord,
  dateScore,
  daysBetween,
  dedupeMeRows,
  endScore,
  joinRisToMe,
  ministryCodeOf,
  ministryScore,
  normalizeTitleText,
  splitParliamentTitle,
  titleTokens,
  type MeListRow,
  type RisBegutRecord,
} from '../server/utils/risJoin'

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as T

interface MapRow {
  cite: string
  inr: number
  status: string
  tier: string | null
  risId: string | null
  duplicates: string[]
}
interface MapFile {
  ruleVersion: number
  counts: { status: Record<string, number>; tier: Record<string, number> }
  rows: MapRow[]
}

describe('title normalisation', () => {
  it('splits Parliament package abbreviations off the core title', () => {
    const { core, abks } = splitParliamentTitle('Sanktionengesetz 2024 – SanktG 2024; FATF-Prüfungsanpassungsgesetz 2024')
    expect(core).toBe('Sanktionengesetz 2024; FATF-Prüfungsanpassungsgesetz 2024')
    expect([...abks]).toEqual(['sanktg 2024'])
  })

  it('keeps long dash segments as title text', () => {
    const { core, abks } = splitParliamentTitle('Bundesgesetz über X – Anpassung der Fristen des Gesetzes')
    expect(core).toContain('Anpassung der Fristen')
    expect(abks.size).toBe(0)
  })

  it('normalises the Parliament prefix, ß and punctuation away', () => {
    expect(normalizeTitleText('Ministerialentwurf betreffend Straßenverkehrsordnung, Änderung (33. StVO-Novelle)')).toBe(
      'strassenverkehrsordnung änderung 33 stvo novelle',
    )
  })

  it('stems Genitive and splits -novelle compounds', () => {
    expect(titleTokens('Novelle des Eisenbahngesetzes; Eisenbahngesetznovelle 2021')).toEqual([
      'novelle',
      'eisenbahngesetz',
      'eisenbahngesetz',
      'novelle',
      '2021',
    ])
  })
})

describe('ministry and dates', () => {
  it('extracts the RIS ministry code and maps the two long-name variants', () => {
    expect(ministryCodeOf('BKA (Bundeskanzleramt)')).toBe('BKA')
    expect(ministryCodeOf('Bundesministerin für EU und Verfassung im Bundeskanzleramt')).toBe('BMEUV')
  })

  it('scores exact code 1, lineage 0.5, spelling variants as exact', () => {
    expect(ministryScore(new Set(['BMKÖS']), 'BMKOES')).toBe(1)
    expect(ministryScore(new Set(['BMK']), 'BMVIT')).toBe(0.5)
    expect(ministryScore(new Set(['BMF']), 'BMK')).toBe(0)
  })

  it('bands the Beginn offset and the Ende offset', () => {
    expect(daysBetween('2024-10-11', '2024-10-10')).toBe(-1)
    expect([0, -1, 1, -3, 3, -7, 7, -14, 8].map(dateScore)).toEqual([1, 1, 0.8, 0.8, 0.6, 0.6, 0.3, 0.3, 0])
    expect([null, 0, 3, 4].map(endScore)).toEqual([0, 1, 0.5, 0])
  })
})

describe('RIS record classification', () => {
  it('reads the type word from Titel first, then Kurztitel', () => {
    expect(classifyRisRecord({ kurztitel: 'Novelle des Flughafen-Bodenabfertigungsgesetzes', titel: 'Bundesgesetz, mit dem das Flughafen-Bodenabfertigungsgesetz geändert wird' })).toBe('gesetz')
    expect(classifyRisRecord({ kurztitel: 'Änderung der Kraftfahrgesetz-Durchführungsverordnung', titel: 'Verordnung, mit der die KDV geändert wird' })).toBe('verordnung')
    expect(classifyRisRecord({ kurztitel: 'Staatsvertrag über die Zusammenarbeit im Donauraum', titel: null })).toBe('other')
  })
})

describe('GP XXVII corpus regression (docs/ris-join.md)', () => {
  const ris = read<RisBegutRecord[]>('./fixtures/ris-begut-gp27.json')
  const meRows = read<MeListRow[]>('./fixtures/me-gp27.json')
  const expected = read<MapFile>('../data/ris-me-map-gp27.json')

  it('classifies the fixture like the corpus test did', () => {
    const counts: Record<string, number> = {}
    for (const r of ris) counts[classifyRisRecord(r)] = (counts[classifyRisRecord(r)] ?? 0) + 1
    expect(counts).toEqual({ gesetz: 346, verordnung: 647 })
  })

  it('collapses 353 list-81 rows into 350 MEs', () => {
    const mes = dedupeMeRows(meRows)
    expect(meRows).toHaveLength(353)
    expect(mes).toHaveLength(350)
    expect(mes.filter((m) => m.ministryCodes.length > 1)).toHaveLength(3)
  })

  it('reproduces the verified mapping row by row', () => {
    expect(expected.ruleVersion).toBe(1)
    const rows = joinRisToMe(dedupeMeRows(meRows), ris)
    const byInr = new Map(rows.map((r) => [r.inr, r]))
    const diffs: string[] = []
    for (const e of expected.rows) {
      const got = byInr.get(e.inr)
      if (!got) {
        diffs.push(`${e.cite}: missing`)
        continue
      }
      if (got.status !== e.status || got.tier !== e.tier || got.risId !== e.risId) {
        diffs.push(`${e.cite}: expected ${e.status}/${e.tier}/${e.risId} got ${got.status}/${got.tier}/${got.risId} (${got.reason ?? ''})`)
      } else if ([...got.duplicates].sort().join() !== [...e.duplicates].sort().join()) {
        diffs.push(`${e.cite}: duplicates differ`)
      }
    }
    expect(diffs, diffs.join('\n')).toEqual([])
    const status: Record<string, number> = {}
    for (const r of rows) status[r.status] = (status[r.status] ?? 0) + 1
    expect(status).toEqual(expected.counts.status)
  })
})

import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyRisRecord,
  dateScore,
  dedupeMeRows,
  endScore,
  joinRisToMe,
  JOIN_WEIGHTS,
  RULE_VERSION,
  type MeListRow,
  type RisBegutRecord,
} from '../server/utils/ris/risJoin'

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
  [k: string]: unknown
}

describe('score bands', () => {
  it('bands the Beginn offset and the Ende offset', () => {
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

describe('GP XXVII corpus regression', () => {
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
    const rows = joinRisToMe(dedupeMeRows(meRows), ris)
    if (process.env.REGEN_RIS_MAP) writeGp27Artefact(rows, expected)
    else expect(expected.ruleVersion).toBe(RULE_VERSION)
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

  it('keeps the 84/ME RIS-typo case as a match with a flagged Fristabweichung', () => {
    const row = joinRisToMe(dedupeMeRows(meRows), ris).find((r) => r.inr === 84)!
    expect(row.status).toBe('matched')
    expect(row.reason).toMatch(/^Fristabweichung/)
  })
})

describe('GP XXVIII first live run (07.09.2026)', () => {
  const ris = read<RisBegutRecord[]>('./fixtures/ris-begut-gp28.json')
  const meRows = read<MeListRow[]>('./fixtures/me-gp28.json')
  const rows = joinRisToMe(dedupeMeRows(meRows), ris)
  const byInr = new Map(rows.map((r) => [r.inr, r]))
  const chosen = (inr: number) => byInr.get(inr)!.candidates.find((c) => c.risId === byInr.get(inr)!.risId)!

  it('matches 130 of 132, one weak, one genuinely absent from RIS', () => {
    const status: Record<string, number> = {}
    for (const r of rows) status[r.status] = (status[r.status] ?? 0) + 1
    expect(status).toEqual({ matched: 130, matched_weak: 1, unmatched: 1 })
    expect(rows.filter((r) => r.status === 'ambiguous')).toHaveLength(0)
    expect(byInr.get(60)!.status).toBe('unmatched')
  })

  it('carries the three v2 cases', () => {
    // 56/ME: RIS Abkuerzung equals the Parliament title; Ende differs by a month
    expect(byInr.get(56)!.status).toBe('matched')
    expect(chosen(56).endOffset).toBe(31)
    expect(byInr.get(56)!.reason).toMatch(/^Fristabweichung/)
    // 12/ME: RIS published 18 days before Parliament's Einlangen, Ende equal
    expect(byInr.get(12)!.status).toBe('matched')
    expect(chosen(12).dateOffset).toBe(-18)
    // 11/ME: RIS title without a type word, class 'other', dates+ministry unique
    expect(byInr.get(11)!.status).toBe('matched_weak')
  })

  it('reads the BMEIF long name as a code', () => {
    expect(chosen(22).ministryScore).toBe(1)
  })
})

describe('a law whose own name carries a dash (149/ME XXVIII, 18.11.2026)', () => {
  // Same day, same Frist, same ministry: the law and the Verordnung to it.
  // Parliament's title is „Immissionsschutzgesetz – Luft 2027, IG-L 2027";
  // read as one abbreviation it matched neither, and the draft stood without
  // its RIS record while the record stood in the list of drafts without a
  // Parliament page.
  const stelle = 'BMLUK (Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft)'
  const ris: RisBegutRecord[] = [
    {
      id: 'BEGUT_5392E5A4_C590_4E4E_9DDF_5E57260B8F21',
      kurztitel: 'IG-L-BKV 2027',
      titel:
        'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft über die Beurteilung und Kontrolle der Luftqualität zum Immissionsschutzgesetz – Luft 2027',
      abk: null,
      stelle,
      beginn: '2026-10-22',
      ende: '2026-11-05',
    },
    {
      id: 'BEGUT_4CA1F0F2_538F_415A_80A7_1BBDB18339C7',
      kurztitel: 'IG-L 2027',
      titel: 'Bundesgesetz zum Schutz vor Immissionen durch Luftschadstoffe 2027',
      abk: null,
      stelle,
      beginn: '2026-10-22',
      ende: '2026-11-05',
    },
  ]
  const me: MeListRow = {
    gp: 'XXVIII',
    inr: 149,
    cite: '149/ME',
    title: 'Immissionsschutzgesetz – Luft 2027, IG-L 2027',
    ministryCode: 'BMLUK',
    arrival: '2026-10-22',
    frist: '2026-11-05',
  }

  it('matches the law, not the Verordnung beside it', () => {
    const [row] = joinRisToMe(dedupeMeRows([me]), ris)
    expect(row!.status).toBe('matched')
    expect(row!.risId).toBe('BEGUT_4CA1F0F2_538F_415A_80A7_1BBDB18339C7')
  })
})

/** REGEN_RIS_MAP=1 pnpm vitest run tests/risJoin.test.ts — rewrites the artefact from the current rule. */
function writeGp27Artefact(rows: ReturnType<typeof joinRisToMe>, previous: MapFile): void {
  const status: Record<string, number> = {}
  const tier: Record<string, number> = {}
  for (const r of rows) {
    status[r.status] = (status[r.status] ?? 0) + 1
    tier[String(r.tier)] = (tier[String(r.tier)] ?? 0) + 1
  }
  const out = {
    ...previous,
    ruleVersion: RULE_VERSION,
    weights: JOIN_WEIGHTS,
    counts: { status, tier },
    rows: [...rows]
      .sort((a, b) => a.inr - b.inr)
      .map((r) => {
        const c = r.candidates.find((x) => x.risId === r.risId) ?? null
        return {
          cite: r.cite,
          inr: r.inr,
          status: r.status,
          tier: r.tier,
          risId: r.risId,
          risKurztitel: c?.risKurztitel ?? null,
          score: c?.score ?? null,
          beginnOffsetDays: c?.dateOffset ?? null,
          endeOffsetDays: c?.endOffset ?? null,
          duplicates: r.duplicates,
          reason: r.reason,
        }
      }),
  }
  writeFileSync(new URL('../data/ris-me-map-gp27.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
}

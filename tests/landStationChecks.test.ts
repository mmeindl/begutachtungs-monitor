import { describe, expect, it } from 'vitest'
import { recurringRuns, type RunUnit } from '../scripts/lib/landStationChecks'

/* A changed unit of a station pair: its Land, its draft, and the runs the
   comparison shows inserted („+…") or removed („-…"). */
const unit = (land: string, draft: string, ...runs: string[]): RunUnit => ({
  land,
  draft,
  change: 'changed',
  segments: runs.map((r) => ({ type: r.startsWith('+') ? 'inserted' : 'removed', text: r.slice(1) })),
})

describe('recurringRuns — the same short run inserted or removed across a Land\'s drafts (20.11.2026)', () => {
  /* The shapes Kärnten's session stamp left in the station pairs before the
     reader dropped it (ktn-104907-2025-32 Artikel III Z 4 and Z 12: the stamp
     alone; Z 7: the stamp beside a real change). */
  const stamp = [
    unit('ktn', 'ktn-104907-2025-32', '+REG.SITZG.'),
    unit('ktn', 'ktn-104907-2025-32', '+REG.SITZG.', '+Nr.', '+2024/1233'),
    unit('ktn', 'ktn-18119-2023-83', '+REG.SITZG.', '-spätestens eine Woche', '+ehestmöglich'),
    unit('ktn', 'ktn-61525-2024-53', '+REG.SITZG.', '+REG.SITZG.'),
  ]

  it('finds a run in three drafts that is the only change of at least one unit, and names those units', () => {
    const [hit, ...rest] = recurringRuns(stamp)
    expect(rest).toEqual([])
    expect(hit).toMatchObject({ land: 'ktn', side: 'inserted', text: 'REG.SITZG.', drafts: 3, units: 4 })
    // The units it is the only change of, the run twice included.
    expect(hit!.only).toEqual([stamp[0], stamp[3]])
  })

  it('needs three drafts, not three units', () => {
    expect(recurringRuns(stamp.filter((u) => u.draft !== 'ktn-61525-2024-53'))).toEqual([])
  })

  it('needs the run to stand alone somewhere: beside real changes everywhere it proves nothing', () => {
    expect(recurringRuns([stamp[1]!, stamp[2]!, unit('ktn', 'ktn-1', '+REG.SITZG.', '-alt')])).toEqual([])
  })

  it('counts each Land and each side apart', () => {
    const mixed = [unit('ktn', 'ktn-1', '+REG.SITZG.'), unit('ktn', 'ktn-2', '-REG.SITZG.'), unit('sbg', 'sbg-3', '+REG.SITZG.')]
    expect(recurringRuns(mixed)).toEqual([])
  })

  it('leaves out a run with a digit or longer than 40 characters, and a unit that is not „geändert"', () => {
    const three = (run: string) => ['ktn-1', 'ktn-2', 'ktn-3'].map((d) => unit('ktn', d, run))
    expect(recurringRuns(three('+LGBl Nr 12/2025'))).toEqual([])
    expect(recurringRuns(three(`+${'Wortfolge '.repeat(5)}`))).toEqual([])
    expect(recurringRuns(three('+der')).map((r) => r.text)).toEqual(['der'])
    expect(recurringRuns(three('+REG.SITZG.').map((u) => ({ ...u, change: 'inserted' })))).toEqual([])
  })
})

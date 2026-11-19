import { describe, expect, it } from 'vitest'
import { segmentUnits, type TextBlock } from '../server/utils/lawtext/lawUnits'
import { instructionCensus } from '../scripts/lib/unitCensus'

const blk = (kind: TextBlock['kind'], text: string, gld: string | null = null): TextBlock => ({ kind, cls: '', text, gld })
const clause = blk('other', 'Das Testgesetz, BGBl. I Nr. 1/2000, wird wie folgt geändert:')
const census = (blocks: TextBlock[]) => instructionCensus(blocks, segmentUnits(blocks))

// Until 19.11.2026 the two were one class, „wiederholt", read from the ids.
describe('units census: a number printed twice and a number the reader gave twice are counted apart', () => {
  it('„2." printed twice by the source is wiederholt (Waffengesetz „82.", a draft\'s „Variante A/B")', () => {
    const c = census([
      clause,
      blk('novao', '1. In § 3 wird das Wort „a“ durch das Wort „b“ ersetzt.'),
      blk('novao', '2. § 69b Abs. 1 Z 5 lautet:'),
      blk('abs', '„5. neue Ziffer;“'),
      blk('novao', '2. § 69b Abs. 1 Z 7 lautet:'),
      blk('abs', '„7. andere Ziffer.“'),
    ])
    expect(c.dupIds).toMatchObject({ wiederholt: 1, verdoppelt: 0 })
  })

  it('an unnumbered first line promoted to „1." before the printed „1." is verdoppelt (c546ee7d, Parliament HTML)', () => {
    const c = census([
      clause,
      blk('novao', 'Das Inhaltsverzeichnis lautet:'),
      blk('novao', '1. Der Titel des Gesetzes lautet:'),
      blk('abs', '„Bundesgesetz über die Zusammenarbeit“'),
    ])
    expect(c.dupIds).toMatchObject({ wiederholt: 0, verdoppelt: 1 })
    expect(c.verdoppelt.map(({ unit, prev }) => [prev.id, unit.id])).toEqual([['Z1', 'Z1#dup']])
  })

  it('a table row „2.1 …" read as instruction 2 is verdoppelt, not printed twice (Salzburg OIB-VO, LGBl)', () => {
    const c = census([
      clause,
      blk('novao', '1. In § 1 wird das Wort „a“ durch das Wort „b“ ersetzt.'),
      blk('abs', '2.1 Brandschutz bei Betriebsbauten April 2019'),
      blk('novao', '2. Im § 2 lauten die Z 1 bis 4:'),
    ])
    expect(c.dupIds).toMatchObject({ wiederholt: 0, verdoppelt: 1 })
  })
})

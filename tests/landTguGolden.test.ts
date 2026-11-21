import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { LawDiffUnit } from '../shared/types'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import type { AnnexPage } from '../server/utils/annex/annexPdf'
import type { TguReading } from '../server/utils/laender/landTgu'
import { ktnTguReading } from '../server/utils/laender/landTguKaernten'
import { tguVerdicts, type TguVerdict } from '../scripts/lib/landTguGolden'

/**
 * Real Land documents, frozen — verdicts, not parses (21.11.2026).
 *
 * The Land guard's tests built their §§ and drafts by hand, and the
 * service's tests mock every read: a change to the draft rules that moved a
 * real verdict passed every push and showed only when somebody ran
 * `harness:land-guard` again. Here one document per layout the corpus holds
 * is replayed through the shipped decision: what the reader handed the
 * guard — the §§ `compareTgu` compared and the draft's blocks — and the
 * verdict of every § (shown, withheld with its reason, shown with „nicht
 * geprüft" and its reason). Between them they hold withheld `draftDiffers`
 * (Oö. 16101 § 19, Salzburg 34574 § 2, Wien 2026009 § 6: the draft's „3 000"
 * against the comparison's „2 500"), a mark of reason `unassigned` (Wien
 * 2026003 § 11d), and Tirol 722 §§ 15 and 24 shown, whose quoted range of
 * designations was a mark of reason `wording` until 21.11.2026. Kärnten, whose right
 * column the draft rules are not asked of, is frozen one step earlier: its
 * page geometry, and what its reader makes of it.
 *
 * Not frozen: Oberösterreich's side-by-side layout (no document of the
 * cached corpus has it), and the readers of the other four Länder — their
 * output is this test's input. A § withheld by the bag rule alone
 * (`notInDraft`) and marks of reasons `long` and `wording` occur in no small
 * document.
 *
 * Re-record in the SAME commit that changes the guard or Kärnten's reader on
 * purpose (`scripts/ci/landTguGoldenRecord.ts`), and read the diff of the
 * verdicts: that diff is the change.
 */
const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/laender/tgu-${name}.json`, import.meta.url)), 'utf8'))

describe('a Land Textgegenüberstellung, real documents: the draft rules', () => {
  for (const name of ['ooe-2025-16101', 'sbg-34574', 't-2026-722', 'w-2026009', 'w-2026003']) {
    it(`${name}: every § ends where it ended when recorded`, () => {
      const f = fixture(name) as { units: LawDiffUnit[]; blocks: TextBlock[] | null; verdicts: TguVerdict[] }
      expect(tguVerdicts(f.units, f.blocks)).toEqual(f.verdicts)
    })
  }
})

describe('a Land Textgegenüberstellung, real documents: Kärnten', () => {
  it('ktn-15860-2024-12: the reader composes four §§ and names three it does not compose', () => {
    const f = fixture('ktn-15860-2024-12') as { pages: AnnexPage[]; laws: string[]; reading: TguReading }
    const reading = ktnTguReading(f.pages, f.laws)
    expect(reading).toEqual(f.reading)
    expect(reading.paragraphs.map((p) => `${p.number}${p.unread ? ` ${p.because}` : ''}`)).toEqual(['15a', '15b', '15c', '7', '5 wording', '6 wording', '8 wording'])
  })
})

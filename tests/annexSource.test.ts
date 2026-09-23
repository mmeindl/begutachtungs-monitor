import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The switch that decides whether Parliament's copy of a
 * Textgegenüberstellung is READ, and the two credit lines that go with it
 * (`server/utils/annex/annexSource.ts`).
 *
 * A SOURCE SCAN, not an import: the module pulls `getGegenstand` and
 * `fetchDocument` into its graph, so importing it under vitest throws
 * `defineCachedFunction is not defined` before a single line of it runs.
 * Restructuring the module to make one constant importable would be a
 * change to the shipped code in order to satisfy a test, which is the wrong
 * way round — so the test reads the file.
 *
 * WHY THE CONSTANT IS WATCHED AT ALL. It is off for a licence reason, not a
 * technical one (docs/architecture.md §13.1): the reading path works, and
 * measured, 3 GP-XXVIII drafts would gain a Gegenüberstellung through it.
 * Flipping it alone would print the text of a parlament.gv.at document on a
 * site whose Impressum says it shows metadata only — two claims that would
 * then contradict each other, in different files, with nothing connecting
 * them. This test is that connection: it fails on the flip and names the two
 * other moves that belong in the same commit.
 */

const ANNEX_SOURCE = join(import.meta.dirname, '..', 'server', 'utils', 'annex', 'annexSource.ts')
const src = readFileSync(ANNEX_SOURCE, 'utf8')

/** The one line the module ships. */
const SWITCH_OFF = 'export const READ_PARLIAMENT_COPY = false'

describe('annexSource — the Parliament copy stays linked, not read', () => {
  it('is a file this test actually read', () => {
    // A guard on the guard: a moved or renamed module must fail here rather
    // than turn every assertion below into a test of an empty string.
    expect(src.length).toBeGreaterThan(2_000)
    expect(src).toContain('export async function annexSourceFor')
  })

  it('keeps the switch off', () => {
    expect(
      src.includes(SWITCH_OFF),
      'READ_PARLIAMENT_COPY is no longer `false` in server/utils/annex/annexSource.ts. ' +
      'Turning it on is three moves and they belong in ONE commit:\n' +
      '  1. the constant itself,\n' +
      '  2. the licence lines on /impressum and /ueber — they say the site ' +
      'shows metadata of the Begutachtungsverfahren only, and printing the ' +
      'text of a Parliament document would make that untrue,\n' +
      '  3. the sentence under `typeof chosen === \'string\'` in ' +
      'annex/textComparisonService.ts: „lesen wir nicht aus" becomes ' +
      '„ließ sich nicht auslesen" again.\n' +
      'And it presupposes an answer to the open licence question ' +
      '(docs/architecture.md §13.1). Then re-measure the coverage figure in §12.12.',
    ).toBe(true)
  })

  it('still carries the three-step note that says what else must move', () => {
    // The note is the only place those three files are named together. If it
    // is deleted, the flip becomes a one-line change again.
    expect(src).toContain('/impressum')
    expect(src).toContain('/ueber')
    expect(src).toContain('annex/textComparisonService.ts')
    expect(src).toContain('TURN IT BACK ON')
  })

  /* The two credit lines are two different CLAIMS, which is the whole reason
   * the credit travels with the source instead of standing in the section:
   * RIS licenses the annex as CC BY 4.0 (Bundeskanzleramt), Parliament does
   * not license the Begutachtungsverfahren at all. A blanket CC-BY note over
   * a Parliament document is the mistake ruled out on 16.09.2026. */
  it('claims CC BY only for the RIS copy', () => {
    const line = (name: string) => new RegExp(`export const ${name} = '([^']*)'`).exec(src)?.[1]
    const ris = line('RIS_CREDIT')
    const parliament = line('PARLIAMENT_CREDIT')

    expect(ris).toBeTypeOf('string')
    expect(parliament).toBeTypeOf('string')
    expect(ris).toContain('CC BY 4.0')
    expect(parliament).not.toContain('CC BY')
    // And it does not stay silent about where the document comes from —
    // „Quelle" without a licence is the honest form here.
    expect(parliament).toContain('Parlament')
  })
})

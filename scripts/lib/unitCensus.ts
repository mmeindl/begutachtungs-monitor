/**
 * The census of `scripts/harness/units.ts`: every instruction line in exactly
 * one unit, and every `#dup` id by its cause.
 *
 * PURE MODULE — relative imports only: the logic of a CLI script is logic no
 * test reaches, so the script only loads documents and pours the result out.
 */
import { normalizeGld, novaoNumber, type LawUnit, type TextBlock } from '../../server/utils/lawtext/lawUnits'
import { normalizeText } from '../../server/utils/lawtext/normalize'

export interface Census {
  /** Instruction blocks in the input */
  lines: number
  /** Numbered instruction lines in no unit, and unnumbered ones in none after a unit opened */
  lost: TextBlock[]
  /** Instruction lines in more than one unit */
  doubled: TextBlock[]
  /** Unit ids marked `#dup`, by cause (see the header of `scripts/harness/units.ts`) */
  dupIds: DupCauses
  /** The `verdoppelt` units themselves, each with the unit before it — to be read, not only counted */
  verdoppelt: { unit: LawUnit; prev: LawUnit }[]
  /** Ids that occur twice under one law key */
  sameIds: number
}

/**
 * `wiederholt` and `verdoppelt` were one class until 19.11.2026, read from the
 * ids alone: the same number twice in a row. Most of them are the source's
 * own (a draft that prints „2." twice, „Variante A" and „B" under one number),
 * but not all: a first line without a number promoted to „1." in front of the
 * printed „1.", a schedule's table row read as instruction 2. The two are
 * told apart by the lines the units opened on — printed twice, or once.
 */
export interface DupCauses { wiederholt: number; verdoppelt: number; neu: number; folge: number; ohneNummer: number }
export const noDups = (): DupCauses => ({ wiederholt: 0, verdoppelt: 0, neu: 0, folge: 0, ohneNummer: 0 })

const baseId = (id: string): string => id.replace(/(?:#dup)+$/, '')

/**
 * An instruction number as a line prints it, standing alone: „2. In § 5",
 * „2 Dem § 19", „12a. ein …". Stricter than the reader (`novaoNumber`), which
 * also takes the „2" of a table row „2.1 Brandschutz …" — the very misreading
 * this class is there to catch.
 */
const PRINTED_NUMBER_RE = /^(\d{1,3}[a-z]?)(?:\s*[.,:-]\s+|\s+)(?=\D)/

/**
 * The number a source line prints for the unit it opens, as the unit id
 * writes it: its Gliederungssymbol („§ 5." → „§5") or its instruction number
 * („2. In § 5 …" → „Z2"). Null where it prints none.
 */
function printedId(block: TextBlock | undefined): string | null {
  if (!block) return null
  if (block.gld) return normalizeGld(block.gld)
  const n = PRINTED_NUMBER_RE.exec(normalizeText(block.text))?.[1]
  return n === undefined ? null : `Z${n}`
}

/**
 * Each `#dup` unit's cause, read from the unit before it in the same law —
 * and, where the two share the number, from the source lines they opened on
 * (`openers`, as `instructionCensus` pairs them): `wiederholt` where both
 * print it, `verdoppelt` where the source printed it once.
 */
export function dupCauses(units: readonly LawUnit[], openers: ReadonlyMap<LawUnit, TextBlock>, verdoppelt: { unit: LawUnit; prev: LawUnit }[] = []): DupCauses {
  const out = noDups()
  for (const [i, u] of units.entries()) {
    if (!u.id.includes('#dup')) continue
    const base = baseId(u.id)
    const prev = units[i - 1]
    if (!/\d/.test(base)) out.ohneNummer++
    else if (prev && prev.article === u.article && baseId(prev.id) === base) {
      const printedTwice = printedId(openers.get(prev)) === base && printedId(openers.get(u)) === base
      if (printedTwice) out.wiederholt++
      else {
        out.verdoppelt++
        verdoppelt.push({ unit: u, prev })
      }
    } else if (prev && prev.article === u.article && prev.id.includes('#dup')) out.folge++
    else out.neu++
  }
  return out
}

/** Census of one `segmentUnits` run: `units` must be `segmentUnits(blocks)`. */
export function instructionCensus(blocks: readonly TextBlock[], units: readonly LawUnit[]): Census {
  const index = new Map(blocks.map((b, i) => [b, i] as const))
  const owners = new Array<number>(blocks.length).fill(0)
  /** The source line each unit opened on. */
  const openers = new Map<LawUnit, TextBlock>()
  let pos = 0
  for (const u of units) {
    for (const [k, bb] of u.blocks.entries()) {
      const at = index.get(bb)
      if (at !== undefined) {
        owners[at]!++
        pos = Math.max(pos, at + 1)
        if (k === 0) openers.set(u, bb)
        continue
      }
      // The opener, copied with its number cut off.
      if (k !== 0 || bb.kind !== 'novao') continue
      const want = normalizeText(bb.text)
      for (let j = pos; j < blocks.length; j++) {
        const src = blocks[j]!
        if (owners[j] === 0 && src.cls === bb.cls && src.gld === bb.gld && normalizeText(src.text).endsWith(want)) {
          owners[j]!++
          pos = j + 1
          openers.set(u, src)
          break
        }
      }
    }
  }
  const lost: TextBlock[] = []
  const doubled: TextBlock[] = []
  let lines = 0
  let opened = false
  for (const [i, b] of blocks.entries()) {
    if (b.kind === 'article') opened = false
    if (owners[i]! > 0) opened = true
    if (b.kind !== 'novao') continue
    lines++
    if (owners[i]! > 1) doubled.push(b)
    else if (owners[i] === 0 && (novaoNumber(b.text) !== null || opened)) lost.push(b)
  }
  const seen = new Set<string>()
  let sameIds = 0
  for (const u of units) {
    const key = `${u.article ?? ''}\u0000${u.id}`
    if (seen.has(key)) sameIds++
    seen.add(key)
  }
  const verdoppelt: { unit: LawUnit; prev: LawUnit }[] = []
  const dupIds = dupCauses(units, openers, verdoppelt)
  return { lines, lost, doubled, dupIds, verdoppelt, sameIds }
}

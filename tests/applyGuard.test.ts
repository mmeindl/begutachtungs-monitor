import { describe, expect, it } from 'vitest'
import { guardParagraph, SIZE_TOLERANCE } from '../server/utils/kons/applyGuard'
import { applyNovelle, parsePayload, type Instruction, type StandingLaw } from '../server/utils/kons/lawApply'
import type { LawNode } from '../server/utils/lawtext/konsTree'
import { paraNode as para } from './helpers/builders'
import { parseInstruction } from '../server/utils/kons/novao'

function law(): StandingLaw {
  return { paragraphs: [para('6', 'Zuständigkeit', ['Zuständig ist die Behörde am Sitz der Partei. Sie entscheidet binnen sechs Wochen.'])] }
}

function instr(line: string, payloadLines: string[] = []): Instruction[] {
  const parsed = parseInstruction(line)
  expect(parsed.ops.length, `refused: ${parsed.reason}`).toBeGreaterThan(0)
  return parsed.ops.map((op) => ({ op, payload: parsePayload(payloadLines), line }))
}

/** Run the instructions and guard § 6. */
function guard(l: StandingLaw, instructions: Instruction[], tamper?: (after: LawNode) => void) {
  const { law: out, results } = applyNovelle(l, instructions)
  const after = out.paragraphs.find((p) => p.id === '6')!
  tamper?.(after)
  const touching = instructions.map((instruction, i) => ({ instruction, result: results[i]! }))
  return guardParagraph('6', l, l.paragraphs[0]!, after, touching)
}

describe('guardParagraph', () => {
  it('passes a clean phrase replacement', () => {
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksverwaltungsbehörde" ersetzt.'))
    expect(r.flags).toEqual([])
    expect(r.plausible).toBe(true)
  })

  it('reports a refusal as the engine own signal', () => {
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "fehlt" durch das Wort "auch" ersetzt.'))
    expect(r.flags).toContain('verweigert')
    expect(r.plausible).toBe(false)
  })

  it('flags a text that changed far more than the operands weigh', () => {
    // The failure this catches: a sentence replacement that hit a fragment
    // and kept the rest — the § grew by hundreds of characters while the
    // instruction swapped one sentence for another of similar length.
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksbehörde" ersetzt.'), (after) => {
      after.children[0]!.text += ' Dieser Satz stammt aus keiner Anweisung und ist deutlich länger als die Toleranz.'
    })
    expect(r.flags).toContain('umfang')
    expect(Math.abs(r.sizeDelta)).toBeGreaterThan(SIZE_TOLERANCE)
    expect(r.flags).toContain('unerklärt')
    expect(r.unexplained.inserted).toContain('Anweisung')
  })

  it('flags a seam the standing text did not have', () => {
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksbehörde" ersetzt.'), (after) => {
      after.children[0]!.text = after.children[0]!.text.replace('Bezirksbehörde am', 'Bezirksbehörde , am')
    })
    expect(r.flags).toContain('fuge')
  })

  it('does not blame the engine for a seam RIS itself prints', () => {
    const l: StandingLaw = { paragraphs: [para('6', 'Z', ['Die Behörde hat gegenüberzustellen , was vorliegt.'])] }
    const r = guard(l, instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksbehörde" ersetzt.'))
    expect(r.flags).not.toContain('fuge')
  })

  it('flags a marker left inside a text', () => {
    const r = guard(law(), instr('Dem § 6 wird folgender Abs. 2 angefügt:', ['(2) Ergänzung.']), (after) => {
      after.children[1]!.text = 'a) die Staatsangehörigkeit besitzt'
    })
    expect(r.flags).toContain('marker')
  })

  it('does not read a German abbreviation pair as a Litera marker', () => {
    // „z. B." opens with a single letter and a full stop, which is exactly
    // the Litera style the marker check was taught. A correct § was withheld
    // as „unplausibel" for it — safe direction, but paid for in coverage.
    const r = guard(law(), instr('Dem § 6 wird folgender Abs. 2 angefügt:', ['(2) z. B. Fahrzeuge sind erfasst.']))
    expect(r.flags).not.toContain('marker')
    expect(r.plausible).toBe(true)
  })

  it('still flags a Litera with a full stop that opens a real enumeration', () => {
    const r = guard(law(), instr('Dem § 6 wird folgender Abs. 2 angefügt:', ['(2) Ergänzung.']), (after) => {
      after.children[1]!.text = 'f. Fahrzeuge'
    })
    expect(r.flags).toContain('marker')
  })

  it('accounts for a unit replacement by its payload and the unit it replaces', () => {
    const r = guard(law(), instr('§ 6 Abs. 1 lautet:', ['(1) Zuständig ist die Landesregierung.']))
    expect(r.flags).toEqual([])
  })

  it('never passes what it could not diff', () => {
    const long = Array.from({ length: 1700 }, (_, i) => `w${i}`).join(' ')
    const l: StandingLaw = { paragraphs: [para('6', 'Z', [long])] }
    const r = guard(l, instr('Dem § 6 wird folgender Abs. 2 angefügt:', [`(2) ${long}`]))
    expect(r.flags).toContain('unprüfbar')
    expect(r.plausible).toBe(false)
  })
})

describe('a word on both sides of the diff (06.10.2026)', () => {
  // The diff pairs a repeated word with its neighbour and reports the old
  // one as removed and re-inserted; the bag of words is unchanged. Word ORDER
  // is not this flag's to judge — the oracle's check 2 holds the annex's
  // proposed wording against the result.
  it('cancels out instead of reading as an invented word', () => {
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksbehörde" ersetzt.'), (after) => {
      after.children[0]!.text = after.children[0]!.text.replace('Sie entscheidet binnen sechs Wochen.', 'Sie binnen sechs Wochen entscheidet.')
    })
    expect(r.unexplained).toEqual({ inserted: [], removed: [] })
    expect(r.flags).not.toContain('unerklärt')
  })

  it('keeps a word that stands on one side only', () => {
    const r = guard(law(), instr('In § 6 Abs. 1 wird das Wort "Behörde" durch das Wort "Bezirksbehörde" ersetzt.'), (after) => {
      after.children[0]!.text = after.children[0]!.text.replace('sechs Wochen.', 'Wochen sechs Monaten.')
    })
    expect(r.flags).toContain('unerklärt')
    expect(r.unexplained).toEqual({ inserted: ['Monaten'], removed: [] })
  })
})

describe('a „jeweils" inside a Halbsatz (28.09.2026)', () => {
  it('is counted in the sentence the engine searches, not in the whole unit', () => {
    const l: StandingLaw = { paragraphs: [para('6', 'Zuständigkeit', ['Die Behörde prüft. Die Behörde entscheidet; die Behörde hört an.'])] }
    const line = 'In § 6 Abs. 1 wird im letzten Halbsatz das Wort "Behörde" jeweils durch das Wort "Stelle" ersetzt.'
    expect(guard(l, instr(line)).flags).toEqual([])
    // A third replacement outside that sentence is not covered by the line.
    const r = guard(l, instr(line), (after) => {
      after.children[0]!.text = after.children[0]!.text.replace('Die Behörde prüft', 'Die Stelle prüft')
    })
    expect(r.flags).toContain('unerklärt')
  })
})

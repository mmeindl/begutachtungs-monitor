/**
 * Which §§ of a draft each Novellierungsanordnung may print text for
 * (docs/architecture.md §12.13).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Rule 2 of the annex gate („nicht im Entwurf", `annexCheck.ts`) holds the
 * words a § shows as new against the draft's own Gesetzestext. That reference
 * was the *whole* draft, and a whole-draft reference cannot see the fault it
 * is most likely to meet: text dragged out of a **neighbouring**
 * Novellierungsanordnung of the same draft is in the draft, only in the wrong
 * §, so it passes.
 *
 * This module answers the addressing question that narrows the reference —
 * which §§ does one instruction touch — and answers nothing else. It knows
 * nothing about words, bags or thresholds: `annexCheck.ts` owns the comparison
 * rules and turns these units into bags, so the two concerns stay in one
 * direction and neither module imports the other's back.
 *
 * **A miss may only weaken the check.** An instruction whose address nobody
 * could read must never make a § fail — it lands in the general bag, which
 * every § of its law receives, and the check is then exactly as weak as it
 * was before for that law. Hence `reason` on every unit that named no §: a
 * caller can only honour that promise if it is told which instructions were
 * lost, and the harness can only report the coverage if it is countable.
 */
import { segmentUnits, type TextBlock } from './lawtext/lawUnits'
import { draftTextOf } from './annex/draftText'
import { NO_PARAGRAPH_ADDRESSED, addressedUnits, parseAddress } from './novao'

/** One Novellierungsanordnung (or one § of a Stammgesetz), and what it addresses. */
export interface DraftUnit {
  /**
   * The law of the package the unit belongs to — `LawUnit.article`, which is
   * `articleTitle ?? articleNumber` and therefore the same string
   * `DraftArticle.key` carries and the annex's rows are attributed with
   * (`annexBoundaries.ts`). Null for a draft without Artikel.
   */
  law: string | null
  /** `Z4`, `§5` — the unit's own id, for reports. */
  id: string
  /** The §§ it may print text for, as the draft writes them ("§ 5a", "Anlage 2"). */
  paras: string[]
  /** Designations of *one* provision under two numbers (`novao.AddressedUnits`). */
  aliases: [string, string][]
  /** Why `paras` is empty — null whenever it is not. */
  reason: string | null
  /** The unit's text, Gliederungssymbole included, as `annex/draftText.draftTextOf` counts them. */
  text: string
}

/** `Z4` addresses nothing readable: the reason of its own instruction line, else this. */
const NO_INSTRUCTION = 'keine Novellierungsanordnung'

/**
 * A draft's instructions, each with the §§ it addresses.
 *
 * The §§ of one unit are the union of four readings, because an instruction
 * can name its target in any of them:
 *
 * - **the instruction line** — every `target`/`anchor` of every op
 *   `parseInstruction` returns, the §§ an insertion *creates*, the ranges
 *   `expandRange` expanded, both designations of a renumbering, and — where no
 *   operation could be typed at all — the address the refused line still names
 *   (`novao.addressedUnits`, `novao.refusedAddresses`);
 * - **the sub-instructions inside the same unit** — "a) In Abs. 3 lautet der
 *   erste Satz:" under "2. § 2 wird wie folgt geändert:". They inherit the
 *   container's address, so they normally confirm its § rather than adding
 *   one; they are read all the same, because the first line is also the only
 *   place a *second* § could hide;
 * - **the quoted Gliederungssymbole** — a "lautet:"-payload prints the §§ it
 *   rewrites, and that is the one address form no instruction grammar is
 *   needed for;
 * - and for a Stammgesetz, the same symbols are the § itself.
 *
 * `articles` is deliberately not a parameter. The law key is `LawUnit.article`
 * and nothing here needs the Artikel list to compute it; whether that key
 * meets the annex's `row.law` is a question about the *lookup*, and the
 * harness counts it there (`annex-pdf-verify.ts`), where a §§ count can be
 * printed. A parameter a function does not read is a false claim about what
 * it depends on.
 */
export function draftUnits(blocks: readonly TextBlock[]): DraftUnit[] {
  return segmentUnits(blocks).map((unit) => {
    const instructions = unit.blocks.filter((b) => b.kind === 'novao')
    // The container's own address, for the lettered sub-instructions under it.
    const inherited = instructions[0] ? parseAddress(instructions[0].text) : null
    const paras = new Set<string>()
    const aliases: [string, string][] = []
    let reason: string | null = null
    for (const [i, block] of instructions.entries()) {
      const found = addressedUnits(block.text, i === 0 ? null : inherited)
      for (const para of found.paras) paras.add(para)
      aliases.push(...found.aliases)
      // The first line is the unit's own instruction, so its refusal is the
      // one worth reporting; a litera that fails under a container that
      // resolved has cost nothing.
      if (i === 0) reason = found.reason
    }
    // A quoted payload prints the §§ it installs, and a Stammgesetz's § opens
    // with its own symbol. Both are addresses no grammar has to read.
    for (const block of unit.blocks) if (block.gld) paras.add(block.gld)
    return {
      law: unit.article,
      id: unit.id,
      paras: [...paras],
      aliases,
      reason: paras.size > 0 ? null : (reason ?? (instructions.length === 0 ? NO_INSTRUCTION : NO_PARAGRAPH_ADDRESSED)),
      text: draftTextOf(unit.blocks),
    }
  })
}

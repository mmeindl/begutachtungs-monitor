/**
 * The bench on the path a reader meets (23.11.2026, `kons.ts --entwurf`).
 *
 * WHY. `kons.ts` applies the instructions of the ENACTED Bundesgesetzblatt to
 * the text before it. No page does that: a draft's page applies the DRAFT's
 * instructions to the text in force when its Begutachtung began
 * (`consolidate`). „461 of 461" therefore said that the engine and the gate
 * reproduce RIS from the law's own instructions, and nothing about a § the
 * page composes from a draft.
 *
 * WHAT CAN BE SCORED. A draft's § may rightly differ from the law: Parliament
 * changed it, or the text in force moved before enactment. Only a § whose
 * instructions went into the law unchanged, on the same text in force, has
 * one right answer, and it is the enacted text. Everything else is counted
 * apart and never scored, in either direction.
 *
 * Pure, so the classes are held by `tests/konsDraftPath.test.ts`.
 */

/** One § the page shows for a draft, against one Bundesgesetzblatt that came of it. */
export type DraftPathCase = {
  /** Draft, law and § — one § counts once, however many BGBl carry it. */
  key: string
  me: string
  law: string
  id: string
} & (
  /** The Bundesgesetzblatt did not amend this §. */
  | { amended: false }
  /** It did, and RIS's enacted text of the § could not be read. */
  | { amended: 'unread' }
  /** No law of the bench could be joined to the draft's Artikel for this §. */
  | { amended: 'noLaw' }
  /**
   * The draft's Artikel for this § became law in none of the Bundesgesetzblätter
   * that came of its Regierungsvorlagen: every one is read, and none has an
   * Artikel for the law (24.11.2026; 11/ME's StPO, ZPO and others, the StGB alone
   * went into BGBl. I Nr. 45/2025).
   */
  | { amended: 'notEnacted' }
  | {
    amended: true
    /** Instruction lines the draft has for the §. */
    lines: number
    /** The draft's instructions for the §, wording and quoted text, are the law's. */
    sameInstruction: boolean
    /** The text the law amended is the one the draft amended; null where the § did not exist before. */
    sameStock: boolean | null
    /** Heading and text are the enacted law's, all but white space. */
    identical: boolean
  }
)

export interface DraftPathRecord {
  /** Drafts composed. */
  drafts: number
  /** Drafts whose composition threw: a round with any is refused. */
  failed: number
  /** §§ the page shows for them. */
  shown: number
  /** Of those, §§ with one right answer: same instruction, same text in force. */
  comparable: number
  /** Of those, word for word the enacted law. */
  identical: number
  /** The comparable §§ that are not, by name, so each can be read. */
  differs: { me: string; law: string; id: string }[]
  /** Not scored: the instruction changed between draft and law. */
  instructionChanged: number
  /** Not scored: same instruction, but the text in force moved before enactment. */
  stockMoved: number
  /** Not scored: neither side has an instruction line keyed to the §. */
  noInstructionLine: number
  /** Not scored: the law did not amend the §. */
  notAmended: number
  /** Not scored: the law amended the §, and its enacted text could not be read. */
  enactedUnread: number
  /** Not scored: no law of the bench joins to the draft's Artikel. */
  noLawJoined: number
  /** Not scored: the draft's Artikel became law in none of the Bundesgesetzblätter that came of it. Absent before 24.11.2026. */
  notEnacted?: number
}

/** The stronger of two readings of one §: a law joined over none, a proven absence over that, an amending BGBl over that, then the law's own text, then the same instruction. */
function rank(c: DraftPathCase): number {
  if (c.amended === 'noLaw') return 0
  if (c.amended === 'notEnacted') return 1
  if (c.amended === false) return 2
  if (c.amended === 'unread') return 3
  return 4 + (c.sameInstruction && c.lines > 0 ? 2 : 0) + (c.identical ? 4 : 0)
}

export function draftPathOf(cases: readonly DraftPathCase[], drafts: number, failed: number): DraftPathRecord {
  const best = new Map<string, DraftPathCase>()
  for (const c of cases) {
    const held = best.get(c.key)
    if (!held || rank(c) > rank(held)) best.set(c.key, c)
  }
  const out: DraftPathRecord = { drafts, failed, shown: best.size, comparable: 0, identical: 0, differs: [], instructionChanged: 0, stockMoved: 0, noInstructionLine: 0, notAmended: 0, enactedUnread: 0, noLawJoined: 0, notEnacted: 0 }
  for (const c of best.values()) {
    if (c.amended === 'noLaw') out.noLawJoined++
    else if (c.amended === 'notEnacted') out.notEnacted!++
    else if (c.amended === 'unread') out.enactedUnread++
    else if (!c.amended) out.notAmended++
    else if (!c.sameInstruction) out.instructionChanged++
    else if (c.lines === 0) out.noInstructionLine++
    else if (c.sameStock === false) out.stockMoved++
    else {
      out.comparable++
      if (c.identical) out.identical++
      else out.differs.push({ me: c.me, law: c.law, id: c.id })
    }
  }
  return out
}

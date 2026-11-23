/**
 * Which § of the Bund's Textgegenüberstellung the page may show without
 * reservation (21.11.2026): only where its new text is confirmed word for
 * word. Otherwise it carries a mark — never is it withheld on this table's
 * word alone (the maintainer's decision of 21.11.2026: the annex is the
 * ministry's document, and the word-for-word checks have false alarms).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Applied
 * AFTER `verifyAnnex`: the gate's verdicts and counts stay what they are, so
 * its record stays comparable, and this table only adds marks to what the
 * gate let through.
 *
 * WHY. The gate holds the right column against the draft by word bags with
 * floors, and so passes a single wrong figure, a swapped word and a dropped
 * sentence by construction (fault injection: about 0 to 3 % caught). Two
 * checks read word for word, independently of each other: the draft check
 * (`annexStrict.ts`), the new words against the wording the draft writes for
 * the §, in order; and the oracle (`kons/tguOracle.ts`), the monitor's own
 * reading of the whole § after the draft, held against both columns — a §
 * of the Lesefassung shown without the second witness is one it confirmed.
 *
 * THE LINES, per § key (`annexParagraphKey`):
 *  - withheld: as the gate says;
 *  - left unchecked by the gate and owing a check: as the gate says, with its
 *    reason (a § the gate marks keeps that mark);
 *  - verified, or unchecked with nothing owed (`REASON_NOTHING_TO_COMPARE`):
 *    - shows no change: not asked;
 *    - prints a row alike in both columns that the standing § does not
 *      account for (`unchangedRowsNotStanding`, the maintainer's decision of
 *      23.11.2026): „nicht bestätigt", whatever the other checks say. Neither
 *      reads such a row: it shows no new and no struck word;
 *    - shows only deletions, or the draft check held it with no new word:
 *      since 22.11.2026 the draft check reads struck text too
 *      (`struckAccount`). Where it objects — to struck text the draft keeps,
 *      or to wording of the draft the column lacks — the § is judged as any
 *      § it objects to (below). Clean where every struck word is the draft's
 *      by a quotation, a repeal or a unit written anew, and there is one at
 *      least; else — struck by a position the draft only counts, or nothing
 *      the check could read — clean where the oracle confirms, „nicht
 *      geprüft" (`MARK_DELETIONS`) where not;
 *    - the draft check holds: clean;
 *    - it objects: „nicht bestätigt". Where the oracle confirms, the § is
 *      clean only where the objection names new words and no wording of
 *      the draft the column lacks (`StrictCheck.notShown` empty). The
 *      oracle holds the column by containment: it vouches for the new
 *      words the column shows and for what they replace, and is blind by
 *      design to wording the column lacks. An objection about struck text
 *      alone stands whatever the oracle says: there its word proved the
 *      weaker of the two (`OBJECTION_OVER_CONFIRMATION`);
 *    - it could not run: clean where the oracle confirms, else „nicht
 *      geprüft" with the reason in the Länder's words.
 */
import { DRAFT_CHECK_REASON_DE } from '../../../shared/utils/draftCheckReasons'
import type { StrictCheck } from '../laender/landTguStrict'
import { draftUncheckedReason } from '../laender/landTguGuard'
import type { ComparisonRow } from './comparisonRows'
import { annexParagraphKey } from './annexText'
import { DRAFT_UNREAD } from './annexStrict'
import { isDisplayedChange } from './coverage'
import { insertedStretches } from './rightColumn'
import { REASON_NOTHING_TO_COMPARE, type AnnexVerification, type ParagraphVerdict } from './verdict'

/**
 * The cell where the oracle confirms a § and the draft check objects to it.
 * The oracle holds the right column by containment: it vouches for the
 * words the column shows and cannot see wording the column lacks. So the
 * cell is split by what the objection is about ('missing', the maintainer's
 * decision of 21.11.2026): clean where the draft check objects only to words
 * the column shows beyond the draft's wording (`StrictCheck.notShown`
 * empty), „nicht bestätigt" where it names wording of the draft the column
 * lacks, whatever the oracle says. Kept for the record: 'clean' lets every
 * confirmation stand (the rule until that decision), 'unconfirmed' never
 * overrules the draft check.
 *
 * Stage 3a read the cell's 103 §§ one by one. The 52 that object only to
 * words the column shows: 40 false alarms of the draft check, 11 limits of
 * how the annex is set, 1 our draft reader, no real difference. The 51 that
 * name missing wording: all 8 real differences between the ministry's two
 * documents, 20 undecided (the draft's text not found in the annex), 12
 * false alarms, 8 limits of the layout, 3 our draft reader.
 *
 * AN OBJECTION ABOUT STRUCK TEXT ALONE STANDS (the maintainer's decision of
 * 22.11.2026). While the confirmation stood against it, 39 of about 1,640
 * kept sentences lost from the right column passed that way; a second
 * review read 27 of them, and in every one the draft check named exactly
 * the lost sentence and the oracle confirmed wrongly. The price, known and
 * taken: on the real corpus the confirmation had kept 19 §§ unmarked, each
 * read as a false alarm of the draft check (a parent the column prints
 * only in an elided row, a unit named in the new numbering, layout). They
 * carry „nicht bestätigt" until the check reads those shapes.
 *
 * Not where the objection names new words as well. In all 13 such §§ of the
 * corpus the struck words and the new ones are one replacement at one place
 * — a word the PDF prints run together on the left and parted on the right
 * („bestimmtenräumen" / „bestimmten Räumen"), a figure a renumbering moves
 * by one — and the oracle's word for the new side covers the old one.
 * Letting every struck-text objection stand marked those 13 for nothing.
 */
export type ObjectionRule = 'clean' | 'unconfirmed' | 'missing'
export const OBJECTION_OVER_CONFIRMATION: ObjectionRule = 'missing'

/*
 * Why a § the draft check could not hold carries „nicht geprüft" — written
 * to follow „Nicht geprüft:", in the Länder's words (`draftCheckReasons.ts`):
 * the fact is the same.
 */
export const MARK_UNASSIGNED = DRAFT_CHECK_REASON_DE.unassigned
export const MARK_WORDING = DRAFT_CHECK_REASON_DE.wording
export const MARK_LONG = DRAFT_CHECK_REASON_DE.long
export const MARK_DRAFT_UNREAD = DRAFT_CHECK_REASON_DE.draftUnread
/**
 * A § that shows no new wording, whose struck text the draft check cannot
 * confirm: the draft strikes it only by a position it counts („der letzte
 * Satz entfällt"), or the check read nothing of it. True of a § that only
 * strikes, and of one whose new tokens are notation alone. Not of a § the
 * check objects to: that one is „nicht bestätigt" (`markOf`).
 */
export const MARK_DELETIONS = 'die Gegenüberstellung zeigt hier keinen neuen Wortlaut, und was sie streicht, nennt der Gesetzestext des Entwurfs nicht so, dass es sich Wort für Wort bestätigen lässt'

/** What the page shows of a §: as the gate says, „nicht geprüft" with a reason, or „nicht bestätigt". */
export type AnnexMark = { kind: 'gate' } | { kind: 'unchecked'; reason: string } | { kind: 'unconfirmed' }

export interface MarkInput {
  verdict: ParagraphVerdict
  /** The gate's reason for an unchecked §, null for any other. */
  uncheckedReason: string | null
  /** The § shows new text — what the gate calls new (`insertedStretches`). */
  showsNewText: boolean
  /** The § shows any change: new text, or a change to text in force (`isDisplayedChange`). */
  showsChange: boolean
  /** The draft check's state; undefined where it has none for the key, which is read as „could not run". */
  strict: StrictCheck | undefined
  /** The oracle confirmed the §; null where the draft has no Lesefassung. */
  oracleConfirmed: boolean | null
  /** A row alike in both columns that the standing § does not account for (`AnnexVerification.unchangedNotStanding`). */
  unchangedNotStanding?: boolean
}

const GATE: AnnexMark = { kind: 'gate' }
const UNCONFIRMED: AnnexMark = { kind: 'unconfirmed' }

/** The draft check's reason, in the Länder's three classes (`draftUncheckedReason`) and the unread draft. */
export function markReasonOf(reason: string | null): string {
  if (reason === DRAFT_UNREAD) return MARK_DRAFT_UNREAD
  const kind = draftUncheckedReason(reason)
  return kind === 'wording' ? MARK_WORDING : kind === 'long' ? MARK_LONG : MARK_UNASSIGNED
}

/** Whether the oracle's confirmation stands against the draft check's objection, by the one cell's value (`OBJECTION_OVER_CONFIRMATION`). */
const overrules = (confirmed: boolean, strict: StrictCheck, objection: ObjectionRule): boolean => confirmed && (objection === 'clean' || (objection === 'missing' && strict.notShown.length === 0 && (strict.notInDraft.length > 0 || !strict.struckNotInDraft?.length)))

/** The table, for one §. `objection` is the one cell's value; the harness asks all three. */
export function markOf(input: MarkInput, objection: ObjectionRule = OBJECTION_OVER_CONFIRMATION): AnnexMark {
  if (input.verdict === 'withheld') return GATE
  if (input.verdict === 'unchecked' && input.uncheckedReason !== REASON_NOTHING_TO_COMPARE) return GATE
  if (!input.showsChange) return GATE
  if (input.unchangedNotStanding) return UNCONFIRMED
  const confirmed = input.oracleConfirmed === true
  const strict = input.strict
  if (!input.showsNewText || (strict?.state === 'holds' && strict.newWords === 0)) {
    // The draft check objects (22.11.2026) — the column strikes what the draft keeps, or lacks wording the draft writes for
    // the §: as at any § it objects to. Until then only an objection to struck text alone was read here, and one to
    // missing wording stood as „nicht geprüft" for its deletions, or clean on the oracle's word against the rule below.
    if (strict?.state === 'differs') return overrules(confirmed, strict, objection) ? GATE : UNCONFIRMED
    if (confirmed) return GATE
    // Every struck word the draft's by a quotation, a repeal or a unit written anew — not merely by a position it counts.
    const by = strict?.state === 'holds' ? strict.struck : undefined
    return by && by.named + by.repealed + by.rewritten > 0 && by.byPosition === 0 ? GATE : { kind: 'unchecked', reason: MARK_DELETIONS }
  }
  if (strict?.state === 'holds') return GATE
  if (strict?.state === 'differs') return overrules(confirmed, strict, objection) ? GATE : UNCONFIRMED
  return confirmed ? GATE : { kind: 'unchecked', reason: markReasonOf(strict?.reason ?? null) }
}

/**
 * The table over every § of a parsed annex, under the gate's key: what
 * `checkAnnexRows` applies and the harness records. `confirmed` holds the
 * rows whose § the oracle confirmed (`oracleConfirmedRows`), null where the
 * draft has no Lesefassung. A § counts as confirmed only where every row the
 * page prints of it is (an elided row prints nothing): a group the annex
 * opens for two §§ after the draft is confirmed where both are.
 */
export function annexMarks(
  rows: readonly ComparisonRow[],
  verification: AnnexVerification,
  strict: ReadonlyMap<string, StrictCheck>,
  confirmed: ReadonlySet<ComparisonRow> | null,
  objection: ObjectionRule = OBJECTION_OVER_CONFIRMATION,
): Map<string, AnnexMark> {
  const groups = new Map<string, ComparisonRow[]>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (para === null) continue
    const key = annexParagraphKey(row.law, para)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const out = new Map<string, AnnexMark>()
  for (const [key, group] of groups) {
    const showsNewText = insertedStretches(group).length > 0
    const printed = group.filter((r) => !r.elided)
    out.set(key, markOf({
      verdict: verification.verdicts[key] ?? 'unchecked',
      uncheckedReason: verification.uncheckedReasons[key] ?? null,
      showsNewText,
      showsChange: showsNewText || group.some(isDisplayedChange),
      strict: strict.get(key),
      oracleConfirmed: confirmed === null ? null : printed.length > 0 && printed.every((r) => confirmed.has(r)),
      unchangedNotStanding: verification.unchangedNotStanding?.[key] === true,
    }, objection))
  }
  return out
}

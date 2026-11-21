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
 *    - shows only deletions, or the draft check held it with no new word: the
 *      draft check reads no old text, so it confirmed nothing — clean where
 *      the oracle confirms, else „nicht geprüft" (`MARK_DELETIONS`);
 *    - the draft check holds: clean;
 *    - it objects: „nicht bestätigt", unless the oracle confirms — then
 *      `OBJECTION_OVER_CONFIRMATION` decides, the one cell where the two
 *      variants differ;
 *    - it could not run: clean where the oracle confirms, else „nicht
 *      geprüft" with the reason in the Länder's words.
 */
import type { StrictCheck } from '../laender/landTguStrict'
import { draftUncheckedReason } from '../laender/landTguGuard'
import type { ComparisonRow } from './comparisonRows'
import { annexParagraphKey } from './annexText'
import { DRAFT_UNREAD } from './annexStrict'
import { isDisplayedChange } from './coverage'
import { insertedStretches } from './rightColumn'
import { REASON_NOTHING_TO_COMPARE, type AnnexVerification, type ParagraphVerdict } from './verdict'

/**
 * The cell where the oracle confirms a § and the draft check objects to it:
 * 'clean' lets the oracle's confirmation stand (the rule approved on
 * 21.11.2026), 'unconfirmed' never overrules the draft check. Every one of
 * the 101 §§ of that cell measured by stage 3a was read: 8 real differences
 * between the ministry's two documents, 52 false alarms of the draft check,
 * 19 limits of how the annex is set, 4 our draft reader, 20 undecided.
 */
export const OBJECTION_OVER_CONFIRMATION: 'clean' | 'unconfirmed' = 'clean'

/*
 * Why a § the draft check could not hold carries „nicht geprüft" — written
 * to follow „Nicht geprüft:", in the Länder's words where the fact is the
 * same (`landUnchecked.ts`; tests/annexMark.test.ts holds them equal).
 */
export const MARK_UNASSIGNED = 'den neuen Text konnte der Monitor keiner Anordnung des Entwurfs sicher zuordnen'
export const MARK_WORDING = 'eine Anordnung des Entwurfs konnte der Monitor nicht Wort für Wort lesen'
export const MARK_LONG = 'für den wortweisen Abgleich ist der Text zu lang'
export const MARK_DRAFT_UNREAD = 'den Gesetzestext des Entwurfs fand der Monitor nicht oder konnte ihn nicht lesen'
/** The draft check reads new text only; a § that shows nothing new is no § it can confirm. */
export const MARK_DELETIONS = 'hier zeigt die Gegenüberstellung nur Streichungen, und der Abgleich Wort für Wort liest nur neuen Text'

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
}

const GATE: AnnexMark = { kind: 'gate' }
const UNCONFIRMED: AnnexMark = { kind: 'unconfirmed' }

/** The draft check's reason, in the Länder's three classes (`draftUncheckedReason`) and the unread draft. */
export function markReasonOf(reason: string | null): string {
  if (reason === DRAFT_UNREAD) return MARK_DRAFT_UNREAD
  const kind = draftUncheckedReason(reason)
  return kind === 'wording' ? MARK_WORDING : kind === 'long' ? MARK_LONG : MARK_UNASSIGNED
}

/** The table, for one §. `objection` is the one cell's value; the harness asks both. */
export function markOf(input: MarkInput, objection: 'clean' | 'unconfirmed' = OBJECTION_OVER_CONFIRMATION): AnnexMark {
  if (input.verdict === 'withheld') return GATE
  if (input.verdict === 'unchecked' && input.uncheckedReason !== REASON_NOTHING_TO_COMPARE) return GATE
  if (!input.showsChange) return GATE
  const confirmed = input.oracleConfirmed === true
  const strict = input.strict
  if (!input.showsNewText || (strict?.state === 'holds' && strict.newWords === 0)) return confirmed ? GATE : { kind: 'unchecked', reason: MARK_DELETIONS }
  if (strict?.state === 'holds') return GATE
  if (strict?.state === 'differs') return confirmed && objection === 'clean' ? GATE : UNCONFIRMED
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
  objection: 'clean' | 'unconfirmed' = OBJECTION_OVER_CONFIRMATION,
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
    }, objection))
  }
  return out
}

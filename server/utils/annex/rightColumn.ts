/**
 * The right column against the standing law and against the draft — the two
 * rules „bereits geltend" and „nicht im Entwurf".
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. Second and
 * third of the three checks `annex/verdict.ts` runs over a §.
 */
import { draftUnits } from './annexDraft'
// The whole draft is rule 2's *fallback* rather than its reference since
// 2026-09-10: what a § may draw on where the draft's instructions could not be
// segmented at all (`draftReference`). Everything else reads them one by one.
import { draftTextOf } from './draftText'
import type { TextBlock } from '../lawtext/lawUnits'
import { normalizeText } from '../lawtext/normalize'
import { NO_PARAGRAPH_ADDRESSED } from '../kons/novao'
import type { ComparisonRow } from './comparisonRows'
import { comparableTokens, designationKey } from './annexText'

// ---------------------------------------------------------------------------
// The right column: „bereits geltend" and „nicht im Entwurf" (2026-09-10)
// ---------------------------------------------------------------------------

/**
 * Rule 1's floor: an inserted stretch shorter than this says nothing.
 *
 * Six comparable words, exact and in order. Below that, ordinary legal
 * phrasing collides by itself — and above it, the rule fires on 8 §§ of the
 * GP-XXVIII corpus through the ressort's own XML cells, every one of them a
 * true positive (WiEReG § 5, Ärztegesetz §§ 12 and 12a, OTPG § 4, FSG § 26 …),
 * plus the § headings the PDF path loses on the left.
 */
export const MIN_STANDING_STRETCH = 6

/**
 * Rule 2's floors: how much unexplained new text is evidence.
 *
 * Over the 1.145 §§ of the corpus with at least ten new words, the share
 * found in the draft's own Gesetzestext is 100 % at the median and 98 % at
 * p10 — the reference is that tight. Exactly **6 §§** have ≥ 8 missing words
 * *and* a ratio below 0,9, and each one is a genuine right-column
 * contamination; the six are read one by one in docs/architecture.md §12.13.
 *
 * The absolute floor of 8 is what separates those from the next candidates
 * below 0,9, which are all false positives with two or three missing words:
 * a ministry's name, a spelling. A ratio alone cannot tell 2 of 12 from 39
 * of 89.
 *
 * All three were **kept** when the reference narrowed to one § (`draftBags`,
 * 2026-09-10): they were calibrated on how tightly the annex's new words
 * follow the draft's wording, and narrowing the reference does not loosen
 * that. **Rejected variant:** a *ceiling* on the missing share would have
 * cost the table path its whole gain (R-neu 184 → 64 catches, below the 76
 * the whole-draft bag already had).
 */
export const MIN_NEW_WORDS = 10
export const MIN_MISSING_WORDS = 8
export const DRAFT_THRESHOLD = 0.9

/**
 * The standing text of one §, in the two shapes the check needs.
 *
 * `text` is everything the annex may print over the provision: the Abschnitt
 * and Hauptstück lines RIS files above the §, the § heading, and the body.
 * A word the offer leaves out counts against the parse, so all three go in.
 *
 * `heading` is the same minus the body, and it exists for rule 2 alone. RIS
 * files the heading above the § and the annex reprints it, while the draft's
 * Novellierungsanordnung usually does not repeat it — so heading words would
 * count as "new words the draft does not carry", and 20 of them did before
 * this was split out (measured 2026-09-10).
 */
export interface StandingText {
  text: string
  heading: string
}

/** Comparable words in order, since a bag test cannot see a *moved* sentence. */
function seqContains(hay: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) j++
    if (j === needle.length) return true
  }
  return false
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The stretches of text the page shows as **new** in one §.
 *
 * An `inserted` row's whole proposed column, and every `inserted` segment of
 * a `changed` row's word diff. An `elided` row is the annex saying it left
 * text out and carries no claim either way.
 */
export function insertedStretches(rows: readonly ComparisonRow[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (row.kind !== 'pair' || row.elided) continue
    if (row.change === 'inserted' && row.proposed) out.push(row.proposed)
    else if (row.change === 'changed' && row.segments) {
      for (const s of row.segments) if (s.type === 'inserted') out.push(s.text)
    }
  }
  return out
}

const withoutHyphens = (w: string): string => w.replace(/-/g, '')

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Every comparable word of the draft's Gesetzestext, hyphen-insensitive.
 *
 * Both spellings of each word go in, because the two documents break lines in
 * different places: the annex's PDF splits
 * "Schieneninfrastruktur-Dienstleistungsgesellschaft" across a line and the
 * draft does not, or the other way round.
 */
export function draftWordBag(text: string): Set<string> {
  const bag = new Set<string>()
  for (const w of comparableTokens(normalizeText(text))) {
    bag.add(w)
    bag.add(withoutHyphens(w))
  }
  return bag
}

/**
 * What rule 2 asks of the draft's words.
 *
 * Two questions, and they are deliberately separate. The rule took a `Set`
 * and asked `size > 0` to decide whether it had anything to compare against
 * — which was the same question as "does this § have words" only as long as
 * the bag was the whole draft. With a reference per §, an *empty* bag is the
 * finding rather than the excuse: a § the draft's instructions never address
 * is the annex showing a change nobody ordered. So the disarm switch names
 * what it means — was the Gesetzestext readable at all — and a bag with no
 * words for this § still speaks.
 *
 * An interface rather than a `Set` because a per-§ reference is the union of
 * up to three bags, and a view over them beats a third copy per §.
 */
export interface WordBag {
  /** Does the draft's Gesetzestext offer this word for this §? */
  has: (word: string) => boolean
  /** Was there a Gesetzestext to compare against at all? */
  read: boolean
}

/**
 * The draft's words, per law and per §, plus what could not be addressed.
 *
 * Rule 2's reference used to be the whole draft, which is blind to the fault
 * it meets most often: a sentence dragged out of a *neighbouring*
 * Novellierungsanordnung is in the draft, only in the wrong §. Measured by
 * fault injection over GP XXVIII (`scripts/harness/faultInjection.ts`), the
 * whole-draft bag was the weakest number the gate had and the per-§ reference
 * is by far its strongest; the catch rates per path are the table in
 * docs/architecture.md §12.13, and they are not repeated here, because two
 * copies of one measurement drift apart.
 *
 * `general` is what keeps the narrowing honest. An instruction whose address
 * could not be read contributes its words to every § of its law, so a parse
 * failure of ours can only *weaken* the rule and never fail a §. Every per-§
 * bag is a subset of `whole` — `annex/annexDraft.ts` reads a unit's blocks
 * with the same Gliederungssymbole `draftTextOf` reads the whole draft with —
 * so no catch the wide reference had can be lost; the whole risk of the
 * change is false alarms, and that is the number the harness watches.
 * Building it costs a median 1,4 ms per draft and 60 ms for the largest of
 * GP XXVIII, once per draft per day behind `annex/annexGuardService.ts`.
 */
export interface DraftBags {
  /** Law key → § key (`designationKey`) → the words its own instructions carry. */
  byLaw: Map<string | null, Map<string, Set<string>>>
  /** Law key → the words of its instructions that name no § at all. */
  general: Map<string | null, Set<string>>
  /** Every word of the draft — the fallback where a law could not be addressed. */
  whole: Set<string>
  /** Instructions read, and how many named a §. For the coverage line. */
  units: number
  addressed: number
  /**
   * …and how many of the rest name no § *by nature* rather than by our
   * failure: the table of contents, the law's title, an Abschnitt heading, an
   * instruction to the whole text. Those belong in the general bag and always
   * will, so a residual that counts them reads as a bigger gap than it is —
   * on GP XXVIII they are 173 of the PDF path's 321 remaining units and 93 of
   * the table path's 184.
   */
  rightlyWithoutParagraph: number
  /** Why the others did not, counted by reason. */
  reasons: Map<string, number>
}

/** An address `designationKey` reads as no § at all: "Abschnitt 9b", the title. */
const REASON_NOT_A_PARAGRAPH = 'die Anordnung adressiert keinen Paragraphen, sondern einen Abschnitt oder den Titel'

/**
 * Group the draft's instructions into the bags rule 2 compares against.
 *
 * Pure and inside the gate on purpose: the caller passes the draft's blocks
 * and the *rule* decides what a § may draw on, so the harness measures the
 * shipped decision rather than a caller's copy of it — the mistake this
 * module was extracted to undo.
 */
export function draftBags(blocks: readonly TextBlock[]): DraftBags {
  const byLaw = new Map<string | null, Map<string, Set<string>>>()
  const general = new Map<string | null, Set<string>>()
  const reasons = new Map<string, number>()
  /** Law → the designation pairs a renumbering declares to be one provision. */
  const aliases = new Map<string | null, [string, string][]>()
  let addressed = 0
  let rightlyWithoutParagraph = 0
  const units = draftUnits(blocks)
  for (const unit of units) {
    for (const [from, to] of unit.aliases) {
      const a = designationKey(from)
      const b = designationKey(to)
      if (a === null || b === null || a === b) continue
      const pairs = aliases.get(unit.law) ?? []
      pairs.push([a, b])
      aliases.set(unit.law, pairs)
    }
    const words = draftWordBag(unit.text)
    // A § key that cannot be read is not an address: `designationKey` refuses
    // an Abschnitt heading and a bare "(Titel)", and those units belong in
    // the general bag rather than under an invented key.
    const keys = unit.paras.map((p) => designationKey(p)).filter((k): k is string => k !== null)
    if (keys.length === 0) {
      const into = general.get(unit.law) ?? new Set<string>()
      for (const w of words) into.add(w)
      general.set(unit.law, into)
      // Two different silences, and the report keeps them apart: the
      // instruction named nothing (`unit.reason`), or it named a unit that is
      // not a § — an Abschnitt heading, the law's title — which addresses a
      // group of §§ and so belongs to all of them.
      const reason = unit.reason ?? REASON_NOT_A_PARAGRAPH
      // Both of those are the instruction *read*: it names an Abschnitt, the
      // title, the table of contents or the whole text, and there is no § for
      // it to name. Only the remaining reasons are a gap in the grammar.
      if (reason === REASON_NOT_A_PARAGRAPH || reason === NO_PARAGRAPH_ADDRESSED) rightlyWithoutParagraph++
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
      continue
    }
    addressed++
    const law = byLaw.get(unit.law) ?? new Map<string, Set<string>>()
    for (const key of keys) {
      const into = law.get(key) ?? new Set<string>()
      for (const w of words) into.add(w)
      law.set(key, into)
    }
    byLaw.set(unit.law, law)
  }
  // A renumbered § is one provision under two numbers, and the two documents
  // use different ones: the annex prints the § as the standing law designates
  // it, while every instruction after the renumbering addresses it by its new
  // number. So the two designations share a bag — one hop, from the snapshot,
  // because a chain of renumberings ("§ 2 wird § 3, § 3 wird § 4, …") would
  // otherwise merge a whole Verordnung into one bag and the reference would
  // be back to where it started.
  for (const [law, pairs] of aliases) {
    const map = byLaw.get(law)
    if (!map) continue
    const before = new Map([...map].map(([k, v]) => [k, new Set(v)]))
    for (const [a, b] of pairs) {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        const from = before.get(y)
        if (!from) continue
        const into = map.get(x) ?? new Set<string>()
        for (const w of from) into.add(w)
        map.set(x, into)
      }
    }
  }
  return { byLaw, general, whole: draftWordBag(draftTextOf(blocks)), units: units.length, addressed, rightlyWithoutParagraph, reasons }
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The reference rule 2 holds one law's §§ against, as a lookup per §.
 *
 * Three bags, and each of the last two is there because a narrower reference
 * without it would report our own gap as the ministry's:
 *
 * - **the §'s own** instructions — the point of the exercise;
 * - **the law's unreadable** instructions (`general`), because an
 *   instruction whose address nobody could read must weaken the check and
 *   never fail a §;
 * - **the §§ the annex shows no block of its own for** (`shown`). This is the
 *   one the corpus insisted on. Where the annex prints no block for § 8, its
 *   text is not absent from the page — it sits inside the block of § 7,
 *   whose designation the rows inherited. Counting it as "not in the draft"
 *   names the wrong finding: the draft has that text, the *page* has merged
 *   two provisions. Measured over GP XXVIII, it takes the table path from
 *   **15 alarms to 7** (the renumbering pairs below take it from 7 to 3) —
 *   and the PDF path only from 21 to 20, which is the tell: there a row *is*
 *   a provision, cut at the § marker, so almost every § has a block of its
 *   own and the merge cannot happen. It costs the injected faults nothing
 *   worth counting, because their donor is a § the annex does show.
 *
 * A `renumber` op makes two designations one provision, so the two share a
 * bag (`draftBags`): the annex prints the § under the designation the
 * standing law gives it and the instruction addresses the other one, and
 * without that link every renumbered § of a Verordnung reads as unexplained.
 * Worth **4 of the table path's 7 remaining alarms** — three §§ of the
 * Straßenverkehrs-Sicherheitsmanagement-VO, which renumbers its whole text
 * one step up, and one of the Tierschutz-Sonderhaltungsverordnung.
 *
 * The fallback is per law: where a law's instructions could not be read at
 * all — no Artikel key of the draft matches the annex's attribution, a
 * Gesetzestext that segmented to nothing — the whole draft is the reference
 * again and the rule is exactly what shipped before.
 */
export function draftReference(bags: DraftBags, law: string | null, shown: ReadonlySet<string>): (para: string) => WordBag {
  // Whether anything was read at all is a property of the draft, not of one
  // §, and it is the only thing that may disarm the rule.
  const read = bags.whole.size > 0
  const own = bags.byLaw.get(law)
  const general = bags.general.get(law)
  const wide: WordBag = { has: (w) => bags.whole.has(w), read }
  if (own === undefined && general === undefined) return () => wide
  // Everything every § of this law may draw on, built once: the unreadable
  // instructions, and the ones addressed to §§ the annex does not show.
  const inherited = new Set<string>(general ?? [])
  if (own !== undefined) {
    for (const [key, words] of own) {
      if (shown.has(key)) continue
      for (const w of words) inherited.add(w)
    }
  }
  return (para: string): WordBag => {
    const key = designationKey(para)
    const mine = key === null ? undefined : own?.get(key)
    if (mine === undefined) return { has: (w) => inherited.has(w), read }
    return { has: (w) => mine.has(w) || inherited.has(w), read }
  }
}

/** "Land- **und** Forstwirtschaft": an Ergänzungsstrich, not a broken word. */
const HYPHEN_JOINER_RE = /^(?:und|oder|bzw|sowie|beziehungsweise)$/

/** One word the § shows as new, with the spellings the draft may carry it in. */
interface NewWord {
  word: string
  /** The hyphen fragment before it, glued on with and without the hyphen */
  joined: string[]
}

/**
 * The words of a § that are new to the reader — inserted, and in neither the
 * left column nor the standing heading.
 *
 * A token ending in "-" is a fragment either way and never counts on its own:
 * in "Land- und Forstwirtschaft" it is an Ergänzungsstrich, in
 * "Schieneninfrastruktur-|Dienstleistungsgesellschaft" a line break. What
 * differs is the *next* token — after a joiner it stands for itself, and
 * otherwise it may be the tail of one word, so it is offered to the draft bag
 * glued to the fragment as well. Left unhandled, hyphen breaks were 36 of the
 * missing words in the corpus (2026-09-10).
 */
function newWordsOf(inserted: readonly string[], left: ReadonlySet<string>, heading: ReadonlySet<string>): NewWord[] {
  const items: NewWord[] = []
  let i = 0
  while (i < inserted.length) {
    const word = inserted[i]!
    i++
    if (word.endsWith('-')) {
      const next = inserted[i]
      if (next !== undefined && !HYPHEN_JOINER_RE.test(next)) {
        items.push({ word: next, joined: [word.slice(0, -1) + next, word + next] })
        i++
      }
      continue
    }
    items.push({ word, joined: [] })
  }
  return items.filter((it) => !left.has(it.word) && !heading.has(it.word))
}

function inDraft(bag: WordBag, it: NewWord): boolean {
  if (bag.has(it.word) || bag.has(withoutHyphens(it.word))) return true
  return it.joined.some((j) => bag.has(j) || bag.has(withoutHyphens(j)))
}

/** What the two right-column rules made of one §. */
export interface RightColumnCheck {
  /**
   * The § shows as new a stretch of ≥ `MIN_STANDING_STRETCH` comparable words
   * that stands verbatim in the RIS § and is absent from the left column.
   */
  alreadyStanding: boolean
  /** Too much of what the § shows as new is missing from the draft's Gesetzestext. */
  notInDraft: boolean
  /** Words shown as new that the left column and the § heading do not carry */
  newWords: number
  /** …of those, the ones the draft's Gesetzestext does not have */
  missingWords: number
  /**
   * …and which words those are, for the report.
   *
   * Every false alarm of this rule has to be inspectable, and a count cannot
   * be: "39 of 89 missing" is a finding, "a ministry's name and a spelling"
   * is a verdict on it. `Coverage.missing` carries the same for the left
   * column and for the same reason.
   */
  missing: string[]
  /** The first stretch that fired rule 1, for the report */
  standingStretch: string | null
}

/**
 * Hold the §'s right column against the standing law and against the draft.
 *
 * Pure, and exported so the harness measures the shipped decision instead of
 * a replica of it — the mistake this module was extracted to undo.
 *
 * **Why the left check alone is not enough.** Containment is one-directional:
 * it asks whether the standing § accounts for the column, never whether the
 * column accounts for the §. Text the parse *loses* on the left therefore
 * passes, and the word diff beside it paints that text green as an addition —
 * the page then claims the draft adds what the law already contains.
 * Injected over the corpus (drop the second sentence of a verified §'s left
 * column, re-diff, 1.092 §§, 2026-09-10): **1.019 of them, 93,3 %, still pass
 * the left check.**
 *
 * **Rule 1, „bereits geltend".** Whole stretch, contiguous, exact after
 * `comparableTokens`: no partial runs and no bag ratio, both measured and
 * rejected (below). The left column is checked too, and that exception is the
 * point — a sentence the ministry *moved* within the § is present on the left
 * and must not fire.
 *
 * **Rule 2, „nicht im Entwurf".** Everything the annex shows as new should
 * come from the draft's own Gesetzestext, which RIS publishes beside the
 * annex — and from the part of it that is addressed to *this* §. A draft
 * whose text could not be read disarms this rule rather than condemning every
 * § of it (`WordBag.read`), and so does every instruction whose address
 * nobody could read: those words go to every § of their law (`draftBags`).
 *
 * Neither rule may *verify* anything, and the caller must not let them: the
 * bag test in particular passes happily on garbage lifted from another part
 * of the same draft.
 *
 * **Reach, measured against the same injection** — stated because a gate
 * whose reach is unstated gets read as complete. Rule 1 catches **464 of
 * 1.092 (42,5 %)**, rule 2 catches 181 of the same faults (a sentence the
 * parser loses is unchanged law, so the draft's instructions usually do not
 * quote it either), together **567, 51,9 %** — against 73 (6,7 %) for the
 * left check alone. Of rule 1's 628 misses, 464 are no misses at all (the
 * draft changes that sentence too) and 29 are stretch boundaries; on the
 * subset where the rule can apply it catches 464 of 628, 74 %. Those are the
 * whole-draft numbers; the per-path table for the per-§ reference is
 * docs/architecture.md §12.13 and is deliberately not copied here.
 *
 * **Variants measured and rejected — so nobody re-invents them:**
 *
 * - **Longest common run** of an inserted stretch inside the standing §: 87 %
 *   of the injected losses, but 191 false positives at k = 6 (116 at k = 8,
 *   60 at k = 10) — legal drafting repeats whole formulae, and a rule that
 *   fires on boilerplate withholds sound law. It would buy the 29 boundary
 *   misses; 191 is not that price.
 * - **Whole sentences of the right column** that stand in the § and are
 *   absent left (abbreviation-aware splitter, ≥ 8 tokens): catches *fewer*
 *   injected faults than the whole-stretch rule (423 against 540 of 1.074)
 *   and adds false positives from legitimately repeated sentences.
 * - **A ceiling on the missing share**, the obvious guard against a § block
 *   spanning two provisions: at 50 % it costs the table path its whole gain
 *   (R-neu 184 → 64 catches, below the 76 of the whole-draft bag), because a
 *   § with little new text of its own is exactly where an injected sentence
 *   dominates the share.
 *
 * The **per-§ reference** itself is no longer among them: it shipped on
 * 2026-09-10 (`draftBags`), together with the two things that keep it honest
 * — the general bag for instructions nobody could address, and the rule that
 * text of a § the annex prints no block of its own for is inherited rather
 * than missing.
 */
export function rightColumnCheck(rows: readonly ComparisonRow[], standing: StandingText, draft: WordBag): RightColumnCheck {
  const pairs = rows.filter((r) => r.kind === 'pair')
  const standingTokens = comparableTokens(normalizeText(standing.text))
  // The whole left column, unchanged and elided rows included: a stretch the
  // annex prints on both sides is shown, not lost.
  const leftTokens = comparableTokens(normalizeText(pairs.map((r) => r.current).join(' ')))
  const leftBag = new Set(leftTokens)
  const headingBag = new Set(comparableTokens(normalizeText(standing.heading)))

  let standingStretch: string | null = null
  const inserted: string[] = []
  for (const stretch of insertedStretches(pairs)) {
    const tokens = comparableTokens(normalizeText(stretch))
    inserted.push(...tokens)
    if (standingStretch === null && tokens.length >= MIN_STANDING_STRETCH && seqContains(standingTokens, tokens) && !seqContains(leftTokens, tokens)) {
      standingStretch = stretch
    }
  }

  const words = newWordsOf(inserted, leftBag, headingBag)
  const missing = words.filter((it) => !inDraft(draft, it))
  // A draft whose XML could not be read disarms the rule instead of failing
  // every § of it — but a bag that is empty *for this §* does not: since the
  // reference is per § (`draftBags`), that is the annex showing a change no
  // instruction of the draft orders. The counts stay honest either way, so a
  // report cannot read "nothing missing" where nothing was compared.
  const notInDraft = draft.read && words.length >= MIN_NEW_WORDS && missing.length >= MIN_MISSING_WORDS && (words.length - missing.length) / words.length < DRAFT_THRESHOLD
  return { alreadyStanding: standingStretch !== null, notInDraft, newWords: words.length, missingWords: missing.length, missing: missing.map((it) => it.word), standingStretch }
}

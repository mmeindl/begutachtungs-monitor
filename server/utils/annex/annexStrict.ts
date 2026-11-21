/**
 * The Bund's Textgegenüberstellung held word for word against the wording
 * the draft writes for each § (21.11.2026) — the Länder's strict check
 * (`laender/landTguStrict.ts`), asked of the ministry's annex rows.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The gate's rule 2 (`rightColumn.ts`) holds a §'s new words against a bag of
 * the draft's words for it, with floors: by construction it passes a single
 * wrong figure, a swapped word and a dropped sentence (fault injection: about
 * 0 to 3 % caught). The strict check holds the same new words as a sequence
 * against the payloads and quoted wordings of the instructions that name the
 * §, and every word of those payloads against the right column. It is one
 * of the two word-for-word witnesses the annex page may rest a § on; the
 * other is the oracle (`kons/tguOracle.ts`). Both read the draft
 * independently, and this module never asks the engine's instruction parser
 * what a quotation is.
 *
 * WHAT IS HELD is what the page shows, read as the gate reads it: the § group
 * of `verifyAnnex` (`row.gld ?? row.para`, `annexParagraphKey`), each row's
 * own word diff (`ComparisonRow.segments`) — an inserted row's whole new
 * text, an unchanged row's text, a removed row's text struck — so the words
 * marked new are exactly `insertedStretches`. An elided row is the annex
 * saying it left text out and carries no word. Run on the rows as parsed,
 * before the gate empties the withheld ones.
 *
 * WHAT CANNOT BE HELD IS SAID (`state: 'unchecked'`, with the reason), never
 * passed: a § whose law the draft does not name with certainty, a § a page
 * the reader could not read runs across, a changed row too long for the word
 * diff, a § showing no new text, and everything `strictCheck` refuses.
 */
import type { LawDiffSegment, LawDiffUnit } from '../../../shared/types'
import { annexParagraphKey, designationKey } from './annexText'
import type { ComparisonRow } from './comparisonRows'
import type { TextBlock } from '../lawtext/lawUnits'
import { REASON_CUT, REASON_UNREADABLE_DESIGNATION, type AnnexDraft } from './verdict'
import { refusedAddress } from '../laender/landTguGuard'
import { STRICT_UNCHECKED, draftWording, strictCheck, type DraftWording, type StrictCheck } from '../laender/landTguStrict'

/** Why a § was not held, beside `STRICT_UNCHECKED`: the draft's Gesetzestext could not be read at all. */
export const DRAFT_UNREAD = 'der Gesetzestext des Entwurfs ließ sich nicht lesen'

/** „xx", „xxx", „yyyy", „202x", „20xx": a figure written as letters, as a ministry writes what it cannot know yet. */
const PLACEHOLDER_RE = /^(?:\d{0,3}[xy]{1,4}|[xy]{2,4})$/
/** The organ of a Bundesgesetzblatt citation as `strictTokens` reads it: „bgbl", then „i", „ii" or „iii". */
const PART_RE = /^(?:i|ii|iii)$/

/**
 * The placeholders of a token list (`Placeholders`): a placeholder that is a
 * Bundesgesetzblatt's number or year — „BGBl. I Nr. xxx/202x", „BGBl. II Nr.
 * xx/xxxx" — the Nr. and the year of the act the draft itself will be
 * promulgated as, which neither document knows when it is written. Nowhere
 * else: a placeholder for a figure of the law's own text („(xx)" for an
 * Absatz, an amount) is the text, and a difference.
 *
 * Measured on GP XXVIII (21.11.2026): of the 209 §§ the oracle confirms and
 * the strict check objected to, 28 differ in nothing but such a citation —
 * „xx/2025" against „xxx/202x", „xxx/2026" against „xxx/202x".
 */
export function bgblPlaceholders(tokens: readonly string[]): boolean[] {
  return tokens.map((t, i) => {
    if (!PLACEHOLDER_RE.test(t)) return false
    const nr = tokens[i - 1] === 'nr' ? i - 1 : tokens[i - 2] === 'nr' ? i - 2 : -1
    if (nr < 0) return false
    return tokens[nr - 1] === 'bgbl' || (PART_RE.test(tokens[nr - 1] ?? '') && tokens[nr - 2] === 'bgbl')
  })
}

/** A division's designator as `strictTokens` reads it: „3. Hauptstück", „IIIa. Abschnitt", „ABSCHNITT II", „2.Teil". */
const DIVISION_WORD = new Set(['teil', 'hauptstück', 'abschnitt', 'unterabschnitt', 'kapitel'])
const DIVISION_NUMBER_RE = /^(?:\d+[a-z]?|[ivxl]+[a-z]?)$/

/**
 * What a payload prints for the § from its designation on: the heading above
 * the designation (`Wording.optional`, „Liquiditätsmanagement" over „§ 55a.
 * (1) …"), and the first words of its text below it. Null where no payload
 * for the § prints its designation.
 */
function payloadHead(wordings: readonly (DraftWording | undefined)[], own: string): { heading: string[]; body: string[] } | null {
  const number = own.replace(/^§\s*/, '').toLowerCase()
  for (const w of wordings.flatMap((x) => x?.wordings ?? [])) {
    if (w.repeats) continue
    const at = w.tokens.findIndex((t, i) => t === '§' && w.tokens[i + 1] === number)
    if (at >= 0 && w.optional.slice(0, at + 2).every(Boolean)) return { heading: w.tokens.slice(0, at), body: w.tokens.slice(at + 2).filter((_, k) => !w.optional[at + 2 + k]).slice(0, 3) }
  }
  return null
}

const opensDivision = (words: readonly string[]): boolean =>
  (DIVISION_NUMBER_RE.test(words[0] ?? '') && DIVISION_WORD.has(words[1] ?? '')) || (DIVISION_WORD.has(words[0] ?? '') && DIVISION_NUMBER_RE.test(words[1] ?? ''))

/**
 * The division headings the annex prints over a § before its own heading —
 * „3. Hauptstück OGAW 2. Abschnitt Bewilligung des OGAW und allgemeine
 * Bestimmungen" over „Liquiditätsmanagement § 55a. (1) …" (21.11.2026). No
 * instruction for the § writes them: they head the §§ of a division, and the
 * draft's payload prints the § from its own heading on. Read only where the
 * column opens with a division's designator („3. Hauptstück", „ABSCHNITT
 * II"), and only up to where the § itself begins: the heading the draft's
 * payload prints for it, followed by its designation or, where the column
 * prints none (a table's row), by the payload's first words; or, where no
 * payload prints a heading, the heading the column shows unchanged before
 * the designation. The heading and everything after it are held as before.
 *
 * Measured on GP XXVIII: of the 209 §§ the oracle confirms and the strict
 * check objected to, 32 differed in such a stack.
 */
export function divisionStack(words: readonly string[], marked: readonly boolean[], own: string, head: { heading: string[]; body: string[] } | null): boolean[] {
  const out = words.map(() => false)
  if (!opensDivision(words)) return out
  const number = own.replace(/^§\s*/, '').toLowerCase()
  const at = (i: number, seq: readonly string[]) => seq.length > 0 && seq.every((w, k) => words[i + k] === w)
  let start = -1
  if (head && head.heading.length) {
    for (let i = 1; i < words.length && start < 0; i++) {
      const after = i + head.heading.length
      if (at(i, head.heading) && (at(after, ['§', number]) || at(after, head.body))) start = i
    }
  } else {
    // The § heading unchanged, the stack above it new: „[1. Unterabschnitt Regelpublizität Zwischenberichte] Berichtsinhalt in Sonderfällen § 127."
    const designation = words.findIndex((w, i) => w === '§' && words[i + 1] === number)
    let k = 0
    while (k < designation && marked[k]) k++
    if (k > 0 && k < designation && marked.slice(k, designation).every((m) => !m)) start = k
  }
  for (let i = 0; i < start; i++) out[i] = true
  return out
}

/** Blocks whose text keys a law (`segmentUnits`): read as folded, as the rows' law is. */
const HEADING_KINDS = new Set<TextBlock['kind']>(['title', 'article', 'section'])

const unchecked = (reason: string): StrictCheck => ({ state: 'unchecked', reason, notInDraft: [], notShown: [], newWords: 0, draftWords: 0 })

interface Group {
  law: string | null
  para: string
  rows: ComparisonRow[]
}

/** The gate's § groups (`verifyAnnex`): a row that opens no § of its own belongs to the one it inherited. */
function groupsOf(rows: readonly ComparisonRow[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (!para) continue
    const key = annexParagraphKey(row.law, para)
    const group = groups.get(key) ?? { law: row.law, para, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return groups
}

/**
 * One § group as the page shows it, in the shape `strictCheck` reads: the
 * rows' segments one after the other, a space between two rows. Null where a
 * changed row carries no word diff (`MAX_DP_CELLS`): what it shows as new is
 * then not marked, and nothing can be held.
 */
function shownUnit(group: Group, key: string, afters: readonly string[]): LawDiffUnit | null {
  const rows = group.rows.filter((r) => !r.elided)
  const allNew = rows.every((r) => r.change === 'inserted')
  const segments: LawDiffSegment[] = []
  for (const row of rows) {
    if (segments.length) segments.push({ type: 'equal', text: ' ' })
    if (row.change === 'unchanged') segments.push({ type: 'equal', text: row.proposed })
    else if (row.change === 'inserted') segments.push({ type: 'inserted', text: row.proposed })
    else if (row.change === 'removed') segments.push({ type: 'removed', text: row.current })
    else if (row.segments) segments.push(...row.segments)
    else return null
  }
  return {
    article: group.law,
    articleKey: null,
    fromArticleKey: null,
    id: key,
    fromId: afters[0] ?? key,
    heading: null,
    quotedHeading: null,
    change: allNew ? 'inserted' : 'changed',
    editorial: false,
    fromText: rows.map((r) => r.current).join(' '),
    toText: allNew ? rows.map((r) => r.proposed).join(' ') : segments.filter((s) => s.type !== 'removed').map((s) => s.text).join(''),
    segments: allNew ? null : segments,
  }
}

/**
 * The strict state of every § group of a parsed annex, under the gate's key
 * (`annexParagraphKey`): held against the draft's wording for the § under
 * its own number and, where the annex prints it renumbered
 * (`ComparisonRow.paraAfter`), under the new one (`paragraphReference`).
 *
 * The law is the row's; an unattributed row's is the one law the draft
 * amends, or — where no Artikel amends a law (a Verordnung, a draft without
 * Artikel) — the one law its instructions are filed under. Anything else is
 * not named with certainty, and not held.
 */
export function annexStrictChecks(rows: readonly ComparisonRow[], draft: Pick<AnnexDraft, 'articles' | 'blocks'>): Map<string, StrictCheck> {
  const groups = groupsOf(rows)
  const out = new Map<string, StrictCheck>()
  if (!draft.blocks.length) {
    for (const key of groups.keys()) out.set(key, unchecked(DRAFT_UNREAD))
    return out
  }
  // The quotation marks as RIS prints them (`TextBlock.quoted`): which one opens a quotation is what `quoteRoles` reads.
  // Not in a heading, whose text names the law (`DraftUnit.law`) as the rows and the Artikel name it.
  const blocks = draft.blocks.map((b) => (b.quoted === undefined || HEADING_KINDS.has(b.kind) ? b : { ...b, text: b.quoted }))
  // An instruction whose address the engine's grammar refuses still names its § where it opens with it
  // (`refusedAddress`). Not the Länder's other two readings: a RIS draft prints the Gliederungssymbol of every §
  // a payload installs, which `draftUnits` reads, and numbers each instruction as a block of its own. Read on the
  // Bund, `installedDesignations` took citations in quoted text for §§ a payload installs.
  const wording = draftWording(blocks, refusedAddress)
  const amending = draft.articles.filter((a) => a.amends)
  const lawKeys = [...wording.keys()]
  const lawKeyOf = (law: string | null): string | null | undefined => (law !== null ? law : amending.length === 1 ? amending[0]!.key : amending.length === 0 && lawKeys.length === 1 ? lawKeys[0] : undefined)
  // What the annex prints a block of its own for, per law: the draft's text for any other § may sit inside a shown one (`draftReference`).
  const keysOf = (group: Group): { own: string | null; afters: string[] } => {
    const own = designationKey(group.para)
    const afters = [...new Set(group.rows.map((r) => (r.paraAfter === null ? null : designationKey(r.paraAfter))).filter((k): k is string => k !== null && k !== own))]
    return { own, afters }
  }
  const shown = new Map<string | null, Set<string>>()
  for (const group of groups.values()) {
    const { own, afters } = keysOf(group)
    const into = shown.get(group.law) ?? new Set<string>()
    for (const k of [own, ...afters]) if (k !== null) into.add(k)
    shown.set(group.law, into)
  }
  for (const [groupKey, group] of groups) {
    const { own, afters } = keysOf(group)
    if (!group.rows.some((r) => !r.elided && (r.change === 'inserted' || r.change === 'changed'))) {
      out.set(groupKey, unchecked(STRICT_UNCHECKED.nothingNew))
      continue
    }
    if (own === null) {
      out.set(groupKey, unchecked(REASON_UNREADABLE_DESIGNATION))
      continue
    }
    if (group.rows.some((r) => r.cut)) {
      out.set(groupKey, unchecked(REASON_CUT))
      continue
    }
    const unit = shownUnit(group, own, afters)
    if (!unit) {
      out.set(groupKey, unchecked(STRICT_UNCHECKED.undiffed))
      continue
    }
    const lawKey = lawKeyOf(group.law)
    if (lawKey === undefined) {
      out.set(groupKey, unchecked(STRICT_UNCHECKED.lawUnnamed))
      continue
    }
    const keys = [own, ...afters]
    const law = wording.get(lawKey)
    const printed = shown.get(group.law) ?? new Set<string>()
    const elsewhere = [...(law?.generalText ?? []), ...[...(law?.byKey ?? [])].filter(([k]) => !printed.has(k)).flatMap(([, w]) => [...w.wordings.map((x) => x.tokens), ...w.text])]
    const wordings = keys.map((k) => law?.byKey.get(k))
    const head = payloadHead(wordings, own)
    const aboveParagraph = (words: readonly string[], marked: readonly boolean[]) => divisionStack(words, marked, own, head)
    out.set(groupKey, strictCheck(unit, wordings, { general: law?.general ?? [], elsewhere, placeholders: bgblPlaceholders, aboveParagraph }))
  }
  return out
}

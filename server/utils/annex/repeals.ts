/**
 * Which §§ a draft repeals whole — the proof a repeal the annex shows needs
 * before the gate may let it through (`verifyAnnex`, 19.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * A § whose proposed column is empty goes out as „entfällt". The left check
 * confirms it, because the left column IS the law in force, and neither
 * right-column rule reads a removed row. But an empty right column is also
 * what the PDF reader leaves where it missed the § on that side — a new text
 * quoted „„§ 1. …“" under „§ 1 lautet:", an annex that prints the
 * instruction instead of the text, a § renumbered and paired by its old
 * number. So the draft has to say it: an instruction of the same law that
 * deletes the § itself, a list or a range that names it, or a whole division
 * it stands in. The Länder reader keeps the same rule (`draftDeletes` in
 * `laender/landTgu.ts`).
 */
import { segmentUnits, type TextBlock } from '../lawtext/lawUnits'
import { articleBlocks, type DraftArticle } from '../lawtext/draftArticles'
import { namedParagraphs, parseAddress, parseInstruction } from '../kons/novao'
import type { ComparisonRow } from './comparisonRows'
import { designationKey } from './annexText'

/** What a draft repeals whole in one law. */
export interface DraftRepeals {
  /** §§, Anlagen, Anhänge repealed by name, as `repealKey`. */
  paragraphs: Set<string>
  /** „die §§ 66 bis 70a": the first and the last, as `repealKey`; every § between them goes too (`inRange`). */
  ranges: [string, string][]
  /** Divisions repealed whole, as `divisionKey`: „3. abschnitt", „9. teil". */
  divisions: Set<string>
}

/**
 * A designation as the repeal check compares it: `designationKey`, and where
 * that reads nothing — a Roman Anhang, „Anhang XIII" — the designation
 * itself, lower case and without its full stop.
 */
export function repealKey(designation: string): string {
  return designationKey(designation) ?? `raw:${designation.replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()}`
}

/**
 * „Die §§ 65, 66 bis 70a und 73 samt Überschriften entfallen.", „Die
 * Anlagen 6, 7 und 10 entfallen.": a list the grammar refuses
 * („keine auflösbare Adresse", 19.11.2026: GuKG-Novelle 2024, 2. Novelle
 * zur Bäderhygieneverordnung). Read only where the grammar typed nothing,
 * and only in this shape — the list, at most the headings, the verb, nothing
 * else — so „In § 16 entfällt Abs. 3" or a quotation can never count.
 */
const LIST_REPEAL_RE = /^(?:\d+[a-z]?\.\s*)?(?:(?:Die|Der|Das)\s+)?(§§?|Anlagen?|Anhänge|Anhang)\s+([\dIVXL]+[a-z]?(?:\s*(?:,|und|sowie|bis)\s*[\dIVXL]+[a-z]?)*)\s+(?:samt\s+(?:den\s+|der\s+)?Überschriften?\s+)?(?:entf(?:ällt|allen)|(?:wird|werden)\s+aufgehoben)\.?$/

/**
 * „Der 9. Teil entfällt.", „Der 3. Abschnitt des 6. Hauptstücks entfällt.":
 * the innermost division is group 1, the division it is qualified by group 2.
 */
const DIVISION_REPEAL_RE = /^(?:\d+[a-z]?\.\s*)?(?:Der|Das|Die)\s+((?:\d+[a-z]?|[IVXL]+)\.\s*(?:Teil|Hauptstück|Abschnitt|Unterabschnitt))\b(?:\s+((?:des|der)\s+[^,;:]{1,60}?))?\s+(?:samt\s+(?:der\s+)?Überschrift\s+)?(?:entfällt|wird\s+aufgehoben)\.?$/i

/** „des Gesetzes", „des Bundesgesetzes", with the division's name in brackets after it: the law itself, no division around this one. */
const LAW_ITSELF_RE = /^des\s+(?:Bundes|Landes)?[Gg]esetzes\b(?:\s*\([^()]*\))?\s*$/

/** A division's designation in either order RIS prints it: „9. Teil", „Abschnitt 13", „ABSCHNITT II". */
const DIVISION_RE = /(?:\b(\d+[a-z]?|[IVXL]+)\.\s*(Teil|Hauptstück|Abschnitt|Unterabschnitt)\b|\b(Teil|Hauptstück|Abschnitt|Unterabschnitt)\s+(\d+[a-z]?|[IVXL]+)\b)/giu

/** „9. teil": number and kind, lower case. */
function divisionKey(number: string, kind: string): string {
  return `${number.toLowerCase()}. ${kind.toLowerCase()}`
}

/** The divisions a standing §'s headings name — RIS files them on the first § of each (`StandingText.heading`). */
export function divisionsOf(heading: string): string[] {
  return [...heading.matchAll(DIVISION_RE)].map((m) => (m[1] ? divisionKey(m[1], m[2]!) : divisionKey(m[4]!, m[3]!)))
}

const KIND_OF: Record<string, string> = { '§': '§', '§§': '§', Anlage: 'Anlage', Anlagen: 'Anlage', Anhang: 'Anhang', Anhänge: 'Anhang' }

/**
 * Everything the draft repeals whole in the law `article` amends, under any
 * Artikel that amends the same Stammnorm (`paragraphsInsertedBy`). Each
 * instruction is read with the engine's own `parseInstruction`: a deletion at
 * the level of the § counts, one inside it („In § 16 entfällt Abs. 3") does
 * not.
 */
export function draftRepeals(blocks: readonly TextBlock[], article: DraftArticle): DraftRepeals {
  const same = (a: DraftArticle): boolean =>
    a.key === article.key || (a.bgbl !== null && article.bgbl !== null && a.bgbl.organ === article.bgbl.organ && a.bgbl.nummer === article.bgbl.nummer)
  const out: DraftRepeals = { paragraphs: new Set(), ranges: [], divisions: new Set() }
  for (const part of articleBlocks(blocks)) {
    if (!same(part.article)) continue
    for (const unit of segmentUnits(part.blocks)) {
      const instructions = unit.blocks.filter((b) => b.kind === 'novao')
      // A lettered line under „2. § 2 wird wie folgt geändert:" inherits the
      // container's address, as `draftUnits` reads it.
      const inherited = instructions[0] ? parseAddress(instructions[0].text) : null
      for (const [i, block] of instructions.entries()) {
        const text = block.text.replace(/\s+/g, ' ').trim()
        const division = DIVISION_REPEAL_RE.exec(text)
        if (division) {
          // „Der 3. Abschnitt des 6. Hauptstücks": the check knows only the
          // innermost division a § stands in, so keyed „3. abschnitt" this
          // would vouch for a removed § in the 3. Abschnitt of any
          // Hauptstück. Such a repeal proves nothing here (19.11.2026).
          // „des Gesetzes („Allgemeine Auskunftspflicht")" qualifies by the
          // law itself, which holds the division once: no qualifier
          // (20.11.2026; two of the four qualified repeals in the corpus).
          // Walking the outer division instead was not built: the other two
          // would need the check to fetch every § back to the Hauptstück's
          // first, which it never does.
          if (division[2] && !LAW_ITSELF_RE.test(division[2])) continue
          const m = /^(\S+)\.\s*(\S+)$/.exec(division[1]!.replace(/\s+/g, ' '))
          if (m) out.divisions.add(divisionKey(m[1]!, m[2]!))
          continue
        }
        const { ops } = parseInstruction(block.text, i === 0 ? null : inherited)
        for (const op of ops) {
          // „Die Überschrift zu § 5 entfällt" deletes a heading, not the §:
          // the § moved or stays, which is the case the rule withholds.
          if (op.kind !== 'delete' || op.target.level !== 'para' || op.target.heading) continue
          for (const para of namedParagraphs(op.target)) out.paragraphs.add(repealKey(para))
        }
        if (ops.length > 0) continue
        const list = LIST_REPEAL_RE.exec(text)
        if (!list) continue
        const kind = KIND_OF[list[1]!]!
        for (const item of list[2]!.split(/\s*(?:,|\bund\b|\bsowie\b)\s*/)) {
          const range = /^(\S+)\s+bis\s+(\S+)$/.exec(item.trim())
          if (range) out.ranges.push([repealKey(`${kind} ${range[1]}`), repealKey(`${kind} ${range[2]}`)])
          else if (item.trim()) out.paragraphs.add(repealKey(`${kind} ${item.trim()}`))
        }
      }
    }
  }
  return out
}

/** „§ 68a" → ['§', 68, 'a']; null for anything else. */
function ordinal(key: string): [string, number, string] | null {
  const m = /^(\S+) (\d+)([a-z]*)$/.exec(key)
  return m ? [m[1]!, Number(m[2]), m[3]!] : null
}

/** Is `key` within „§§ 66 bis 70a"? By number, then letter: § 68a lies between § 68 and § 69. */
export function inRange(key: string, [from, to]: readonly [string, string]): boolean {
  const k = ordinal(key)
  const a = ordinal(from)
  const b = ordinal(to)
  if (!k || !a || !b || k[0] !== a[0] || k[0] !== b[0]) return false
  const cmp = (x: [string, number, string], y: [string, number, string]) => (x[1] !== y[1] ? x[1] - y[1] : x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0)
  return cmp(a, k) <= 0 && cmp(k, b) <= 0
}

/**
 * Does the draft repeal this § whole? By name, by a range around it, or by a
 * division it stands in — `division` is the innermost division the standing
 * law files it under (`divisionsOf`, walked back to the first § of the
 * division by the caller), null where that is not known.
 */
export function repealsParagraph(repeals: DraftRepeals, designation: string, division: string | null): boolean {
  const key = repealKey(designation)
  if (repeals.paragraphs.has(key) || repeals.ranges.some((r) => inRange(key, r))) return true
  return division !== null && repeals.divisions.has(division)
}

/**
 * Does the annex show this § as repealed whole — nothing of it in the
 * proposed column, and at least one row the page renders as „entfällt"?
 * A right column that prints „entfällt" itself is the annex saying so and
 * no claim of ours: its row is `changed`, not `removed`.
 */
export function showsRepeal(rows: readonly ComparisonRow[]): boolean {
  const pairs = rows.filter((r) => r.kind === 'pair')
  return pairs.some((r) => r.change === 'removed') && pairs.every((r) => r.proposed.trim() === '')
}

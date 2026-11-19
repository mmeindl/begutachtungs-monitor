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
  /** Divisions repealed whole, as `divisionKey`: „3. abschnitt", „9. teil", „b. teil". */
  divisions: Set<string>
  /**
   * „Der II. Abschnitt des Teils A": the division and the one it is
   * qualified by, both as `divisionKey`. Proven only for a § whose path
   * holds both (`divisionPath`) — „ii. abschnitt" alone stands in every Teil
   * of the Seeschifffahrts-Verordnung.
   */
  qualified: [string, string][]
}

/** An empty `DraftRepeals`. */
export const noRepeals = (): DraftRepeals => ({ paragraphs: new Set(), ranges: [], divisions: new Set(), qualified: [] })

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
 * Anlagen 6, 7 und 10 entfallen.", „Die Anlagen 1 bis 27 sowie 30 entfallen
 * samt Überschriften." (the headings after the verb since 19.11.2026,
 * 4D9E1224): a list the grammar refuses
 * („keine auflösbare Adresse", 19.11.2026: GuKG-Novelle 2024, 2. Novelle
 * zur Bäderhygieneverordnung). Read only where the grammar typed nothing,
 * and only in this shape — the list, at most the headings, the verb, nothing
 * else — so „In § 16 entfällt Abs. 3" or a quotation can never count.
 */
const LIST_REPEAL_RE = /^(?:\d+[a-z]?\.\s*)?(?:(?:Die|Der|Das)\s+)?(§§?|Anlagen?|Anhänge|Anhang)\s+([\dIVXL]+[a-z]?(?:\s*(?:,|und|sowie|bis)\s*[\dIVXL]+[a-z]?)*)\s+(?:samt\s+(?:den\s+|der\s+)?Überschrift(?:en)?\s+)?(?:entf(?:ällt|allen)|(?:wird|werden)\s+aufgehoben)(?:\s+samt\s+(?:den\s+|der\s+)?Überschrift(?:en)?)?\.?$/

/** A division's number: Arabic, Roman, or the capital letter of a lettered Teil („Teil B"). */
const DIVISION_NUMBER = String.raw`(?:\d+[a-z]?|[IVXL]+|[A-Z])`
/** A division named in a repeal, either order: „3. Abschnitt", „Teil B", „II. ABSCHNITT". */
const DIVISION_NAME = String.raw`(?:(?:\d+[a-z]?|[IVXL]+)\.\s*(?:Teil|Hauptstück|Abschnitt|Unterabschnitt|TEIL|HAUPTSTÜCK|ABSCHNITT|UNTERABSCHNITT)|(?:Teil|Hauptstück|Abschnitt|Unterabschnitt)\s+${DIVISION_NUMBER})`

/**
 * „Der 9. Teil entfällt.", „Der Teil B entfällt.", „Die Teile B und C
 * entfallen.", „Der II. Abschnitt des Teils A entfällt.": the division or
 * divisions are group 1, the division they are qualified by group 2.
 *
 * The plural and the lettered Teil since 19.11.2026: the Seeschifffahrts-
 * Verordnung's draft (4D9E1224) repeals 177 §§ by „Die Teile B und C
 * entfallen", „Die Teile J, K und L entfallen" and „Der II. Abschnitt des
 * Teils A entfällt", and none of them was read.
 */
const DIVISION_REPEAL_RE = new RegExp(
  String.raw`^(?:\d+[a-z]?\.\s*)?(?:Der|Das|Die)\s+(${DIVISION_NAME}(?:\s*(?:,|und|sowie)\s*${DIVISION_NAME})*|(?:Teile|Hauptstücke|Abschnitte|Unterabschnitte)\s+${DIVISION_NUMBER}(?:\s*(?:,|und|sowie)\s*${DIVISION_NUMBER})*)` +
  String.raw`(?:\s+((?:des|der)\s+[^,;:]{1,60}?))?\s+(?:samt\s+(?:der\s+|den\s+)?Überschrift(?:en)?\s+)?(?:entfällt|entfallen|(?:wird|werden)\s+aufgehoben)(?:\s+samt\s+(?:der\s+|den\s+)?Überschrift(?:en)?)?\.?$`,
)

/** „des Gesetzes", „des Bundesgesetzes", with the division's name in brackets after it: the law itself, no division around this one. */
const LAW_ITSELF_RE = /^des\s+(?:Bundes|Landes)?[Gg]esetzes\b(?:\s*\([^()]*\))?\s*$/

/**
 * A division's designation in either order RIS prints it: „9. Teil",
 * „Abschnitt 13", „ABSCHNITT II", „TEIL B". A letter is read only as a
 * capital (`divisionsOf`): the flag that lets „TEIL" match lets „a" too.
 */
const DIVISION_RE = /(?:\b(\d+[a-z]?|[IVXL]+)\.\s*(Teil|Hauptstück|Abschnitt|Unterabschnitt)\b|\b(Teil|Hauptstück|Abschnitt|Unterabschnitt)\s+(\d+[a-z]?|[IVXL]+|[A-Z])(?![\p{L}\d]))/giu

/** „9. teil": number and kind, lower case. */
function divisionKey(number: string, kind: string): string {
  return `${number.toLowerCase()}. ${kind.toLowerCase()}`
}

/** The divisions a standing §'s headings name — RIS files them on the first § of each (`StandingText.heading`). */
export function divisionsOf(heading: string): string[] {
  return [...heading.matchAll(DIVISION_RE)]
    .filter((m) => m[1] || !/^[a-z]$/.test(m[4]!))
    .map((m) => (m[1] ? divisionKey(m[1], m[2]!) : divisionKey(m[4]!, m[3]!)))
}

/** „Teils", „Hauptstückes" → „teil", „hauptstück": the kind of a division named in the genitive. */
function kindOf(word: string): string {
  return word.toLowerCase().replace(/(?:es|s)$/, '').replace(/^(teil|hauptstück|abschnitt|unterabschnitt).*$/, '$1')
}

/** „3. Abschnitt", „Teil B", „II. ABSCHNITT" → `divisionKey`; null for anything else. */
function nameKey(name: string): string | null {
  const t = name.replace(/\s+/g, ' ').trim()
  const a = /^(\S+)\.\s*(\S+)$/.exec(t)
  if (a) return divisionKey(a[1]!, kindOf(a[2]!))
  const b = /^(\S+)\s+(\S+)$/.exec(t)
  return b ? divisionKey(b[2]!, kindOf(b[1]!)) : null
}

/** The divisions group 1 of `DIVISION_REPEAL_RE` names, as `divisionKey`. */
function repealedDivisions(group: string): string[] {
  const plural = /^(Teile|Hauptstücke|Abschnitte|Unterabschnitte)\s+(.*)$/.exec(group.trim())
  if (plural) {
    const kind = plural[1]!.replace(/e$/, '')
    return plural[2]!.split(/\s*(?:,|\bund\b|\bsowie\b)\s*/).filter(Boolean).map((n) => divisionKey(n, kind))
  }
  return group.split(/\s*(?:,|\bund\b|\bsowie\b)\s*/).filter(Boolean).map(nameKey).filter((k): k is string => k !== null)
}

/** „des Teils A", „des 6. Hauptstücks", „der 2. Unterabschnitte" → `divisionKey`; null where it names no division. */
function qualifierKey(qualifier: string): string | null {
  const q = qualifier.replace(/^(?:des|der)\s+/, '').trim()
  const a = /^(\d+[a-z]?|[IVXL]+)\.\s*(Teil|Hauptstück|Abschnitt|Unterabschnitt)\w*$/i.exec(q)
  if (a) return divisionKey(a[1]!, kindOf(a[2]!))
  const b = /^(Teil|Hauptstück|Abschnitt|Unterabschnitt)\w*\s+(\d+[a-z]?|[IVXL]+|[A-Z])$/.exec(q)
  return b ? divisionKey(b[2]!, kindOf(b[1]!)) : null
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
  const out = noRepeals()
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
          // „Der 3. Abschnitt des 6. Hauptstücks": keyed „3. abschnitt" alone
          // this would vouch for a removed § in the 3. Abschnitt of any
          // Hauptstück (19.11.2026). Kept as a pair, it proves a repeal only
          // where the §'s division path holds both (`divisionPath`,
          // 19.11.2026). „des Gesetzes („Allgemeine Auskunftspflicht")"
          // qualifies by the law itself, which holds the division once: no
          // qualifier. A qualifier this cannot read proves nothing.
          const inner = repealedDivisions(division[1]!)
          if (division[2] && !LAW_ITSELF_RE.test(division[2])) {
            const outer = qualifierKey(division[2])
            if (outer) for (const d of inner) out.qualified.push([d, outer])
            continue
          }
          for (const d of inner) out.divisions.add(d)
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
 * division it stands in — `path` holds the divisions the standing law files
 * it under, innermost first (`divisionPath`), as far as they are known.
 */
export function repealsParagraph(repeals: DraftRepeals, designation: string, path: readonly string[]): boolean {
  const key = repealKey(designation)
  if (repeals.paragraphs.has(key) || repeals.ranges.some((r) => inRange(key, r))) return true
  return path.some((d) => repeals.divisions.has(d)) || repeals.qualified.some(([inner, outer]) => path.includes(inner) && path.includes(outer))
}

/** „ii. abschnitt" → „abschnitt". */
const kindOfKey = (key: string): string => key.slice(key.indexOf(' ') + 1)

/**
 * The divisions a § stands in, innermost first, from the headings RIS files
 * over the §§ of its law in printed order (`headings[i]` as `divisionsOf`
 * reads them; undefined for a § the check did not fetch).
 *
 * RIS names a division over its first § only, so the path is walked back.
 * Walking back, a heading belongs to the § only where it is OUTER to every
 * division already taken: going back from § 40 of the Seeschifffahrts-
 * Verordnung, „III. Abschnitt" (§ 37) is its Abschnitt, „I. Abschnitt" over
 * § 27 belongs to an earlier one, and „TEIL C" over the same § is its Teil.
 *
 * Which kind is outer is read from the law itself, never assumed: a heading
 * list „TEIL B | … | I. ABSCHNITT" over one § shows Teil outside Abschnitt.
 * A heading whose order to a division already taken the law never shows
 * ends the walk, and so does a § the check did not fetch — a division not
 * known is a division not proven. Until 19.11.2026 the walk took the
 * innermost division alone and stopped there: no Teil was ever known, and
 * 177 repealed §§ of 4D9E1224 were withheld as unproven.
 */
export function divisionPath(headings: readonly (readonly string[] | undefined)[], at: number): string[] {
  const outer = new Set<string>()
  for (const list of headings) {
    if (!list) continue
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = kindOfKey(list[i]!)
      const b = kindOfKey(list[j]!)
      if (a !== b) outer.add(`${a}>${b}`)
    }
  }
  const path: string[] = []
  for (let i = at; i >= 0; i--) {
    const here = headings[i]
    if (here === undefined) break
    for (const d of [...here].reverse()) {
      const kind = kindOfKey(d)
      if (path.length === 0) {
        path.push(d)
        continue
      }
      const taken = path.map(kindOfKey)
      if (taken.every((t) => outer.has(`${kind}>${t}`) && !outer.has(`${t}>${kind}`))) path.push(d)
      else if (!taken.some((t) => t === kind || outer.has(`${t}>${kind}`))) return path
    }
  }
  return path
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

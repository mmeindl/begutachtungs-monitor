/**
 * The right column of a Land's Textgegenüberstellung against the Land's own
 * draft — the Bund's rule „nicht im Entwurf" (`annex/rightColumn.ts`), asked
 * of what a Land's comparison shows as new (12.11.2026).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The left check (`standsInRis`) holds the text in force against RIS; until
 * this module nothing held the other side, the one the page presents as „so
 * würde es lauten", against anything. A Land's Textgegenüberstellung is its
 * reading aid as the Bund's is the ministry's, and the Bund's measured 10–13 %
 * of proposed versions that differ from the draft itself is why the rule
 * exists there (docs/decisions.md, „The annex confirms text, it never
 * supplies it").
 *
 * WHAT IS CHECKED: the words a § SHOWS AS NEW — the inserted segments of the
 * word diff between the two sides, or the whole new side of a § printed as
 * new — the same stretches `insertedStretches` reads off the Bund's rows. One
 * row per §, built from the diff the page shows: that is no synthetic row,
 * it is exactly what the reader sees marked as new, and the same for every
 * layout (two columns, Oberösterreich's strike-through, Tirol's marks).
 * Rule 1 („bereits geltend") is not asked here: it needs RIS's text of the
 * §, which the left check already holds the old side to.
 *
 * THE THRESHOLDS ARE THE BUND'S, unchanged (`MIN_NEW_WORDS`,
 * `MIN_MISSING_WORDS`, `DRAFT_THRESHOLD`). „More tolerance" is a rejected
 * alternative; extraction noise of a Land's PDF is answered where it arises,
 * in the Land's reader, not by loosening the rule.
 *
 * KÄRNTEN IS NOT GUARDED: its right column is not the law as it would read
 * but the Novelle's own amending instructions, reprinted beside the place
 * they amend, and the page composes a § only from a payload that prints it
 * whole (`landTguKaernten.ts`). There is no convenience text of the Land's
 * to hold against the draft — what the rule would compare is the Novelle
 * against its own reprint.
 */
import type { LawDiffUnit } from '../../../shared/types'
import type { TextBlock } from '../lawtext/lawUnits'
import type { ComparisonRow } from '../annex/comparisonRows'
import { designationKey } from '../annex/annexText'
import { draftBags, draftReference, draftWordBag, rightColumnCheck, type DraftBags, type RightColumnCheck, type WordBag } from '../annex/rightColumn'
import { draftUnits } from '../annex/annexDraft'
import { bareLawName } from './landTgu'

/** „§5" → „§ 5"; an article or annex id as it stands („Art. 46a", „Anlage 2"). */
const designationOf = (id: string): string => id.replace(/^§\s*/, '§ ')

/**
 * The draft's law key for a law of the Land's document, or undefined where
 * it cannot be named with certainty — the whole draft is the reference then
 * (`draftReference`'s fallback), which can only weaken the rule.
 *
 * One law in the draft: that one. Several (a package): the Artikel whose
 * title — or, untitled, its clause before the first instruction
 * (`articleClauses`) — names the law, where exactly one does — word by word, each word of
 * the law's name the start of one of the title's, since the title declines
 * it: „Artikel 1 Änderung des Tiroler Raumordnungsgesetzes 2022" names the
 * „Tiroler Raumordnungsgesetz 2022".
 */
export function draftLawKey(law: string | null, keys: readonly (string | null)[], clauses: ReadonlyMap<string, string> = new Map()): string | null | undefined {
  if (keys.length === 1) return keys[0]
  if (!law) return undefined
  const words = bareLawName(law).split(/\s+/).filter(Boolean)
  if (!words.length) return undefined
  const names = (text: string) => {
    const title = text.toLowerCase().split(/[\s,()]+/)
    return words.every((w) => title.some((t) => t === w || (w.length >= 5 && t.startsWith(w))))
  }
  const hits = keys.filter((k): k is string => k !== null && (names(k) || names(clauses.get(k) ?? '')))
  return hits.length === 1 ? hits[0] : undefined
}

/**
 * What an Artikel says before its first instruction, by the Artikel's
 * designation: „Das Oö. Sozialhilfe-Ausführungsgesetz, LGBl. Nr. …, wird wie
 * folgt geändert:" under an untitled „Artikel I" — the only place such a
 * package names its laws (`draftLawKey`).
 */
export function articleClauses(blocks: readonly TextBlock[]): Map<string, string> {
  const out = new Map<string, string>()
  let open: string | null = null
  for (const b of blocks) {
    if (b.kind === 'article') {
      open = b.text
      out.set(open, '')
      continue
    }
    if (open === null) continue
    if (b.kind === 'novao') {
      open = null
      continue
    }
    out.set(open, `${out.get(open)} ${b.text}`.slice(0, 600))
  }
  return out
}

/** An instruction that writes §§ in its payload: inserts, appends, restates, or renames them. */
const INSTALLING_RE = /\b(?:eingefügt|angefügt|lautet|lauten|ersetzt|Bezeichnung(?:en)?)\b/
/**
 * A § designation a payload opens with — right after the opening quote, or
 * after a heading of a few words: „„§ 20a Verweisungen (1) …"",
 * „„Natura 2000-Landschaftspflegepläne § 4a (1) …"", „„§ 7" und „§ 8"" — or
 * the next § of the same payload, after a sentence's end: Salzburg prints
 * §§ 14a and 14b in one quote, „… zur Kenntnis genommene gelten als
 * bewilligte. Gigabit-Netze § 14b (1) …". The heading holds no bracket or §
 * and does not run on into a citation (`RUNS_ON_RE`'s words), and the number
 * is not cited: no „Abs.", „Z", „lit." and no lower-case word after it.
 */
const INSTALLED_RE = /(?:„|(?<=[.;:“”"])\s+)([^„“”"§()]{0,160}?)§\s*(\d+[a-z]*)\.?(?=[\s“”"]|$)(?!\s*(?:Abs\b|Abs\.|Z\s|Z\d|lit\.|Satz\b|und\s+§|bis\s+§|\p{Ll}))/gu
const RUNS_ON_RE = /(?:^|\s)(?:bis|und|oder|sowie|bzw\.|des|der|dem|den|die|das|im|in|zum|zur|vom|von|für|mit|nach|gemäß|laut|siehe|über|auf|aus|bei|an|gegen|ohne)\s*$|,\s*$/

/**
 * The §§ a Land draft's instruction prints in its payload (12.11.2026).
 *
 * The Bund's grammar (`addressedUnits`) reads „wird folgender § 12e
 * eingefügt" and the quoted Gliederungssymbol a RIS draft types; a Land's
 * PDF types none, and its drafts phrase the insertion otherwise — Salzburg
 * „Nach § 13 wird eingefügt: „Duldung … § 13a (1) …"", Oberösterreich
 * „Nach § 20 wird ein neuer § 20a samt Überschrift eingefügt", „Die
 * bisherigen §§ 11 und 12 erhalten die Bezeichnung „§ 7" und „§ 8" und
 * lauten:". Addressed to the anchor alone, the new § had no words of its
 * own, and the rule read its whole text as „not in the draft": 10 of the 12
 * alarms of the first run over GP XXVIII (12.11.2026), every one of them
 * text the draft carries word for word.
 */
export function installedDesignations(text: string): string[] {
  const instruction = text.slice(0, text.indexOf('„') >= 0 ? text.indexOf('„') : text.length)
  if (!INSTALLING_RE.test(instruction)) return []
  const out = new Set<string>()
  for (const m of text.matchAll(INSTALLED_RE)) {
    if (RUNS_ON_RE.test(m[1]!)) continue
    out.add(`§ ${m[2]}`)
  }
  return [...out]
}

/** `draftBags`, with each instruction's words also under the §§ its payload prints (`installedDesignations`). */
export function landDraftBags(blocks: readonly TextBlock[]): DraftBags {
  const bags = draftBags(blocks)
  for (const unit of draftUnits(blocks)) {
    const keys = installedDesignations(unit.text).map((d) => designationKey(d)).filter((k): k is string => k !== null)
    if (!keys.length) continue
    const law = bags.byLaw.get(unit.law) ?? new Map<string, Set<string>>()
    const words = draftWordBag(unit.text)
    for (const key of keys) {
      const into = law.get(key) ?? new Set<string>()
      for (const w of words) into.add(w)
      law.set(key, into)
    }
    bags.byLaw.set(unit.law, law)
  }
  return bags
}

/** A law key no draft carries: `draftReference` answers it with the whole draft. */
const WHOLE_DRAFT = '\u0000whole-draft'

/** One § the Land's comparison shows, as the Bund's rule reads it: one row, the diff the page shows. */
export function guardRow(unit: LawDiffUnit): ComparisonRow | null {
  if (unit.change !== 'changed' && unit.change !== 'inserted') return null
  const para = designationOf(unit.id)
  return {
    kind: 'pair',
    law: unit.article,
    heading: null,
    gld: null,
    para,
    paraAfter: para,
    current: unit.fromText ?? '',
    proposed: unit.toText ?? '',
    change: unit.change,
    elided: false,
    segments: unit.change === 'changed' ? unit.segments : null,
    editorial: unit.editorial,
    elisionRange: false,
  }
}

export interface TguGuard {
  /** Index into the units → what the rule made of that § (only the §§ shown as changed or new). */
  checks: Map<number, RightColumnCheck>
  /** Whether the draft's text was read at all: false disarms the rule (`WordBag.read`). */
  read: boolean
  /** The §§ (indices) held against the whole draft, because their law could not be named in it (`draftLawKey`). */
  wholeDraft: Set<number>
  /** Instructions read, and how many named a § (`DraftBags`). */
  units: number
  addressed: number
}

/**
 * Hold every § a Land's comparison shows as changed or new against the
 * draft's own Gesetzestext (`blocks`, `lawBlocksFromPdfPages`); null blocks:
 * the draft could not be read, and the rule is disarmed — never a failure of
 * every §.
 */
export function guardTguUnits(units: readonly LawDiffUnit[], blocks: readonly TextBlock[] | null): TguGuard {
  const bags: DraftBags | null = blocks?.length ? landDraftBags(blocks) : null
  const checks = new Map<number, RightColumnCheck>()
  if (!bags) {
    const unread: WordBag = { has: () => false, read: false }
    units.forEach((u, i) => {
      const row = guardRow(u)
      if (row) checks.set(i, rightColumnCheck([row], { text: '', heading: '' }, unread))
    })
    return { checks, read: false, wholeDraft: new Set(), units: 0, addressed: 0 }
  }
  const keys = [...new Set([...bags.byLaw.keys(), ...bags.general.keys()])]
  const clauses = articleClauses(blocks!)
  // What the document prints a block of its own for, per law: text of a §
  // with none sits inside its neighbour's block (`draftReference`).
  const shown = new Map<string | null, Set<string>>()
  for (const u of units) {
    const into = shown.get(u.article) ?? new Set<string>()
    for (const id of [u.id, u.fromId]) {
      const key = id ? designationKey(designationOf(id)) : null
      if (key) into.add(key)
    }
    shown.set(u.article, into)
  }
  const references = new Map<string | null, (para: string) => WordBag>()
  const wholeDraft = new Set<number>()
  const unnamed = new Set<string | null>()
  const referenceOf = (law: string | null) => {
    let ref = references.get(law)
    if (!ref) {
      const key = draftLawKey(law, keys, clauses)
      if (key === undefined) unnamed.add(law)
      ref = draftReference(bags, key === undefined ? WHOLE_DRAFT : key, shown.get(law) ?? new Set())
      references.set(law, ref)
    }
    return ref
  }
  units.forEach((u, i) => {
    const row = guardRow(u)
    if (!row) return
    const ref = referenceOf(u.article)
    if (unnamed.has(u.article)) wholeDraft.add(i)
    // A renumbered §: the draft addresses it by either number (`paragraphReference`).
    const bags_ = [ref(row.para!), ...(u.fromId && u.fromId !== u.id ? [ref(designationOf(u.fromId))] : [])]
    const carried = bags_.filter((b) => b.carries !== undefined)
    const bag: WordBag = {
      has: (w) => bags_.some((b) => b.has(w)),
      read: true,
      carries: carried.length ? (t) => carried.some((b) => b.carries!(t)) : undefined,
    }
    checks.set(i, rightColumnCheck([row], { text: '', heading: u.heading ?? '' }, bag))
  })
  return { checks, read: true, wholeDraft, units: bags.units, addressed: bags.addressed }
}

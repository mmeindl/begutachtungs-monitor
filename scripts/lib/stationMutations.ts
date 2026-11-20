/**
 * Faults injected into a unit's text, to ask the § comparison whether it
 * sees them (`scripts/harness/station.ts --mutationen`,
 * `tests/diffMutations.test.ts`).
 *
 * PURE MODULE — relative imports only, so a test reaches every class.
 *
 * WHY THIS EXISTS (20.11.2026). What the comparison forgives — the unit key
 * (`compareKey`) and the badge (`isEditorialChange`) — was held to nothing
 * but the corpus as it is, and the corpus carries no labelled faults. Two
 * were found by reading instead: a minus sign the key folded away
 * („-18 °C" equal to „18 °C", 19.11.2026), and two numbers the key joined
 * („Z 1 3" equal to „Z 13") — with a changed sign („5 %" → „5 ‰") badged
 * „redaktionell" beside them. Each class below is one such change of
 * substance, made at the FIRST place of a text where it applies; the
 * comparison has to show every one as a change of substance.
 *
 * A class that does not apply to a text is no try: `mutate` answers null.
 */

export const MUTATION_KINDS = ['ziffer', 'minus', 'nicht', 'und-oder', 'oder-und', 'prozent', 'vergleich', 'zahlen-verbunden', 'bereich-verbunden'] as const
export type MutationKind = (typeof MUTATION_KINDS)[number]

/** What each class does, for the report. */
export const MUTATION_LABELS: Record<MutationKind, string> = {
  ziffer: 'eine Ziffer geändert',
  minus: 'Minus vor eine Zahl',
  nicht: '„nicht" gestrichen',
  'und-oder': '„und" → „oder"',
  'oder-und': '„oder" → „und"',
  prozent: '„%" → „‰"',
  vergleich: '„<" ↔ „>"',
  'zahlen-verbunden': 'zwei Zahlen verbunden („1 3" → „13")',
  'bereich-verbunden': 'Bereich verbunden („3-5" → „35")',
}

export interface Mutation {
  kind: MutationKind
  /** The whole text with the fault in it. */
  text: string
  /** The piece that changed, before and after — for the lines a miss prints. */
  before: string
  after: string
}

/** Neither a letter nor a digit on that side: a whole word. */
const WORD = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'u')

/**
 * A blank the draft leaves for a later stage, „xxx/2026", „20xx", „(xx)" —
 * the shape `isPlaceholder` in `server/utils/diff/wordDiff.ts` reads. A digit
 * changed inside one is a placeholder filled differently, which the
 * comparison rightly forgives, so the digit class skips it.
 */
function isPlaceholderToken(token: string): boolean {
  const t = token.replace(/^[„“"'(]+|[„“"'),;:.]+$/g, '').replace(/^(?:nr|abs|lit|art)\./i, '')
  if (!/^[xy\d]+(?:\/[xy\d]+)?$/i.test(t)) return false
  const blanks = (t.match(/[xy]/gi) ?? []).length
  return blanks >= 2 || (blanks === 1 && /\d/.test(t))
}

/** The text with the piece at `at` replaced. */
function splice(text: string, at: number, length: number, by: string): string {
  return text.slice(0, at) + by + text.slice(at + length)
}

/** Replace the first match of `re`, or null where there is none. */
function first(kind: MutationKind, text: string, re: RegExp, by: (m: RegExpExecArray) => string): Mutation | null {
  const m = re.exec(text)
  if (!m) return null
  const after = by(m)
  return { kind, text: splice(text, m.index, m[0].length, after), before: m[0], after }
}

/** The fault of one class at the first place of `text` where it applies, or null. */
export function mutate(text: string, kind: MutationKind): Mutation | null {
  switch (kind) {
    case 'ziffer': {
      for (const m of text.matchAll(/\S+/g)) {
        if (isPlaceholderToken(m[0])) continue
        const k = m[0].search(/\d/)
        if (k < 0) continue
        const digit = m[0][k]!
        const by = String((Number(digit) + 1) % 10)
        return { kind, text: splice(text, m.index + k, 1, by), before: digit, after: by }
      }
      return null
    }
    case 'minus':
      // A number that opens a token, after a space, a bracket or the start.
      return first(kind, text, /(?<=^|[\s(])\d/, (m) => `-${m[0]}`)
    case 'nicht': {
      // The word and one space beside it, so no double space is left.
      const m = /(?<![\p{L}\p{N}])nicht(?![\p{L}\p{N}]) ?/u.exec(text)
      if (!m) return null
      return { kind, text: splice(text, m.index, m[0].length, '').trim(), before: m[0], after: '' }
    }
    case 'und-oder':
      return first(kind, text, WORD('und'), () => 'oder')
    case 'oder-und':
      return first(kind, text, WORD('oder'), () => 'und')
    case 'prozent':
      return first(kind, text, /%/, () => '‰')
    case 'vergleich':
      // „<" where the text has one, else „>": the corpus holds „>" only
      // („Eiweißausscheidung > 1g/l", 60/ME).
      return first(kind, text, /[<>]/, (m) => (m[0] === '<' ? '>' : '<'))
    case 'zahlen-verbunden':
      // Two tokens of digits with one space between them, joined. Never an
      // amount and its footnote mark („35,82 1)"): the unit key reads that
      // join as the same text (`foldSpacing`), so it is no fault — the first
      // token has to open after a space or a bracket, and a fraction opens
      // after its comma.
      return first(kind, text, /(?<=^|[\s(])\d+ \d+(?=$|[\s.,;:)])/, (m) => m[0].replace(' ', ''))
    case 'bereich-verbunden':
      // A range between two digits, its hyphen and spaces taken out.
      return first(kind, text, /\d[ ]?[-–‒‑][ ]?\d/, (m) => m[0].replace(/[ \-–‒‑]/g, ''))
  }
}

/** Every class that applies to `text`, each at its first place. */
export function mutations(text: string): Mutation[] {
  return MUTATION_KINDS.map((k) => mutate(text, k)).filter((m): m is Mutation => m !== null)
}

/** The fields of a compared unit an outcome reads — `LawDiffUnit` has more. */
export interface ComparedUnit {
  change: 'unchanged' | 'changed' | 'inserted' | 'removed'
  editorial: boolean
  segments: readonly { type: 'equal' | 'removed' | 'inserted' }[] | null
}

/**
 * What the comparison made of a unit against its mutated self:
 *  - `änderung`: „geändert", not editorial, and a removed or inserted run to
 *    show — the one right answer;
 *  - `redaktionell`, `unverändert`: the fault forgiven — a miss;
 *  - `unsichtbar`: „geändert" with nothing marked, or no word diff — a miss,
 *    because the reader cannot see what changed;
 *  - `ungepaart`: the unit came out removed and inserted — shown, but not as
 *    a change of THIS unit; counted apart, not a miss.
 */
export type MutationOutcome = 'änderung' | 'redaktionell' | 'unverändert' | 'unsichtbar' | 'ungepaart'

export function mutationOutcome(units: readonly ComparedUnit[]): MutationOutcome {
  if (units.length !== 1) return 'ungepaart'
  const u = units[0]!
  if (u.change === 'unchanged') return 'unverändert'
  if (u.change !== 'changed') return 'ungepaart'
  if (u.editorial) return 'redaktionell'
  return u.segments?.some((s) => s.type !== 'equal') ? 'änderung' : 'unsichtbar'
}

/** An outcome the comparison must never give to a fault. */
export function isMiss(outcome: MutationOutcome): boolean {
  return outcome === 'redaktionell' || outcome === 'unverändert' || outcome === 'unsichtbar'
}

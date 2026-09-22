/**
 * What the search field may NOT search: the Ressort mention
 * (docs/architecture.md §12.31).
 *
 * THE DECISION: only the **Ministerklausel** — „des Bundesministers für
 * <Portfolio>" — is struck, never the portfolio on its own. Measured
 * 21.09.2026 over GP XXVIII: „klima" pulled 36 rows, and in exactly 2 of
 * them the word stood in the Kurztitel, the text the row actually shows. The
 * rest matched through two fields the reader never sees — the Ressort name
 * (BMLUK is „Bundesministerium für Land- und Forstwirtschaft, Klima- und
 * Umweltschutz, Regionen und Wasserwirtschaft") and the official Langtitel,
 * which on every Verordnung begins with „Verordnung des Bundesministers für
 * <the same portfolio>, mit der …". The whole table of measured words is in
 * §12.31; the Ressort has its own filter axis beside the field, so the free
 * text does not have to double it.
 *
 * WHY THE RULE IS THIS NARROW: „Finanzen", „Justiz", „Inneres" are ordinary
 * subject words as well, and a Verordnung ABOUT the finances of something
 * has to stay findable under „Finanzen". What is built without „für"
 * („Bundeskanzleramt") is a proper name and is struck as one. The Langtitel
 * otherwise STAYS in the haystack: on a Verordnung the subject matter stands
 * there and only there — the Kurztitel often names no more than the amended
 * Verordnung.
 *
 * PURE MODULE without Nuxt imports: both endpoints have to use the same
 * rule, or the two halves of the list drift apart, and the rule itself
 * belongs under test.
 */
import { ministryNameOf } from '../ris/ministryCodes'

/** A Ressort name without „für" is a proper name; shorter than that is no name. */
const MIN_TOKEN_LEN = 4

/**
 * The form of address before the portfolio, in the spellings that occur in
 * the titles: „des Bundesministers für", „der Bundesministerin für", „dem
 * Bundesminister für", „Bundesministerium für".
 */
const MINISTER_CLAUSE = String.raw`(?:(?:des|der|dem|den|das|vom|beim)\s+)?Bundesminister(?:iums|ium|innen|in|s|n)?\s+für\s+`

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** What may stand between two words of a portfolio: „- ", ", ", " ". */
const SEP = String.raw`[\s,-]+`

/**
 * A portfolio as a pattern that survives its own spellings.
 *
 * THE RIGID VERSION MISSED TWO REAL TITLES (measured 21.09.2026):
 *
 *  - „Land- und Forstwirtschaft, **Klima und** Umweltschutz, …" — the
 *    ministry spells itself „Klima- und Umweltschutz", the title drops the
 *    hyphen. One character of difference, and the clause stayed in.
 *  - „des Bundesministers für Land- und Forstwirtschaft, Klima- und
 *    Umweltschutz" — the same house, but only half the name.
 *
 * So the portfolio is built word by word: the separators may vary and the
 * tail may be missing (nested optionality). It stays anchored to the REAL
 * words of the Ressort — it guesses no grammar and therefore cannot take
 * away more than a Ressort name gives.
 */
function portfolioPattern(portfolio: string): string | null {
  const words = portfolio
    .split(/[\s,]+/)
    .map((w) => w.replace(/^-+|-+$/g, '').trim())
    .filter(Boolean)
    .map(escapeRegExp)
  if (!words.length) return null
  let tail = ''
  for (let i = words.length - 1; i >= 1; i--) tail = `(?:${SEP}${words[i]}${tail})?`
  return `${words[0]}${tail}`
}

/**
 * A Ressort text to be struck — and the one property that decides how far
 * the striking may go.
 */
export interface MinistryToken {
  text: string
  /**
   * `true` for a portfolio („Finanzen"): it may fall ONLY inside the
   * Ministerklausel, because on its own it is an ordinary subject word.
   * `false` for a proper name („Bundeskanzleramt"): that one falls everywhere.
   */
  clauseOnly: boolean
}

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * The Ressort name as a strike token: whatever stands behind the „für",
 * otherwise the name itself.
 *
 * Both spellings carry the same portfolio — „Bundesministerium für X" in the
 * record, „Bundesministers für X" in the title — so one token covers both.
 */
export function ministryToken(name: string): MinistryToken | null {
  // „BMLUK (Bundesministerium für …)" is the RIS record's spelling,
  // „Bundesministerium für …" the mapped row's. Both arrive here —
  // `ministryNameOf` reads the same bracket.
  const trimmed = ministryNameOf((name ?? '').trim()).trim()
  const m = /\bfür\s+(.+)$/s.exec(trimmed)
  const text = (m ? m[1]! : trimmed).trim().replace(/\s+/g, ' ')
  if (text.length < MIN_TOKEN_LEN) return null
  return { text, clauseOnly: m !== null }
}

/**
 * One Gesetzgebungsperiode's vocabulary, longest token first.
 *
 * The order is not a detail: with „Finanzen" before „Finanzen und
 * Wirtschaft", a remainder of the longer clause would stay behind, and on
 * the next pass it is no longer recognisable as a clause.
 */
export function ministryTokens(names: Iterable<string>): MinistryToken[] {
  const byText = new Map<string, MinistryToken>()
  for (const name of names) {
    const token = ministryToken(name)
    if (token && !byText.has(token.text)) byText.set(token.text, token)
  }
  return [...byText.values()].sort((a, b) => b.text.length - a.text.length)
}

/**
 * A token's finished strike pattern, built once.
 *
 * `stripMinistryMentions` runs per row of a filtered list and per block of a
 * searched document; with the period's fifteen Ressorts that was fifteen new
 * `RegExp` per call for fifteen unchanging patterns. The key is the token
 * together with its reach, and the pattern depends on nothing else — so it
 * cannot go stale, and nothing beyond the corpus's Ressort names ever gets
 * in.
 *
 * `null` for a portfolio without words: then nothing is struck.
 */
const STRIKE_PATTERNS = new Map<string, RegExp | null>()

function strikePattern(token: MinistryToken): RegExp | null {
  const key = `${token.clauseOnly ? 'klausel' : 'name'}:${token.text}`
  const known = STRIKE_PATTERNS.get(key)
  if (known !== undefined) return known
  let pattern: RegExp | null = null
  if (token.clauseOnly) {
    const portfolio = portfolioPattern(token.text)
    if (portfolio) pattern = new RegExp(`${MINISTER_CLAUSE}${portfolio}`, 'gi')
  } else {
    pattern = new RegExp(escapeRegExp(token.text), 'gi')
  }
  STRIKE_PATTERNS.set(key, pattern)
  return pattern
}

/**
 * The Ressort mentions out of a title — for the search, not for display. The
 * result need not be readable, only free of what every Verordnung of one
 * house spells the same way.
 *
 * The second house is taken along too: „im Einvernehmen mit dem
 * Bundesminister für Finanzen" stands in many Verordnungen and would
 * otherwise spring the same trap a second time.
 */
export function stripMinistryMentions(text: string, tokens: readonly MinistryToken[]): string {
  if (!text) return ''
  let out = text
  for (const token of tokens) {
    // A global pattern resets `lastIndex` on every `replace` by itself, so
    // reusing it is stateless.
    const pattern = strikePattern(token)
    if (pattern) out = out.replace(pattern, ' ')
  }
  return out
}

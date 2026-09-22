/**
 * One row per organisation, not per Stellungnahme — the grouping algorithm
 * behind the statements panel, with the calibration that keeps two bodies
 * two bodies.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */
import type { StatementMeta, StatementsSummary } from '../../../shared/types'

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/**
 * Display normalization for organisation names, whitespace/separators ONLY:
 * upstream free text carries space runs and inconsistent separator spacing
 * ("Fakultät ; Institut" vs. "Fakultät; Institut"), which renders as
 * duplicate-looking rows. Deliberately NO fuzzy matching or grouping —
 * distinct institutes of one organisation must stay distinct.
 */
export function normalizeOrgName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    // "Fakultät ; Institut" / "Arbeiter,und" → "Fakultät; Institut" /
    // "Arbeiter, und". Letter-lookahead spares decimal commas ("1,5").
    .replace(/\s*([;,])\s*(?=\p{L})/gu, '$1 ')
    .trim()
}

type OrganisationEntry = StatementsSummary['organisationList'][number]

const UMLAUT_FOLD: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' }

/**
 * Matching key for near-duplicate detection — NEVER a display name.
 * Casefolded, umlauts folded, every punctuation run reduced to one space:
 * this is what makes "Fakultät / Institut" and "Fakultät, Institut" one
 * organisation. Deliberately lossy in ways `normalizeOrgName` (which
 * produces what the page prints) must not be.
 */
function orgMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT_FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Below this, a one-character difference is a distinction, not a slip: short
 * names carry meaning in every character ("AK Wien" / "AK Tirol" is one edit
 * apart). Long ones do not.
 */
const NEAR_DUPLICATE_MIN_KEY_LENGTH = 25

/**
 * Trailing characters exempt from the one-edit rule: a single letter that
 * differs at the very end is an enumeration ("… Abteilung I" / "… Abteilung
 * II", "Marktgemeinde Aschau" / "… Aschach"), not a typo.
 */
const ENUMERATION_TAIL = 3

function isLetter(c: string | undefined): boolean {
  return c !== undefined && /\p{L}/u.test(c)
}

/**
 * One organisation, allowing for a single typed character.
 *
 * Equal keys merge unconditionally — that is punctuation and case only, no
 * judgment involved. Beyond that this accepts exactly ONE insertion,
 * deletion or substitution, under three guards, because upstream free text
 * really does carry typos (126/ME: "Rechtswissenschaftliche" and
 * "Rechtswisssenschaftliche" for the same institute, which the panel then
 * showed as two organisations):
 *
 *   1. both keys ≥ NEAR_DUPLICATE_MIN_KEY_LENGTH,
 *   2. the differing character is a LETTER on both sides — "Abteilung 1"
 *      and "Abteilung 2" are two departments, not one with a typo,
 *   3. the difference is not in the last ENUMERATION_TAIL characters,
 *      where the distinguishing suffix of a numbered unit lives.
 *
 * This trades a small risk of a wrong merge for the duplicate rows it
 * removes; the guards target the shapes Austrian authority names actually
 * take. A false merge shows two bodies as one, so widen it only against
 * measured data. `epicenter.works` vs `epicenter.works - Plattform
 * Grundrechtspolitik` — the pair this must never touch — is 30 edits apart.
 */
function isSameOrganisation(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < NEAR_DUPLICATE_MIN_KEY_LENGTH) return false
  if (b.length < NEAR_DUPLICATE_MIN_KEY_LENGTH) return false
  if (Math.abs(a.length - b.length) > 1) return false

  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const substitution = short.length === long.length
  let i = 0
  let j = 0
  let edit = -1
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++
      j++
      continue
    }
    if (edit >= 0) return false
    edit = j
    if (substitution) i++
    j++
  }
  /* No mismatch inside the loop: the shorter key is a prefix of the longer
   * one, so the extra character is the last one. */
  if (edit < 0) edit = long.length - 1

  if (edit >= long.length - ENUMERATION_TAIL) return false
  return isLetter(long[edit]) && (!substitution || isLetter(short[edit]))
}

/** Leading number of a citation ("452/SN-126/ME" → 452); 0 when absent. */
function citationNumber(citation: string): number {
  return Number.parseInt(citation, 10) || 0
}

/**
 * One entry per organisation, not per Stellungnahme. The same office files
 * twice often enough to matter (132/ME: Amt der Tiroler Landesregierung as
 * 95/SN on 26.08.2026 and 103/SN on 07.09.2026), and the panel then showed
 * the identical name in two rows — indistinguishable from a bug in our own
 * aggregation, on the page whose whole job is to be trusted.
 *
 * Grouped in two steps: exactly by display name, then across spelling
 * variants of one name (`isSameOrganisation` — punctuation, case, and at
 * most one typed character, under guards). The merged group is displayed
 * under the spelling most of its submissions used.
 *
 * Endorsements are summed: the group's own total is what the ranking
 * compares, and it is the only Zustimmungen number the panel prints for
 * that organisation. Persons never reach this function — it takes
 * organisation statements only, and `submitterName` is null for everyone
 * else by GDPR contract.
 */
export function groupOrganisationStatements(statements: StatementMeta[]): OrganisationEntry[] {
  const byName = new Map<string, OrganisationEntry>()
  for (const s of statements) {
    const name = (s.submitterName ?? '').trim()
    let entry = byName.get(name)
    if (!entry) {
      entry = { name, endorsements: 0, statements: [] }
      byName.set(name, entry)
    }
    entry.endorsements += s.endorsements
    entry.statements.push({
      citation: s.citation,
      date: s.date,
      endorsements: s.endorsements,
      parliamentUrl: s.parliamentUrl,
    })
  }

  /* Variants most-used first, name as tiebreak: the surviving display name
   * is then the majority spelling, and which one that is never depends on
   * upstream's row order. */
  const variants = [...byName.values()].sort(
    (a, b) =>
      b.statements.length - a.statements.length || a.name.localeCompare(b.name, 'de'),
  )

  /* Linear scan per variant — quadratic in DISTINCT organisations, which is
   * ~100 at the measured maximum (ORG_LIST_CAP is set above it). */
  const merged: { key: string; entry: OrganisationEntry }[] = []
  for (const variant of variants) {
    const key = orgMatchKey(variant.name)
    const target = merged.find((m) => isSameOrganisation(m.key, key))
    if (!target) {
      merged.push({ key, entry: variant })
      continue
    }
    target.entry.endorsements += variant.endorsements
    target.entry.statements.push(...variant.statements)
  }

  /* Chronological inside a group — after the merge, because merging
   * concatenates two runs: two statements from one office are a sequence
   * ("filed again later"), and undated rows sort last. Same day (the common
   * case) falls back to the citation number, which upstream assigns in
   * arrival order: a row that prints those citations side by side must not
   * print them in an order that looks accidental. */
  for (const { entry } of merged) {
    entry.statements.sort(
      (a, b) =>
        (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
        citationNumber(a.citation) - citationNumber(b.citation),
    )
  }

  /* Name as tiebreaker: two thirds of the organisations on a typical
   * Verfahren have zero endorsements, and a stable order beats upstream's
   * arbitrary one — the UI lists that block alphabetically. */
  return merged
    .map((m) => m.entry)
    .sort((a, b) => b.endorsements - a.endorsements || a.name.localeCompare(b.name, 'de'))
}

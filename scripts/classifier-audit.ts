/**
 * Review loop for the submitter classifier (docs/architecture.md §12.9).
 *
 * Fetches list 142 for one Gesetzgebungsperiode, runs `classifySubmitter`
 * over every row and prints two lists:
 *
 *  1. **Hidden institutions** — rows filed as "person" whose string does not
 *     look like a personal name (no "Lastname, Firstname" form, no academic
 *     title, or separators no person uses). These render as "Privatperson"
 *     on the site; the frequent ones are candidates for a pattern or for
 *     `ORG_ALLOWLIST`. Printed in full — they are, by hypothesis,
 *     organisations. Verify each before adding it: an entry publishes it.
 *  2. **Leak candidates** — rows filed as "organisation" whose naming segment
 *     (before the first semicolon, or the first two comma parts) is shaped
 *     like a person. These are published today. Printed with that segment
 *     masked, because if the hypothesis holds they are private persons.
 *  3. **Upstream says institution, we say person** — the disagreement with
 *     list 142's own `TYP` flag (column 19). These render as "Privatperson"
 *     today and the flag alone never changes that: publishing on an
 *     undocumented upstream column would hand it the hard invariant. The
 *     list is a review queue — verify an entry, then add it to
 *     `ORG_ALLOWLIST`, which is what actually publishes it.
 *
 * Run with `pnpm audit:classifier -- --gp XXVIII` (default), optionally
 * `--ityp I` for the Stellungnahmen on Regierungsvorlagen and `--inr 95` for
 * one item. The list-142 cap is 100,000 rows per answer; GP XXVII exceeds
 * it, so per-item runs are the way to look at that GP.
 *
 * The first run (2026-09-15, GP XXVIII) found 334+ hidden rows led by the
 * ministries' "BM f." short form and 2 leak candidates; GP XXVII had 239 of
 * the latter. Both findings became rules in `privacy.ts`. The `TYP` flag was
 * found on 2026-09-16 and closed a class neither list could see: a person
 * standing BEHIND an org-shaped naming segment, which list 2 looks straight
 * past. Nothing here writes anywhere.
 */
import { classifySubmitter, readUpstreamFlag } from '../server/utils/privacy'
import { stripHtmlToText } from '../server/utils/mappers'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

const gp = arg('gp', 'XXVIII')
const ityp = arg('ityp', 'ME')
const inr = arg('inr', '')

const body: Record<string, unknown> = { BEZUG_GP_CODE: [gp], BEZUG_ITYP: [ityp] }
if (inr) body.BEZUG_INR = [Number(inr)]

const res = await fetch('https://www.parlament.gv.at/Filter/api/filter/data/142?js=eval&showAll=true', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'begutachtungs-monitor/audit' },
  body: JSON.stringify(body),
})
if (!res.ok) throw new Error(`list 142 answered ${res.status}`)
const data = (await res.json()) as { count?: number; rows?: unknown[][] }
const rows = data.rows ?? []

/** The bracketed citation the row appends to the name: "(237/SN-126/ME)", "(277139/SN)". */
const CITATION_SUFFIX = /\s*\(\d+\/SN(?:-[^)]*)?\)\s*$/
const PLZ_SUFFIX = /\s*\(\d{4,5}\s+[^)]+\)\s*$/
const COMMA_FORM = /^\p{Lu}[\p{L}'’.-]*(?:\s+(?:\p{Lu}[\p{L}'’.-]*|van|von|der|de|den|zu|ter|le|la))?\s*,\s*\p{Lu}[\p{L}'’.-]*(?:[\s-]\p{Lu}[\p{L}'’.-]*){0,2}$/u
const TITLE = /(?:^|[\s,])(?:Univ\.-?\s?Prof\.|Dipl\.-?\s?Ing\.|MMag\.a?|Mag\.a?|DDr\.|Dr\.in|Dr\.|Ing\.|Prof\.|DI(?=[\s,]|$)|MSc|BSc|MBA|MA(?=[\s,]|$)|BA(?=[\s,]|$)|PhD|Bakk\.)/

function personShaped(segment: string): boolean {
  const core = segment.replace(TITLE, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '')
  if (COMMA_FORM.test(core)) return true
  return TITLE.test(segment) && /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2}$/u.test(core)
}

/** What a private person's row looks like — everything else filed as person is suspect. */
function looksLikePerson(s: string): boolean {
  if (personShaped(s)) return true
  const tokens = s.split(' ')
  return tokens.length <= 3 && !/[;&/]/.test(s) && s !== s.toUpperCase()
}

function namingSegment(s: string): string {
  const i = s.indexOf(';')
  if (i >= 0) return s.slice(0, i).trim()
  const parts = s.split(',')
  return parts.length >= 3 ? `${parts[0]},${parts[1]}`.trim() : ''
}

const counts: Record<string, number> = {}
const hidden = new Map<string, { rows: number; endorsements: number }>()
const leaks = new Map<string, number>()
/** Upstream calls it an institution, we render "Privatperson" — list 3. */
const flaggedInstitutions = new Map<string, { rows: number; endorsements: number }>()
/** The flag's own answer, to see at a glance whether the column still speaks. */
const flagCounts: Record<string, number> = {}

for (const row of rows) {
  const raw = stripHtmlToText(String(row[6] ?? '')).replace(CITATION_SUFFIX, '').replace(PLZ_SUFFIX, '').trim()
  const flag = readUpstreamFlag(row[19])
  flagCounts[flag ?? 'none'] = (flagCounts[flag ?? 'none'] ?? 0) + 1
  const { kind } = classifySubmitter(raw, flag)
  counts[kind] = (counts[kind] ?? 0) + 1
  if (kind === 'person' && !looksLikePerson(raw)) {
    const e = hidden.get(raw) ?? { rows: 0, endorsements: 0 }
    e.rows++
    e.endorsements += typeof row[12] === 'number' ? row[12] : 0
    hidden.set(raw, e)
  }
  if (kind === 'person' && flag === 'I') {
    const e = flaggedInstitutions.get(raw) ?? { rows: 0, endorsements: 0 }
    e.rows++
    e.endorsements += typeof row[12] === 'number' ? row[12] : 0
    flaggedInstitutions.set(raw, e)
  }
  if (kind === 'organisation') {
    const seg = namingSegment(raw)
    if (seg && personShaped(seg)) leaks.set(raw, (leaks.get(raw) ?? 0) + 1)
  }
}

const mask = (s: string) => {
  const seg = namingSegment(s)
  return seg ? seg.replace(/\p{L}/gu, '·') + s.slice(seg.length) : s
}

console.log(`list 142, GP ${gp}, BEZUG_ITYP ${ityp}${inr ? `, INR ${inr}` : ''}: ${rows.length} rows (count ${data.count ?? '?'})`)
console.log(`classified: ${JSON.stringify(counts)}`)
console.log(`upstream flag (column 19 TYP): ${JSON.stringify(flagCounts)}`)
console.log(`\n1. hidden institutions — ${[...hidden.values()].reduce((n, e) => n + e.rows, 0)} rows, ${hidden.size} distinct strings (rows× · Zustimmungen · string)`)
for (const [name, e] of [...hidden.entries()].sort((a, b) => b[1].rows - a[1].rows || b[1].endorsements - a[1].endorsements)) {
  console.log(`  ${String(e.rows).padStart(3)}× ${String(e.endorsements).padStart(4)}  ${name}`)
}
console.log(`\n2. leak candidates — ${[...leaks.values()].reduce((n, c) => n + c, 0)} rows, ${leaks.size} distinct (naming segment masked)`)
for (const [name, c] of [...leaks.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(3)}×  ${mask(name)}`)
}
console.log(
  `\n3. upstream says institution, we render "Privatperson" — ${[...flaggedInstitutions.values()].reduce((n, e) => n + e.rows, 0)} rows, ${flaggedInstitutions.size} distinct`,
)
console.log('   The flag never publishes a name by itself — verify each and add it to ORG_ALLOWLIST.')
for (const [name, e] of [...flaggedInstitutions.entries()].sort(
  (a, b) => b[1].rows - a[1].rows || b[1].endorsements - a[1].endorsements,
)) {
  console.log(`  ${String(e.rows).padStart(3)}× ${String(e.endorsements).padStart(4)}  ${name}`)
}

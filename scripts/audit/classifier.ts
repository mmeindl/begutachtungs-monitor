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
 *  2. **Leak candidates** — rows filed as "organisation" whose PRINTED name
 *     (what `mapStatementRow` hands the page, after `printedName` has cut it
 *     and `normalizeOrgName` has spaced it) carries a person: a naming
 *     segment (before the first semicolon, or the first two comma parts)
 *     shaped like one, or anywhere a first name followed by a capitalised
 *     word. The first names are read off this run's own `P` rows in the
 *     „Nachname, Vorname" form — a lexicon the classifier itself does not
 *     have, which is the point of a second opinion. Printed with the
 *     suspected part masked, because if the hypothesis holds it is a
 *     private person's name.
 *  3. **Upstream says institution, we say person** — the disagreement with
 *     list 142's own `TYP` flag (column 19). These render as "Privatperson"
 *     today and the flag alone never changes that: publishing on an
 *     undocumented upstream column would hand it the hard invariant. The
 *     list is a review queue — verify an entry, then add it to
 *     `ORG_ALLOWLIST`, which is what actually publishes it.
 *
 * Run with `pnpm audit:classifier -- --gp XXVIII` (default), optionally
 * `--ityp I` for the Stellungnahmen on Regierungsvorlagen and `--inr 95` for
 * one item. The list-142 cap is 100,000 rows per answer; GP XXVII/ME exceeds
 * it. `--typ I` reads only the rows upstream flags as an institution — all
 * 8.611 of XXVII/ME fit in one answer, and they are the rows that can be
 * published at all (a `P` row is vetoed) — plus a second, capped fetch of
 * the `P` rows for the first names list 2 needs.
 *
 * The first run (2026-09-15, GP XXVIII) found 334+ hidden rows led by the
 * ministries' "BM f." short form and 2 leak candidates; GP XXVII had 239 of
 * the latter. Both findings became rules in `privacy.ts`. The `TYP` flag was
 * found on 2026-09-16 and closed a class neither list could see: a person
 * standing BEHIND an org-shaped naming segment, which list 2 looks straight
 * past. Nothing here writes anywhere.
 *
 * Until 30.09.2026 list 2 read the RAW string and classified it after
 * stripping the „(PLZ Ort)" suffix itself — so it judged a row the page
 * never shows (two rows whose printed name was already cut stood there as
 * candidates, GP XXVI/ME) and was blind to a person in the printed part
 * that its naming-segment test does not reach. Every row now goes through
 * `mapStatementRow`, the production path, and list 2 reads its output.
 */
import { mapStatementRow } from '../../server/utils/parliament/list142'
import { readUpstreamFlag } from '../../server/utils/parliament/privacy'
import { stripHtmlToText } from '../../server/utils/parliament/htmlText'
import { argPair } from '../lib/args'
import { PARLIAMENT, getJson } from '../lib/http'

const gp = argPair('gp') ?? 'XXVIII'
const ityp = argPair('ityp') ?? 'ME'
const inr = argPair('inr') ?? ''
const typ = argPair('typ') ?? ''

const body: Record<string, unknown> = { BEZUG_GP_CODE: [gp], BEZUG_ITYP: [ityp] }
if (inr) body.BEZUG_INR = [Number(inr)]

const fetch142 = (extra: Record<string, unknown>) =>
  getJson<{ count?: number; rows?: unknown[][] }>(`${PARLIAMENT}/Filter/api/filter/data/142?js=eval&showAll=true`, {
    script: 'audit/classifier',
    method: 'POST',
    body: { ...body, ...extra },
  })

const data = await fetch142(typ ? { TYP: [typ] } : {})
const rows = data.rows ?? []
/* The filter API ignores a key it does not know and answers the whole list
 * (`statements.ts`) — then this would not be the run it says it is. */
if (typ && rows.some((row) => row[19] !== typ)) throw new Error(`TYP ${typ} did not narrow list 142`)
/** Where the first names come from: the run's own `P` rows, fetched apart when `--typ` left them out. */
const personRows = typ && typ !== 'P' ? ((await fetch142({ TYP: ['P'] })).rows ?? []) : rows

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

/**
 * Printed names list 2's shape test misreads, each READ and found to be a
 * public body (28.09.2026; the other seven 30.09.2026, when the list moved
 * from the raw string to the printed name and GP XXVI and all institution
 * rows of XXVII/ME were read for the first time). An exact list, not a looser shape:
 * loosening the „Nachname, Vorname" form to spare these stopped it
 * recognising persons written in capitals, and list 1 grew from 101 to 200
 * strings in GP XXVII/I. A string belongs here only once someone has read
 * it; a new spelling is a new entry.
 */
const REVIEWED_NOT_PERSONS = new Set([
  'Parlamentsdirektion, Rechts-, Legislativ- und Wissenschaftlicher Dienst',
  'Tierschutzombudspersonen K, NÖ, OÖ, Slzbg, Stmk, Tirol, Vlbg und Wien',
  'Universität Wien, Rechtswisssenschaftliche Fakultät; Institut für Strafrecht und Kriminologie',
  'Universität Wien, Rechtswissenschaftliche Fakultät, Institut für Strafrecht und Kriminologie',
  'BAT Austria, Imperial Brands Austria, JTI Austria, Philip Morris Austria',
  'Land Burgenland, Stabsabteilung Recht; Hauptreferat Verfassungsdienst',
  'Land Burgenland, Statsabteilung Recht; Hauptreferat Verfassungsdienst',
  'ORF, Österreichischer Rundfunk; Generaldirektion',
  'NSKS, ZSO, SKS',
])

/**
 * The first-name probe's namesakes: institutions named after a historical
 * person, and brands that read like a name — each read on 30.09.2026 over
 * GP XXVI–XXVIII. The pair, not the string, so every department of the
 * Johannes Kepler Universität is one entry.
 */
const REVIEWED_NAMESAKES = new Set([
  'Christian Doppler', 'Don Bosco', 'Edith Stein', 'Gustav Mahler', 'Johannes Kepler', 'Johannes von Gott',
  'Karl Franzens', 'Karl Landsteiner', 'Leopold-Franzens Universität', 'Ludwig Boltzmann', 'Otto Austria',
  'Philip Morris', 'Stefan Zweig', 'Viktor Frankl', 'Vinzenz Gruppe', 'Wolfgang Pauli',
])

/** „Nachname, Vorname" in a `P` row — where the probe's first names come from. */
const COMMA_FORM_FIRST_NAME = /^\p{Lu}[\p{L}'’-]+(?:\s\p{Lu}[\p{L}'’-]+)?\s*,\s*(\p{Lu}\p{Ll}+)(?:[\s-]\p{Lu}\p{Ll}+)?$/u
/** A capitalised word and the one after it (a particle may stand between) — the first is looked up. */
const NAME_PAIR = /(?<!\p{L})(\p{Lu}\p{Ll}+)(?:-\p{Lu}\p{Ll}+)?\s+(?:(?:van|von|de|der|di)\s+)?\p{Lu}\p{Ll}+/gu
/** Seen this often as a first name in the run's own `P` rows — once is noise. */
const FIRST_NAME_MIN = 2

const submitter = (row: unknown[]) => stripHtmlToText(String(row[6] ?? '')).replace(CITATION_SUFFIX, '').trim()

const firstNames = new Map<string, number>()
for (const row of personRows) {
  if (readUpstreamFlag(row[19]) !== 'P') continue
  const m = submitter(row).replace(PLZ_SUFFIX, '').match(COMMA_FORM_FIRST_NAME)
  if (m) firstNames.set(m[1]!, (firstNames.get(m[1]!) ?? 0) + 1)
}

/** The spans of the printed name that look like a person; empty when none. */
function personSpans(printed: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const seg = namingSegment(printed)
  if (seg && personShaped(seg) && !REVIEWED_NOT_PERSONS.has(printed)) spans.push([0, seg.length])
  for (const m of printed.matchAll(NAME_PAIR)) {
    if ((firstNames.get(m[1]!) ?? 0) >= FIRST_NAME_MIN && !REVIEWED_NAMESAKES.has(m[0])) {
      spans.push([m.index, m.index + m[0].length])
    }
  }
  return spans
}

const counts: Record<string, number> = {}
const hidden = new Map<string, { rows: number; endorsements: number }>()
/** Keyed by the printed name — the thing that would leak. */
const leaks = new Map<string, { rows: number; spans: Array<[number, number]> }>()
/** Upstream calls it an institution, we render "Privatperson" — list 3. */
const flaggedInstitutions = new Map<string, { rows: number; endorsements: number }>()
/** The flag's own answer, to see at a glance whether the column still speaks. */
const flagCounts: Record<string, number> = {}

for (const row of rows) {
  // Lists 1 and 3 show rows the page hides, so the raw string is all there
  // is to read; list 2 reads what the page prints.
  const raw = submitter(row).replace(PLZ_SUFFIX, '').trim()
  const flag = readUpstreamFlag(row[19])
  flagCounts[flag ?? 'none'] = (flagCounts[flag ?? 'none'] ?? 0) + 1
  const { submitterKind: kind, submitterName: printed } = mapStatementRow(row)
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
  if (kind === 'organisation' && printed) {
    const spans = personSpans(printed)
    if (spans.length) {
      const e = leaks.get(printed) ?? { rows: 0, spans }
      e.rows++
      leaks.set(printed, e)
    }
  }
}

const mask = (s: string, spans: Array<[number, number]>) =>
  s.split('').map((c, i) => (spans.some(([a, b]) => i >= a && i < b) && /\p{L}/u.test(c) ? '·' : c)).join('')

console.log(`list 142, GP ${gp}, BEZUG_ITYP ${ityp}${inr ? `, INR ${inr}` : ''}${typ ? `, TYP ${typ}` : ''}: ${rows.length} rows (count ${data.count ?? '?'})`)
console.log(`classified: ${JSON.stringify(counts)}`)
console.log(`upstream flag (column 19 TYP): ${JSON.stringify(flagCounts)}`)
console.log(`first names read off the P rows: ${[...firstNames.values()].filter((n) => n >= FIRST_NAME_MIN).length}`)
console.log(`\n1. hidden institutions — ${[...hidden.values()].reduce((n, e) => n + e.rows, 0)} rows, ${hidden.size} distinct strings (rows× · Zustimmungen · string)`)
for (const [name, e] of [...hidden.entries()].sort((a, b) => b[1].rows - a[1].rows || b[1].endorsements - a[1].endorsements)) {
  console.log(`  ${String(e.rows).padStart(3)}× ${String(e.endorsements).padStart(4)}  ${name}`)
}
console.log(
  `\n2. leak candidates in the printed name — ${[...leaks.values()].reduce((n, e) => n + e.rows, 0)} rows, ${leaks.size} distinct (suspected person masked)`,
)
for (const [name, e] of [...leaks.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
  console.log(`  ${String(e.rows).padStart(3)}×  ${mask(name, e.spans)}`)
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

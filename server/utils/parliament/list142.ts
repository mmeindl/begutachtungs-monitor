/**
 * List 142 — Stellungnahmen: the row mapper with its GDPR path, the item's
 * page URL and the document behind it — and, since 22.10.2026, the same GDPR
 * path for a row the last-good store kept (`recheckStoredStatement`).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Row indices: docs/architecture.md §5 / docs/api-exploration.md §1,
 * verified live on 2026-08-15 (list 142: 23 columns).
 */
import type { StatementDocument, StatementMeta } from '../../../shared/types'
import { parseGermanDate, parseIsoDate } from './dates'
import type { RawDocumentGroup } from './detailJson'
import { absolutizeUrl, PARLIAMENT_BASE, stripHtmlToText } from './htmlText'
import { ORG_ALLOWLIST } from './orgAllowlist'
import { normalizeOrgName } from './organisations'
import { classifySubmitter, readUpstreamFlag } from './privacy'
import { asNumber, asString } from './rowCells'

// ---------------------------------------------------------------------------
// List 142 — Stellungnahmen (23 columns, 0-based)
// 0 gp · 1 ityp of the Stellungnahme (SNME on a Ministerialentwurf, SN on a
// Regierungsvorlage) · 2 its INR · 4 date (display) · 5 dateSort (ISO) ·
// 6 submitter (HTML <a> or placeholder text) ·
// 7/8/9 BEZUG_GP_CODE / BEZUG_INR / BEZUG_ITYP — the parent's period, number
// and item type, i.e. the three keys the request filters by ·
// 12 endorsements ·
// 15 citation ("476/SN-88/ME" on an ME, "277139/SN" on an RV) ·
// 18 Bezug_Link — the same parent as one path · 19 TYP — upstream's
// organisation ('I') / person ('P') flag
// Deviation from §5 noted: [5] DATUM_SORT is ISO and preferred;
// [4] (dd.mm.yyyy) serves only as fallback.
// The positions are asserted against the header at fetch time
// (`listHeaders.ts`), so a reorder upstream fails loudly instead of turning
// every submitter into "Privatperson".
// ---------------------------------------------------------------------------

/**
 * Above this many Stellungnahmen on one item — a Ministerialentwurf or a
 * Regierungsvorlage — list 142 is not read whole. The COVID-era items carry
 * tens of thousands (164/ME of GP XXVII: 106,183; 1289 d.B.: 41,376); all
 * else stays far below. Measured over the 596 last-good records of a local
 * run on 22.10.2026 — 350 drafts of GP XXVII, 143 of GP XXVIII and a sample
 * of the older periods: nine drafts of GP XXVII lie above the cap, from
 * 5,127 to 106,183, the next one below holds 1,136, and GP XXVIII peaks at
 * 846 (126/ME).
 *
 * It is a cap on the ROWS, not on what the page may say: above it the
 * institutions are still read by name (`TYP: ['I']`, `statements.ts`
 * `fetchInstitutionStatements`) and the rest is counted, not listed.
 *
 * It was the Vorlage's alone (`RV_STATEMENTS_CAP`) until 22.10.2026, and the
 * Ministerialentwurf had none. 164/ME then read 100,000 of its 106,183 rows —
 * where `showAll` stops without a word —, parsed some 41 MB of JSON in a
 * process with a 384 MB heap, held 19 MB of rows in the 48 MB derived cache
 * and in a last-good record, sent all 100,000 to the browser, and printed
 * the breakdown of 94 % of the list as that of all of it. At the cap a list
 * is about 2 MB of JSON and 1 MB of rows.
 *
 * Pure, and in this module rather than `statements.ts`, because the
 * last-good store reads it too: a record from before the cap that holds
 * more rows than this is refused (`lastgood.ts`).
 */
export const STATEMENTS_CAP = 5_000

/** The item types a Stellungnahme comes as — also the path segment of its page. */
export type StatementItemType = 'SNME' | 'SN'

export function statementPageUrl(gp: string, ityp: StatementItemType, inr: number): string {
  return `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${inr}`
}

/** The item types list 142 can be filtered by here: a draft, or the Vorlage it became. */
export type StatementParentType = 'ME' | 'I'

/**
 * Does this row really hang off the parent it was asked for?
 *
 * The sanity check on a filtered list has to read the column that was
 * filtered, and on list 142 that is NOT column 0. Column 0 is the
 * Gesetzgebungsperiode of the STELLUNGNAHME; the filter is `BEZUG_GP_CODE`,
 * the period of the draft it belongs to. The two part at every change of
 * period: XXVII 351/ME (Frist 05.11.2024) and 352/ME (Frist 11.11.2024) took
 * 3 and 4 Stellungnahmen after GP XXVIII convened on 24.10.2024, and those
 * 7 rows carry `XXVIII` in column 0 while belonging to a draft of XXVII.
 *
 * TWO READINGS OF THE SAME FILTER, and the row has to pass both.
 *
 * Column 18 is the parent's own path, and comparing against it asserts all
 * three filter dimensions at once — period, item type and number. But the
 * response also carries the filter KEYS themselves: columns 7, 8 and 9 are
 * `BEZUG_GP_CODE`, `BEZUG_INR` and `BEZUG_ITYP`, the literal names the
 * request POSTs, and `listHeaders.ts` prefers a `feld_name` over a display
 * label wherever the API gives one — a path in a link column is the weaker
 * identity of the two. Both are populated on 100 % of the 6.828 saved rows
 * of GP XXVIII and never disagree there (read 23.09.2026).
 *
 * So both are required, and a DISAGREEMENT between them is a failed filter
 * too. That is the point of reading them twice: a response in which the link
 * says one parent and the dimensions another is not a response this code can
 * classify — and the guard above it answers 502 rather than aggregating
 * rows whose provenance two of upstream's own columns dispute.
 */
export function statementRowMatchesParent(
  row: unknown[],
  gp: string,
  ityp: StatementParentType,
  inr: number,
): boolean {
  if (!Array.isArray(row)) return false
  // Upstream writes the path without a trailing slash today; one would carry
  // no meaning, so it is tolerated rather than treated as a failed filter.
  const link = asString(row[18]).trim().replace(/\/+$/, '')
  if (link !== `/gegenstand/${gp}/${ityp}/${inr}`) return false
  // The INR arrives as a numeric string ("351", never "0351"); `asNumber`
  // takes the number form too, so a column that turns numeric upstream does
  // not read as a failed filter.
  return (
    asString(row[7]).trim() === gp &&
    asString(row[9]).trim() === ityp &&
    asNumber(row[8]) === inr
  )
}

/**
 * The Stellungnahme's own document out of its detail JSON: the first PDF
 * in `content.documents[]`, else the page (web-form submissions have no
 * file; the text is inline). Two link shapes upstream:
 * `/dokument/XXVII/SNME/81457/imfname_942193.pdf` on a Ministerialentwurf,
 * `/PtWeb/api/s3serv/file/{uuid}` on a Regierungsvorlage — no extension,
 * but `type: "PDF"`, which is what decides here.
 */
export function pickStatementDocument(
  groups: RawDocumentGroup[] | null | undefined,
  pageUrl: string,
): StatementDocument {
  for (const group of groups ?? []) {
    for (const doc of group?.documents ?? []) {
      if ((doc?.type ?? '').toUpperCase() !== 'PDF' || !doc?.link) continue
      // A link the guard refuses is no document; the page still is.
      const url = absolutizeUrl(doc.link)
      if (url) return { kind: 'pdf', url }
    }
  }
  return { kind: 'page', url: pageUrl }
}

export function mapStatementRow(row: unknown[]): StatementMeta {
  const gp = asString(row[0])
  // 'SN' is the Stellungnahme on a Regierungsvorlage; everything else is the
  // SNME the monitor started with — the header check already vouches for
  // the column, this only keeps the URL well-formed.
  const ityp: StatementItemType = asString(row[1]) === 'SN' ? 'SN' : 'SNME'
  const snInr = asNumber(row[2])
  const citation = asString(row[15])

  // "<a …>Mustermann, Maria (237/SN-126/ME)</a>" → "Mustermann, Maria";
  // on a Regierungsvorlage the bracket reads "(277139/SN)".
  const rawSubmitter = stripHtmlToText(asString(row[6])).replace(
    /\s*\(\d+\/SN(?:-[^)]*)?\)\s*$/,
    '',
  )
  // Column 19 is upstream's own organisation/person flag (`I`/`P`). It is a
  // second opinion on the GDPR question, and it can only ever suppress a
  // name, never publish one — see `classifySubmitter`.
  const { kind, name } = classifySubmitter(rawSubmitter, readUpstreamFlag(row[19]))

  return {
    citation,
    date: parseIsoDate(row[5]) ?? parseGermanDate(asString(row[4])),
    submitterKind: kind,
    submitterName: name !== null ? normalizeOrgName(name) : null,
    endorsements: asNumber(row[12]),
    parliamentUrl: `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${snInr}`,
  }
}

/** List 142's `TYP` flag as the classifier reads it — `I`, `P` or no answer. */
type SubmitterFlag = ReturnType<typeof readUpstreamFlag>

/**
 * A Stellungnahme as the last-good store keeps it: the row the API serves,
 * plus the one input of the GDPR decision the row does not carry — list
 * 142's `TYP` flag (column 19), which can veto a name (`classifySubmitter`).
 * Without it a stored name can be checked against the string rules only.
 *
 * On organisation rows only, because a name is all the flag can act on, and
 * a person's or a non-public row keeps nothing it could be checked for. The
 * raw submitter string, the other input, is never kept: it is what names
 * the private persons.
 */
export interface StoredStatement extends StatementMeta {
  upstreamFlag?: SubmitterFlag
}

/** `mapStatementRow`, with the flag beside the name it was classified with. */
export function mapStoredStatementRow(row: unknown[]): StoredStatement {
  const item = mapStatementRow(row)
  return item.submitterName !== null ? { ...item, upstreamFlag: readUpstreamFlag(row[19]) } : item
}

/** The row as the API serves it: the six fields of `StatementMeta`, nothing stored beside them. */
export function servedStatement(stored: StoredStatement): StatementMeta {
  return {
    citation: stored.citation,
    date: stored.date,
    submitterKind: stored.submitterKind,
    submitterName: stored.submitterName,
    endorsements: stored.endorsements,
    parliamentUrl: stored.parliamentUrl,
  }
}

/**
 * A stored row as it may be served TODAY: its name only where today's
 * classifier would print exactly that name, otherwise no name at all.
 *
 * WHY. The last-good store serves rows an earlier process classified, and
 * the classifier keeps tightening: 23.09., 28.09. and 30.09.2026 each
 * stopped publishing names it had published before — a person whose name
 * the form rules could not read, in front of an affiliation (23.09.); the
 * person behind an organisation's head, and the „*" separator of GP XXVI
 * (28.09.); the sole trader and the function before a name (30.09.). A
 * record keeps its names until the next successful fetch overwrites it, and
 * that fetch is exactly what does not come while list 142 has dropped a
 * draft — for days, the case the store exists for. So a record from 18.09.
 * went on serving what the 18.09. classifier let through. Measured on the
 * 596 local records of 22.10.2026: 292 stored organisation names fail
 * today's classifier, 289 of them in the 101 records of 18.09.
 *
 * HOW. The stored name goes through `classifySubmitter` again, as if it
 * were the submitter string, with the stored flag where there is one: it is
 * served if the verdict is an organisation printed exactly as stored. The
 * rules stay in `privacy.ts` — nothing here repeats one. Where the record
 * predates the flag, the string rules decide alone; that is all a record
 * written without it can be checked against.
 *
 * The one name that cannot survive this unaided is an allowlist display
 * name („Österreichische Patentanwaltskammer" for „Patentanwaltskammer,
 * Österr."): it is printed for a different string than itself, and where the
 * staff filed privately the flag vetoes it once it is read on its own — the
 * very case the allowlist outranks the flag for. So a name is also served
 * where today's classifier prints it for an allowlist entry under the same
 * flag (`allowlistOutputs`), which asks `classifySubmitter` again rather
 * than reading the allowlist's values: an entry the rules stop honouring
 * stops being served here too.
 *
 * A name that fails is not shortened to what the classifier would print
 * now: the raw string it came from is gone, and a cut of a stale name is
 * not what today's rules would make of the original. The row stays, as the
 * classifier's default — a Privatperson, unnamed — or non-public where that
 * is the verdict. An organisation shown as a person is the cosmetic error
 * `privacy.ts` accepts; the other direction is the one it exists to stop.
 */
export function recheckStoredStatement(stored: StoredStatement): StatementMeta {
  const row = { ...servedStatement(stored), submitterName: null }
  if (stored.submitterKind !== 'organisation') return row
  const name = stored.submitterName
  const flag = readUpstreamFlag(stored.upstreamFlag)
  if (typeof name !== 'string') return { ...row, submitterKind: 'person' }
  if (publishedToday(name, flag)) return { ...row, submitterName: name }
  return { ...row, submitterKind: classifySubmitter(name, flag).kind === 'nonpublic' ? 'nonpublic' : 'person' }
}

function publishedToday(name: string, flag: SubmitterFlag): boolean {
  const verdict = classifySubmitter(name, flag)
  if (verdict.kind === 'organisation' && verdict.name !== null && normalizeOrgName(verdict.name) === name) return true
  return allowlistOutputs(flag).has(name)
}

const allowlistOutputsByFlag = new Map<SubmitterFlag, Set<string>>()

/**
 * Every name today's classifier prints for an allowlist entry under this
 * flag — computed through `classifySubmitter`, once per flag and process.
 */
function allowlistOutputs(flag: SubmitterFlag): Set<string> {
  let names = allowlistOutputsByFlag.get(flag)
  if (!names) {
    names = new Set()
    for (const entry of ORG_ALLOWLIST.keys()) {
      const verdict = classifySubmitter(entry, flag)
      if (verdict.kind === 'organisation' && verdict.name !== null) names.add(normalizeOrgName(verdict.name))
    }
    allowlistOutputsByFlag.set(flag, names)
  }
  return names
}

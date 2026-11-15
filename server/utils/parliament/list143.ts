/**
 * List 143 — Parliament's list of participations: per Petition,
 * Bürgerinitiative and Volksbegehren the number of Stellungnahmen and of
 * electronic Unterstützungen, and whether the item takes them (`AKTIV`).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest can
 * execute the module directly.
 *
 * NEVER READ WITHOUT `GP_CODE` AND `ITYP`: unfiltered the list holds 655,099
 * rows and stops at 100,000 (14.11.2026). The service asks for one period and
 * one kind at a time and checks every row against both.
 *
 * `AKTIV` agreed with the items' own flags on 65 of 65 Petitionen and
 * Bürgerinitiativen of GP XXVIII (step 0, 15.11.2026). It may narrow a list;
 * the door on an item's page is opened by the item's own flag.
 *
 * The columns the mapper reads are asserted with the other lists'
 * (`listHeaders.ts`, `LIST_143_COLUMNS`); the service checks them through
 * `assertListHeader(143, …)`.
 */
import { checkListHeader } from './listHeaders'
import { asString } from './rowCells'

/**
 * Null when the header names every column the mapper reads; otherwise one
 * sentence naming the first column that does not (`checkListHeader`).
 */
export function checkList143Header(header: unknown): string | null {
  return checkListHeader(143, header)
}

/** One row of list 143, as much as the Anliegen read. */
export interface ParticipationRow {
  gp: string
  ityp: string
  /** Parliament's number; the column is zero-padded („00026"). */
  inr: number
  doktyp: string
  /** null where the cell is no count — never 0 for „not read". */
  statements: number | null
  support: number | null
  /** `AKTIV` „J". */
  active: boolean
}

function countOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null
  if (typeof v === 'string' && /^\d{1,9}$/.test(v.trim())) return Number(v.trim())
  return null
}

/** One row → the counts and the flag; call only on rows the service checked for period and kind. */
export function mapParticipationRow(row: readonly unknown[]): ParticipationRow {
  const inr = countOf(row[2])
  return {
    gp: asString(row[0]),
    ityp: asString(row[1]),
    inr: inr ?? 0,
    doktyp: asString(row[11]),
    statements: countOf(row[19]),
    support: countOf(row[20]),
    active: row[23] === 'J',
  }
}

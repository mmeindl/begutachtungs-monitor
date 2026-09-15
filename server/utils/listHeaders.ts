/**
 * The column layout the mappers rely on, made explicit.
 *
 * The filter API answers with positional rows, and the mappers read fixed
 * indices (`mappers.ts`: list 81 `[13]` is the statement count, list 142 `[6]`
 * the submitter). Nothing in a row says which column is which; the header
 * does. Until now the only check was that every row belongs to the requested
 * GP — a reorder or an inserted column upstream would have passed it and
 * degraded silently: with `[6]` pointing at a date, every submitter reads as
 * "Privatperson", because that is the GDPR-safe default the classifier falls
 * back to. Exactly the failure the predecessor project died of — an upstream
 * layout change nobody noticed until the site was wrong — only quieter.
 *
 * So the header is held against the positions we read, at fetch time, and a
 * mismatch is a 502 like a failed filter: the last-good store then serves the
 * previous aggregation with its staleness visible, and nothing pretends.
 *
 * Only the columns we read are asserted. Columns appended at the end shift
 * nothing and stay allowed; `header.length` is deliberately not compared.
 * Identity is `feld_name` where the API gives one (the filterable dimensions)
 * and the display `label` otherwise — `feldId` would be the tightest key, but
 * a relaunch renumbers ids sooner than it renames "Stellungnahmen".
 *
 * PURE MODULE — no Nuxt auto-imports, so the tests run it directly.
 */

export interface ColumnExpectation {
  /** 0-based position in the row. */
  index: number
  /** Value of `header[index].feld_name`, when the API names the field. */
  feldName?: string
  /** Value of `header[index].label` otherwise. */
  label?: string
}

/** List 81 — Ministerialentwürfe (`mapDraftRow`). Observed 2026-09-15. */
export const LIST_81_COLUMNS: ColumnExpectation[] = [
  { index: 0, feldName: 'GP_CODE' },
  { index: 2, feldName: 'INR' },
  { index: 3, label: 'Einlangen' },
  { index: 4, label: 'Betreff' },
  { index: 5, label: 'Nr.' },
  { index: 6, feldName: 'MIN' },
  { index: 7, label: 'uri' },
  { index: 10, label: 'Datesort' },
  { index: 11, feldName: 'AKTIV' },
  { index: 13, label: 'Stellungnahmen' },
  { index: 14, label: 'Fristsort' },
  { index: 16, label: 'Ministerium' },
]

/** List 142 — Stellungnahmen (`mapStatementRow`). Observed 2026-09-15. */
export const LIST_142_COLUMNS: ColumnExpectation[] = [
  { index: 0, feldName: 'GP_CODE' },
  { index: 1, feldName: 'ITYP' },
  { index: 2, feldName: 'INR' },
  { index: 4, feldName: 'DATUM' },
  { index: 5, feldName: 'DATUM_SORT' },
  { index: 6, label: 'Von' },
  { index: 12, label: 'Unterstützungen' },
  { index: 15, label: 'Nr' },
]

/**
 * List 101 — Verhandlungsgegenstände (`mapVorlageRow`). Observed 2026-09-15.
 *
 * Note the deviation from lists 81/142: at index 0 the `feld_name` is `GP`,
 * not `GP_CODE` (which is this list's *label* there). Asserting the
 * familiar spelling would fail on a healthy response.
 */
export const LIST_101_COLUMNS: ColumnExpectation[] = [
  { index: 0, feldName: 'GP' },
  { index: 2, feldName: 'INR' },
  { index: 6, label: 'Betreff' },
  { index: 7, label: 'Nummer' },
  { index: 8, feldName: 'DATUMSORT' },
  { index: 10, feldName: 'STATUS' },
  { index: 14, feldName: 'HIS_URL' },
]

const COLUMNS: Record<number, ColumnExpectation[]> = {
  81: LIST_81_COLUMNS,
  101: LIST_101_COLUMNS,
  142: LIST_142_COLUMNS,
}

interface HeaderEntry {
  feld_name?: unknown
  label?: unknown
}

/**
 * Null when the header matches every column we read; otherwise one sentence
 * naming the first column that does not — that sentence becomes the 502's
 * statusMessage, so it says what moved, not just that something did.
 */
export function checkListHeader(listId: number, header: unknown): string | null {
  const expected = COLUMNS[listId]
  if (!expected) return null
  if (!Array.isArray(header)) {
    return `Liste ${listId}: Antwort ohne Spaltenkopf`
  }
  for (const col of expected) {
    const entry = header[col.index] as HeaderEntry | undefined
    if (!entry || typeof entry !== 'object') {
      return `Liste ${listId}: Spalte ${col.index} fehlt im Spaltenkopf`
    }
    if (col.feldName !== undefined && entry.feld_name !== col.feldName) {
      return `Liste ${listId}: Spalte ${col.index} ist „${describe(entry)}“, erwartet feld_name „${col.feldName}“`
    }
    if (col.label !== undefined && entry.label !== col.label) {
      return `Liste ${listId}: Spalte ${col.index} ist „${describe(entry)}“, erwartet „${col.label}“`
    }
  }
  return null
}

function describe(entry: HeaderEntry): string {
  const name = typeof entry.feld_name === 'string' ? entry.feld_name : null
  const label = typeof entry.label === 'string' ? entry.label : null
  return name && label && name !== label ? `${label} (${name})` : (label ?? name ?? '?')
}

/**
 * List 81 — Ministerialentwürfe: the row mapper and the short title derived
 * from what it reads.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Row indices: docs/architecture.md §5 / docs/api-exploration.md §1,
 * verified live on 2026-08-15 (list 81: 18 columns).
 */
import type { DraftSummary } from '../../../shared/types'
import { parseFristsort, parseGermanDate, parseIsoDate } from './dates'
import { absolutizeUrl, stripHtmlToText } from './htmlText'
import { asNumber, asString } from './rowCells'

// ---------------------------------------------------------------------------
// List 81 — Ministerialentwürfe (18 columns, 0-based)
// 0 gp · 2 inr · 4 title · 5 citation · 6 ministry code · 7 path ·
// 8 deadline (display) · 10 arrival (ISO datesort) · 11 active 'J' ·
// 13 statement count · 14 fristsort yyyymmdd · 16 full ministry name
// ---------------------------------------------------------------------------

export function mapDraftRow(row: unknown[]): DraftSummary {
  const gp = asString(row[0])
  const inr = asNumber(row[2])
  const path = asString(row[7]) || `/gegenstand/${gp}/ME/${inr}`
  return {
    gp,
    inr,
    citation: asString(row[5]),
    title: stripHtmlToText(asString(row[4])),
    ministryCode: asString(row[6]),
    ministryName: asString(row[16]),
    arrivedAt: parseIsoDate(row[10]) ?? parseGermanDate(asString(row[3])) ?? '',
    deadline: parseFristsort(row[14] as number | string | null | undefined),
    active: row[11] === 'J',
    statementCount: asNumber(row[13]),
    parliamentUrl: absolutizeUrl(path),
  }
}

/**
 * Colloquial short name from the official title — journalists say "die
 * Novelle" or "BuStAG", never the 200-character Sammeltitel. Two defensive
 * forms: a trailing parenthetical ("… (Budgetbegleitgesetz 2026)") or a
 * trailing comma token ("…, BuStAG"). Only clearly name-like candidates;
 * anything else → null and the full title leads.
 */
export function deriveShortTitle(title: string): string | null {
  const paren = title.match(/\(([^()]{3,80})\)\s*$/)
  const comma = title.match(/,\s*([A-ZÄÖÜ][\wÄÖÜäöüß./-]{2,60}(?:\s+(?:19|20)\d{2})?)\s*$/)
  const candidate = (paren?.[1] ?? comma?.[1])?.trim()
  if (!candidate) return null
  if (/gesetz|novelle|paket|verordnung/i.test(candidate)) return candidate
  // Acronym form: BuStAG, EABG, StGB-Nov … — ends in the G of "…gesetz".
  if (/^[A-ZÄÖÜ][\wÄÖÜäöüß.-]{2,}G(?:\s+(?:19|20)\d{2})?$/.test(candidate)) return candidate
  return null
}

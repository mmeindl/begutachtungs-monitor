/**
 * List 101 — Verhandlungsgegenstände: the Vorlagen row mapper.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Row indices: docs/architecture.md §5 / docs/api-exploration.md §101.
 */
import { parseFristsort } from './dates'
import { absolutizeUrl, stripHtmlToText } from './htmlText'
import { asNumber, asString } from './rowCells'

// ---------------------------------------------------------------------------
// List 101 — Verhandlungsgegenstände (36 columns, 0-based)
// 0 gp · 2 inr · 6 title · 7 citation ("254 d.B.") · 8 dateSort yyyymmdd ·
// 10 status ('1' = Einlangen im Nationalrat, '2' = in Behandlung,
//    '3' = zurückverwiesen an den Ausschuss, '5' = erledigt; read live
//    23.09.2026 — the first and third were unknown until then) ·
// 14 path to the item's page
//
// `Status` is the cheap half of "does this Vorlage still take
// Stellungnahmen": it agreed with the detail JSON's `statementsstate` on
// 117 of 117 GP-XXVIII Vorlagen (2026-09-15, `docs/api-exploration.md` §101).
// It is used to NARROW the candidates, never to make the claim — the flag
// itself is read per item before anything is shown.
// ---------------------------------------------------------------------------

/** One row of list 101, as much of it as the second-round section needs. */
export interface VorlageRow {
  gp: string
  inr: number
  citation: string
  title: string
  /** Einlangen, ISO; '' when upstream has no sortable date. */
  date: string
  /** Upstream's `STATUS`; '1' and '2' both mean the Nationalrat still has
   *  the text (the vocabulary is above). */
  status: string
  parliamentUrl: string
}

export function mapVorlageRow(row: unknown[]): VorlageRow {
  const gp = asString(row[0])
  const inr = asNumber(row[2])
  const path = asString(row[14]) || `/gegenstand/${gp}/I/${inr}`
  return {
    gp,
    inr,
    citation: asString(row[7]),
    title: stripHtmlToText(asString(row[6])),
    // DATUMSORT is the same yyyymmdd shape as list 81's Fristsort — the
    // display column next to it is dd.mm.yyyy and stays unread (§5).
    date: parseFristsort(row[8] as number | string | null | undefined) ?? '',
    status: asString(row[10]),
    parliamentUrl: absolutizeUrl(path),
  }
}

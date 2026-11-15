/**
 * Gap sentences (15.11.2026): wherever the monitor cannot show something,
 * the sentence opens with one of four fixed lead words that say whose gap it
 * is, then one sentence or phrase on what is missing and, where it helps,
 * why. Words only — no colour, no symbol: blue means „you can do something
 * here", yellow is the highlighter, and neither means a gap
 * (docs/decisions.md, „Gap sentences").
 *
 * The four, by owner:
 * - `notPublished` — the source does not publish it, or not as a document of
 *   its own. The source's, lasting. The same word as `/datenlage`'s state.
 * - `unavailable` — the source (or our own build of a page) did not answer
 *   just now. Temporary, and no claim about fault. One verb for it: never
 *   „derzeit", „verfügbar" or „gerade nicht lesbar".
 * - `unreadable` — the document is there and reading this one failed, or a
 *   check refused it. Ours, case by case.
 * - `outOfScope` — what the monitor does not follow, read or compare, for
 *   every case of its kind. Ours, by design.
 *
 * Not a gap and so without a lead word: a state of the procedure („noch
 * keine Regierungsvorlage", „Beschlossen – nicht kundgemacht") — a fact
 * about the law, which a lead word would turn into an excuse.
 *
 * The server writes its reasons through `gapDe` too, so a reason is one
 * string on the wire and the page sets the lead word apart (`splitGap`,
 * `GapNote.vue`).
 */

export type GapKind = 'notPublished' | 'unavailable' | 'unreadable' | 'outOfScope'

export const GAP_LEAD_DE: Readonly<Record<GapKind, string>> = {
  notPublished: 'Nicht veröffentlicht',
  unavailable: 'Gerade nicht abrufbar',
  unreadable: 'Nicht lesbar',
  outOfScope: 'Nicht im Monitor',
}

/** „Nicht veröffentlicht: Einen Gesetzestext … führt das Parlament nicht." */
export function gapDe(kind: GapKind, text: string): string {
  return `${GAP_LEAD_DE[kind]}: ${text}`
}

/** The short form for a chip or a label, object first: „Kundmachung: gerade nicht abrufbar". */
export function gapLabelDe(object: string, kind: GapKind): string {
  const lead = GAP_LEAD_DE[kind]
  return `${object}: ${lead.charAt(0).toLowerCase()}${lead.slice(1)}`
}

const LEADS = Object.entries(GAP_LEAD_DE) as [GapKind, string][]

/** A gap sentence taken apart for setting, or null for any other text. */
export function splitGap(text: string | null | undefined): { kind: GapKind; lead: string; rest: string } | null {
  if (!text) return null
  for (const [kind, lead] of LEADS) {
    if (text.startsWith(`${lead}: `)) return { kind, lead, rest: text.slice(lead.length + 2) }
  }
  return null
}

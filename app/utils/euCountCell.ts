/**
 * A count in a column of its own in the EU lists of `/eu-recht` — the
 * directives' drafts and notified measures (`euUmsetzung.ts`), an act's
 * drafts (`euKarte.ts`), a Citizens' Initiative's supporters
 * (`euEciList.ts`) — where the draft list keeps its Stellungnahmen
 * (`entry-col-count`, `EuCountCell`). One shape, so the three lists read
 * alike (16.11.2026; the directives' list had it first).
 *
 * A number stands in ink and semibold; a missing or absent value is a WORD
 * in muted ink („keiner", „nicht gelesen", „nicht angegeben"), never the
 * digit 0, and the word says it too, never the tone alone. `said` carries
 * the whole observation with its qualifier for a screen reader (the column
 * header is `aria-hidden`) and for the card below `md`, which has no header.
 *
 * Pure: no Vue.
 */

/** One observation in its column. */
export interface EuCountCell {
  /** „2", or the word for none or for unknown. */
  value: string
  /** A number stands in ink; a word in muted ink. */
  counted: boolean
  /** Under a number, what it is made of: „Bund", „Länder", „Bund 1 · Länder 3". */
  detail: string | null
  /** The whole observation for a screen reader and for the card below `md`. */
  said: string
}

/** A number in its column. */
export const countCell = (n: number, said: string, detail: string | null = null): EuCountCell => ({ value: String(n), counted: true, detail, said })

/** A word where no number stands. */
export const wordCell = (value: string, said: string): EuCountCell => ({ value, counted: false, detail: null, said })

/** Whose drafts a number counts: „Bund", „Länder", „Bund 1 · Länder 3". */
export function draftsWhoseDe(bund: number, laender: number): string {
  return bund && laender ? `Bund ${bund} · Länder ${laender}` : bund ? 'Bund' : 'Länder'
}

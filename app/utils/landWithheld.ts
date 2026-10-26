/**
 * The §§ a Land's Textgegenüberstellung changes and its comparison does not
 * show (`LandLawDiffResponse.withheld`), as `LandLawDiffSection` lists them
 * under the law they belong to.
 *
 * Pure: no Vue, no Nuxt — tests/landWithheld.test.ts runs it as it is.
 */
import type { LandLawDiffResponse } from '#shared/types'

export type LandWithheld = LandLawDiffResponse['withheld'][number]

/**
 * The withheld §§ by the group they are counted in: the law the server
 * files each under. Only a § filed under NO law joins the one group the
 * comparison shows, where there is one; a § of another law is that law's,
 * in a group of its own — Kärnten 38532/2024 counted the
 * Wildschadensfondsgesetz's §§ 1, 3 and 4 under the Jagdgesetz, the only
 * group with a § shown, and named „§ 4" there twice (25.10.2026).
 */
export function withheldGroups(withheld: readonly LandWithheld[], shownLaws: readonly (string | null)[]): Map<string, LandWithheld[]> {
  const keys = new Set(shownLaws.map((l) => l ?? ''))
  const only = keys.size === 1 ? [...keys][0]! : null
  const out = new Map<string, LandWithheld[]>()
  for (const w of withheld) {
    const key = w.law ? w.law : (only ?? '')
    out.set(key, [...(out.get(key) ?? []), w])
  }
  return out
}

/** Why a § is withheld, `standing` where the server gives no reason: RIS refused its text in force. */
export type WithheldCause = NonNullable<LandWithheld['reason']> | 'standing'

/**
 * What the page says of the withheld §§ of one cause: the words before the
 * list („Nicht gezeigt: § 3 und § 7."), and the sentence after it, for one §
 * and for several. Each sentence must be true of every § it follows — until
 * 25.10.2026 one sentence, „Die Novelle ändert dort einzelne Wörter oder
 * Sätze", stood after every § the reader did not compose, whatever the
 * cause. What the monitor did not find is said as its finding, never as the
 * Land's error; where the cause may be our reading of the PDF, the sentence
 * says so.
 *
 * THE ONLY PLACE these causes are worded, as `annexNotes.ts` is for the
 * Bund's annex.
 */
const NOTES: Record<WithheldCause, { lead: string; one: string; many: string }> = {
  standing: {
    lead: 'Nicht gezeigt:',
    one: 'Seinen geltenden Text fand der Monitor im RIS nicht wortgleich',
    many: 'Ihren geltenden Text fand der Monitor im RIS nicht wortgleich',
  },
  inserted: {
    lead: 'Nicht gezeigt:',
    one: 'Die Textgegenüberstellung führt ihn als neu; dass das geltende Recht ihn noch nicht enthält, konnte der Monitor im RIS nicht bestätigen',
    many: 'Die Textgegenüberstellung führt sie als neu; dass das geltende Recht sie noch nicht enthält, konnte der Monitor im RIS nicht bestätigen',
  },
  elided: {
    lead: 'Nicht gezeigt:',
    one: 'Die Textgegenüberstellung lässt seinen geltenden Text aus, und im RIS fand der Monitor ihn unter diesem Gesetz nicht',
    many: 'Die Textgegenüberstellung lässt ihren geltenden Text aus, und im RIS fand der Monitor sie unter diesem Gesetz nicht',
  },
  deletion: {
    lead: 'Nicht gezeigt:',
    one: 'Für ihn fand der Monitor weder einen neuen Text noch im Entwurf die Anordnung, dass er entfällt – das kann daran liegen, wie der Monitor das PDF liest',
    many: 'Für sie fand der Monitor weder einen neuen Text noch im Entwurf die Anordnung, dass sie entfallen – das kann daran liegen, wie der Monitor das PDF liest',
  },
  twice: {
    lead: 'Nicht gezeigt:',
    one: 'Er steht in der Textgegenüberstellung mehrfach, und welche Stelle welche Fassung zeigt, liest der Monitor nicht sicher heraus',
    many: 'Sie stehen in der Textgegenüberstellung mehrfach, und welche Stelle welche Fassung zeigt, liest der Monitor nicht sicher heraus',
  },
  unsure: {
    lead: 'Nicht gezeigt:',
    one: 'Seinen Text oder die Änderungszeichen darin liest der Monitor aus der Textgegenüberstellung nicht sicher heraus',
    many: 'Ihren Text oder die Änderungszeichen darin liest der Monitor aus der Textgegenüberstellung nicht sicher heraus',
  },
  unchecked: {
    lead: 'Nicht gezeigt:',
    one: 'Beim Abgleich antwortete eine Quelle nicht, das RIS oder die Seite des Landes; der Monitor prüft beim nächsten Aufruf erneut',
    many: 'Beim Abgleich antwortete eine Quelle nicht, das RIS oder die Seite des Landes; der Monitor prüft beim nächsten Aufruf erneut',
  },
  wording: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Die Novelle ändert dort einzelne Wörter, Sätze oder Ziffern; den neuen Wortlaut setzt der Monitor nicht selbst zusammen',
    many: 'Die Novelle ändert dort einzelne Wörter, Sätze oder Ziffern; den neuen Wortlaut setzt der Monitor nicht selbst zusammen',
  },
  unread: {
    lead: 'Ebenfalls geändert, hier nicht gezeigt:',
    one: 'Seinen neuen Wortlaut setzt der Monitor aus den Änderungsanweisungen der Novelle nicht selbst zusammen',
    many: 'Ihren neuen Wortlaut setzt der Monitor aus den Änderungsanweisungen der Novelle nicht selbst zusammen',
  },
}

/** The order the causes stand in under a law: what RIS or the reading refused, then what the reader does not compose. */
const ORDER: WithheldCause[] = ['unchecked', 'standing', 'inserted', 'elided', 'deletion', 'twice', 'unsure', 'wording', 'unread']

/**
 * The withheld §§ of one group by cause, in `ORDER`, each with its words.
 * `alone`: no § of the comparison is shown, so nothing is „ebenfalls" changed.
 */
export function withheldNotes(items: readonly LandWithheld[], { alone = false } = {}): { cause: WithheldCause; ids: string[]; lead: string; text: string }[] {
  const byCause = new Map<WithheldCause, string[]>()
  for (const w of items) {
    const cause: WithheldCause = w.reason ?? 'standing'
    byCause.set(cause, [...(byCause.get(cause) ?? []), w.id])
  }
  return ORDER.filter((c) => byCause.has(c)).map((cause) => {
    const ids = byCause.get(cause)!
    const note = NOTES[cause] ?? NOTES.standing
    const lead = alone ? note.lead.replace(/^Ebenfalls geändert/, 'Geändert') : note.lead
    return { cause, ids, lead, text: ids.length === 1 ? note.one : note.many }
  })
}

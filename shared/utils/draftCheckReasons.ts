/**
 * Why the new text of a § was not held word for word against the draft's
 * law text — written to follow a colon, and to hold for several §§ of one
 * law at once. One wording for the Länder (`app/utils/landUnchecked.ts`) and
 * the Bund (`server/utils/annex/annexMark.ts`, 21.11.2026): the fact is the
 * same, so the sentence is. Each is true of every § it is said of, and none
 * says whose doing a difference would be: what failed is the monitor's
 * check, not the draft.
 */
import type { LandDraftUncheckedReason } from '../types'

export const DRAFT_CHECK_REASON_DE: Record<LandDraftUncheckedReason, string> = {
  unassigned: 'den neuen Text konnte der Monitor keiner Anweisung des Entwurfs sicher zuordnen',
  wording: 'eine Anweisung des Entwurfs konnte der Monitor nicht Wort für Wort lesen',
  long: 'für den wortweisen Abgleich ist der Text zu lang',
  draftUnread: 'den Gesetzestext des Entwurfs fand der Monitor nicht oder konnte ihn nicht lesen',
  // The two a Land's § alone can carry (23.11.2026): `struck` is about what the column strikes and has a lead of its own (`DRAFT_CHECK_STRUCK_DE`).
  struck: 'was hier gestrichen ist, nennt der Gesetzestext des Entwurfs nicht so, dass es sich Wort für Wort bestätigen lässt',
  noDraftCheck: 'Kärnten druckt in der rechten Spalte die Änderungsanweisungen der Novelle, und diese Spalte hält der Monitor nicht gegen den Entwurf',
}

/** The line's opening: what was not checked. */
export const DRAFT_CHECK_LEAD_DE = 'Nicht geprüft, ob der neue Text Wort für Wort im Entwurf steht'

/** The same for what a § strikes: such a § may have no new text the lead above could speak of. */
export const DRAFT_CHECK_STRUCK_DE = 'Nicht geprüft, ob der Entwurf streicht, was hier gestrichen ist'

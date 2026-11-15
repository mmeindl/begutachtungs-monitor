/**
 * Parliament's club codes (`frak_code`, `vote.result[].code`) and the names
 * the vote record itself carries for them (`vote.result[].text`), read on
 * every GP-XXVIII law of the Vorlagen' pages: this period and the one before.
 *
 * The clubs of earlier periods since 15.11.2026, each read off a vote record
 * of its time and written as Parliament writes it there: B „BZÖ" (300 d.B.
 * XXIII, 2200 d.B. XXIV), T „STRONACH" (2200 d.B. XXIV, 100 d.B. XXV), P
 * „PILZ" (100 d.B. XXVI), J „JETZT" (560 d.B. XXVI). Code „A" stands on
 * members without a club (13 presenters of Petitionen) and in no vote
 * record; it stays unknown and is left out.
 *
 * One table for every reader of a club code — an Antrag's movers
 * (`moverClubsOf`) and the members who hand in a Petition (`anliegenView`).
 * A code the table does not know is left out by its readers rather than
 * shown as a bare letter.
 *
 * Pure module: both runtimes and vitest read it.
 */
export const CLUB_NAMES: Readonly<Record<string, string>> = {
  V: 'ÖVP',
  S: 'SPÖ',
  F: 'FPÖ',
  N: 'NEOS',
  G: 'GRÜNE',
  B: 'BZÖ',
  T: 'STRONACH',
  P: 'PILZ',
  J: 'JETZT',
}

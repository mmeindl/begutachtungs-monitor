/**
 * Parliament's club codes (`frak_code`, `vote.result[].code`) and the names
 * the vote record itself carries for them (`vote.result[].text`), read on
 * every GP-XXVIII law of the Vorlagen' pages: this period and the one before.
 *
 * One table for every reader of a club code — an Antrag's movers
 * (`moverClubsOf`) and the members who hand in a Petition (`anliegenView`).
 * A code the table does not know is left out by its readers rather than
 * shown as a bare letter.
 *
 * Pure module: both runtimes and vitest read it.
 */
export const CLUB_NAMES: Readonly<Record<string, string>> = { V: 'ÖVP', S: 'SPÖ', F: 'FPÖ', N: 'NEOS', G: 'GRÜNE' }

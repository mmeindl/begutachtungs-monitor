/**
 * Colloquial names a Begutachtung is discussed under.
 *
 * "Bundestrojaner" appears in no official title — the draft is called
 * "Staatsschutz- und Nachrichtendienst-Gesetz, Sicherheitspolizeigesetz u.a.,
 * Änderung" — so the tool was unfindable under the only name most people
 * know. Reported before launch and confirmed unprompted by a user on
 * 2026-09-08 (`docs/architecture.md` §12.11).
 *
 * Hand-curated, like the base rates in `outcomes.ts`: a generated list would
 * need a press corpus and would still need review. Add an entry when a name
 * is demonstrably in public use — not a description someone could have
 * written, and never a campaign slogan.
 *
 * FRAMING RULE (CLAUDE.md): these are terms of the public debate, not the
 * tool's own naming. The UI says so ("In der öffentlichen Debatte: …"); the
 * heading stays the official title. Search matches them, so a reader who
 * only knows the debate term finds the procedure.
 */

/** Keyed `${gp}/${inr}`. */
export const CONSULTATION_ALIASES: Record<string, readonly string[]> = {
  // Verified 2026-09-08 against the project's own research notes; the term is
  // the one the 2025 debate and the submitting organisations used.
  'XXVIII/8': ['Bundestrojaner', 'Staatstrojaner'],
  // Netzsperren gegen Glücksspiel-Anbieter — the debate name for 125/ME.
  'XXVIII/125': ['Netzsperren'],
  // Zugangssperre für unter 14-Jährige auf Video-Sharing-Plattformen.
  'XXVIII/132': ['Social-Media-Verbot', 'Altersverifikation'],
}

export function aliasesFor(gp: string, inr: number): readonly string[] {
  return CONSULTATION_ALIASES[`${gp}/${inr}`] ?? []
}

/** Lowercased alias text for the server-side `q` filter; empty when there is none. */
export function aliasHaystack(gp: string, inr: number): string {
  return aliasesFor(gp, inr).join(' ').toLowerCase()
}

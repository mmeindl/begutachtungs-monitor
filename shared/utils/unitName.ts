/**
 * What a changed unit is called on screen (docs/architecture.md §12.11).
 *
 * Three sources, in this order, and all three are quoted from an official
 * text — none is generated, so none carries a machine-generated marking:
 *
 *   1. the heading the instruction itself installs („§ 5 lautet samt
 *      Überschrift: 'Landesausspielungen'") — the name the § will carry once
 *      the amendment passes,
 *   2. the heading the § carries today, looked up in RIS Bundesrecht
 *      (`/paragraphtitel`, keyed per unit),
 *   3. the heading the draft prints above the § itself.
 *
 * The third is what a **new** law brings with it. It amends nothing, so it
 * has no Promulgationsklausel, no standing law and nothing to look up — and
 * its name is standing right there in the draft. Until 26.09.2026 those §§
 * counted as unnamed, which is how „keine Klausel für den Artikel" became
 * the largest class of nameless units in the measurement (79/ME: 16 of 25)
 * although nothing was missing: 39 of 43 such units across 40 compared
 * drafts carry their own heading (measured 25.09.2026).
 *
 * **Only a § may be named that way.** In a Novelle a unit is a
 * Novellierungsanordnung, and its heading IS the instruction line, cut at
 * the colon (`novaoHeading`) — as a name it would print half the sentence
 * twice („In § 9 Abs. 5, § 10 Abs. 1, § 13 …", 121/ME Z 9).
 *
 * Lives in `shared/` rather than in the component so that the rule has tests
 * (`tests/unitName.test.ts`) and so that the audit that counts coverage
 * (`scripts/audit/paraTitle.ts`) measures the shipped rule instead of a
 * second copy of it.
 */
import type { LawDiffUnit } from '#shared/types'

/** "§5" → "§ 5", "Z3" → "Z 3" */
export function displayId(id: string): string {
  return id.replace(/^§/, '§ ').replace(/^Z(\d)/, 'Z $1')
}

/**
 * The heading, but only where it says something the block does not.
 *
 * For a § it is the § title ("Anwendungsbereich") — real information. For a
 * Novellierungsanordnung it IS the instruction line: it exists so that
 * renumbered Ziffern can pair by heading, and it was the row label back when
 * the text sat behind a click. Now that every block shows its text, printing
 * a truncated copy of the same sentence above it is noise.
 */
export function extraHeading(u: LawDiffUnit): string | null {
  if (!u.heading) return null
  const norm = (s: string) => s.replace(/\s*…\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const heading = norm(u.heading)
  const body = norm((u.change === 'removed' ? u.fromText : u.toText) ?? '')
  return heading && body.startsWith(heading) ? null : u.heading
}

/**
 * A RIS § heading without the designation it sometimes carries itself.
 *
 * Most consolidated §§ keep the „§ 37." in a marker of its own and the
 * heading beside it; some print both in the one heading element („§ 37.
 * Sonderformen der allgemeinbildenden höheren Schulen", SchOG). The card
 * puts the addressed § in front of the name, so such a heading read
 * „§ 37 § 37. Sonderformen …". Measured 01.10.2026 over 2.973 cached RIS
 * headings: 60 carry their own designation, none another one
 * (docs/architecture.md §12.11).
 *
 * Only the SAME § is removed — `para` is the one the instruction addresses
 * („§ 37"). A heading that opens with any other designation keeps it: that
 * is a different statement, and „§ 37a" is not „§ 37". A heading that is
 * nothing but the designation („§ 27.", the older „§. 87.") names nothing
 * and comes back as null.
 */
export function withoutOwnDesignation(heading: string, para: string): string | null {
  const own = /^§\s*(\d+[a-z]*)$/i.exec(para.trim())?.[1]
  const lead = /^\s*§\s*\.?\s*(\d+[a-z]*)(?:\s*\.)?(?=\s|$)/i.exec(heading)
  if (!own || !lead || lead[1]!.toLowerCase() !== own.toLowerCase()) return heading
  return heading.slice(lead[0].length).trim() || null
}

/** Whether this unit IS a paragraph rather than an instruction that amends one. */
export function isParagraphUnit(u: LawDiffUnit): boolean {
  return u.id.startsWith('§')
}

/** The name of a change, or null where none of the three sources knows one. */
export function unitName(u: LawDiffUnit, titles: Record<string, string> | null | undefined, key: string): string | null {
  return u.quotedHeading ?? titles?.[key] ?? (isParagraphUnit(u) ? extraHeading(u) : null)
}

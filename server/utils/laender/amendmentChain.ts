/**
 * Does a Kundmachung follow on from this draft? Read off the two texts'
 * promulgation clauses (22.10.2026).
 *
 * PURE MODULE — no imports, so vitest runs it directly.
 *
 * An amending draft names the law it amends and that law's last amendment:
 * „Das Salzburger Schulorganisations-Ausführungsgesetz 1995 – SchuOG 1995,
 * LGBl Nr 64, zuletzt geändert durch das Gesetz LGBl Nr 49/2022, wird
 * geändert wie folgt". Its own Kundmachung names the same last amendment.
 * One that names a LATER one is a later amendment of the same law — the
 * class the title search cannot tell apart: sbg-27156, a draft of 2022,
 * matched to LGBl. Nr. 40/2024, which reads „zuletzt geändert durch das
 * Gesetz LGBl Nr 13/2024" against the draft's 49/2022.
 *
 * Measured against an oracle that does not use the title at all — the
 * Regierungsvorlage whose text the draft is, linked to its
 * Landesgesetzblatt in RIS's own metadata (docs/architecture.md §12.47).
 */

/** Each amended law's Stammnorm number → the last amendment the text names for it. */
export function lastAmendments(text: string): Map<string, string> {
  const t = text.replace(/\s+/g, ' ').replace(/LGBl\.?\s*Nr\.?\s*/g, 'LGBl Nr ')
  const out = new Map<string, string>()
  // Salzburg names the Stammnorm without its year („LGBl Nr 64"), so the
  // number alone is the key; within one document it does not repeat.
  const re = /LGBl Nr (\d+)(?:\/\d{4})?(?:,| in der (?:geltenden )?Fassung)[^;:]{0,80}?zuletzt geändert durch(?: das| die)?(?: Gesetz| Kundmachung| Verordnung)?(?: LGBl Nr)? (\d+\/\d{4})/g
  for (const m of t.matchAll(re)) if (!out.has(m[1]!)) out.set(m[1]!, m[2]!)
  return out
}

export type ChainVerdict = 'same' | 'differ' | 'none'

/**
 * `same` where every law both texts cite has the same last amendment in
 * both, `differ` where one does not, `none` where they share no cited law —
 * a new law, or a clause in another wording.
 */
export function amendmentChain(draftText: string, kundmachungText: string): ChainVerdict {
  const draft = lastAmendments(draftText)
  const later = lastAmendments(kundmachungText)
  let same = 0
  for (const [stamm, last] of draft) {
    const other = later.get(stamm)
    if (other === undefined) continue
    if (other !== last) return 'differ'
    same++
  }
  return same ? 'same' : 'none'
}

/**
 * A Kundmachung of our own finding is compared only where the two texts
 * name the same last amendment of the law, or — where they name none to
 * compare — the search had a single candidate. Against the Regierungsvorlage
 * oracle, with the guard against comparisons in which nothing pairs: 188
 * shown, all right; all five wrong finds held back (docs/architecture.md
 * §12.47).
 */
export function followsOn(chain: ChainVerdict, unique: boolean): boolean {
  return chain === 'same' || (chain === 'none' && unique)
}

/**
 * The Land's reasoning at a § of its Textgegenüberstellung
 * (`LandLawDiffSection`): which entries of the particular part of its
 * Erläuterungen (`LandExplanationsResponse.particular`) stand at a unit,
 * and which stand at none.
 *
 * Pure: no Vue, no Nuxt — tests and the census of the Land's Begründungen
 * (`scripts/corpus/landBegruendung.ts`) run it as it is.
 */
import type { LandExplanationsResponse, LandLawDiffResponse } from '#shared/types'

export type LandReason = LandExplanationsResponse['particular'][number]

/* „Oö. Krankenanstaltengesetz 1997" and „Krankenanstaltengesetz 1997" name one law. */
const lawKey = (law: string | null) => (law ?? '').replace(/^(?:Oö\.|Salzburger|Wiener)\s+/, '').toLowerCase()

/** The laws a comparison holds: of its §§ shown, withheld or enacted — a § filed under no law is none of them. */
export function comparisonLaws(d: Pick<LandLawDiffResponse, 'units' | 'withheld' | 'enacted'>): (string | null)[] {
  return [...d.units.map((u) => u.article), ...d.withheld.map((w) => w.law), ...(d.enacted ?? [])]
}

/** More than one law: a passage must name its own to stand at a §. */
const isPackage = (laws: readonly (string | null)[]) => new Set(laws.filter(Boolean)).size > 1

/**
 * The entries at a unit: those naming its § and its law. A renamed law's
 * group carries RIS's name, its passages the name the draft prints
 * (`printedAs`): either name finds them.
 *
 * Where the comparison holds several laws (`laws`, `comparisonLaws`), only
 * where the law key is certain (20.11.2026): an entry the reader filed under
 * no law, or a § filed under none, stood at the § of that number in every
 * law of the package — law A's passage at law B's § 3, worse than none, and
 * what the Bund never shows (`explanationsJoin.ts`). Such an entry stands at
 * the end of the list instead (`unplacedLandReasons`).
 */
export function landReasonsAt(particular: readonly LandReason[], unit: { id: string; article: string | null }, printedAs: ReadonlyMap<string, string>, laws: readonly (string | null)[]): LandReason[] {
  const n = /^§(\S+)$/.exec(unit.id)?.[1]
  if (!n) return []
  const article = unit.article
  const same = (law: string) => article !== null && (lawKey(law) === lawKey(article) || lawKey(law) === lawKey(printedAs.get(article) ?? null))
  const certain = isPackage(laws)
  return particular.filter((e) => e.paras.includes(n) && (e.law ? (certain ? same(e.law) : !article || same(e.law)) : !certain))
}

/**
 * The entries of a package the reader filed under no law, that name a §:
 * at none of its §§ (`landReasonsAt`), and not lost either — shown at the
 * end of the list under the §§ they name, as the Bund's annex shows a
 * passage it could not set at a § at its law's end (`AnnexLawEnd`).
 */
export function unplacedLandReasons(particular: readonly LandReason[], laws: readonly (string | null)[]): LandReason[] {
  return isPackage(laws) ? particular.filter((e) => !e.law && e.paras.length > 0) : []
}

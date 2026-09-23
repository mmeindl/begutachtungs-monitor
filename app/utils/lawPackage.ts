/**
 * The two sentences above the § comparison that name laws only one of the
 * two documents carries (docs/ris-join.md §6d).
 *
 * Here rather than in the component so the number agreement is testable: a
 * Regierungsvorlage that merges several drafts carries over a hundred of
 * them, and "die … nicht vorkommt" is wrong German for all but one of them.
 *
 * Framing rule (docs/architecture.md §4): both sentences state what the two texts contain,
 * never a verdict. A law missing from this Regierungsvorlage is not a law
 * that was dropped — a draft can end up in more than one (architecture.md
 * §13.4), and the sentence says so.
 *
 * Both take the compared pair, because the comparison is no longer fixed to
 * Ministerialentwurf → Regierungsvorlage (docs/architecture.md §12.18) and
 * these sentences name the two sides out loud.
 */
import type { LawPackageEntry, LawStationId } from '../../shared/types'
import { LAW_STATION_LABEL } from '../../shared/utils/lawStations'

/** How many law names a sentence lists before it counts the rest. */
const MAX_NAMES = 3

// --- Measured surface: exported for tests and harness scripts, not for the app. ---
/** "A", "A und B", "A, B, C und ein weiteres", "A, B, C und 132 weitere" */
export function formatLawList(entries: readonly LawPackageEntry[]): string {
  const names = entries.map((e) => e.article)
  if (names.length > MAX_NAMES) {
    const rest = names.length - MAX_NAMES
    return `${names.slice(0, MAX_NAMES).join(', ')} und ${rest === 1 ? 'ein weiteres' : `${rest} weitere`}`
  }
  if (names.length > 1) return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
  return names[0] ?? ''
}

/**
 * How to name a station inside the sentence.
 *
 * The draft is "dieser Entwurf" rather than "der Ministerialentwurf": the
 * sentence stands on the draft's own page, where saying its type back to the
 * reader is noise. The three later stations are all feminine, so they take
 * "die"/"dieser" without a special case.
 */
const subject = (id: LawStationId) => (id === 'me' ? 'Der Entwurf' : `Die ${LAW_STATION_LABEL[id]}`)
const inThis = (id: LawStationId) => (id === 'me' ? 'in diesem Entwurf' : `in dieser ${LAW_STATION_LABEL[id]}`)

/** Laws the later text carries and the earlier one never had. */
export function mergedLawsNote(
  laws: readonly LawPackageEntry[],
  from: LawStationId,
  to: LawStationId,
): string | null {
  if (!laws.length) return null
  const clause =
    laws.length === 1
      ? `ein weiteres Gesetz, das ${inThis(from)} nicht vorkommt`
      : `${laws.length} weitere Gesetze, die ${inThis(from)} nicht vorkommen`
  // The second sentence explains the mechanism, and the mechanism differs by
  // pair: a Regierungsvorlage bundles several Ministerialentwürfe, while a
  // committee merges and splits Vorlagen already before parliament. Only the
  // part that is true of the pair at hand is said.
  const why =
    from === 'me' && to === 'rv'
      ? 'Eine Regierungsvorlage fasst häufig mehrere Ministerialentwürfe zusammen; verglichen wird deshalb, was in beiden Texten steht.'
      : 'Im Parlament werden Vorlagen zusammengefasst und geteilt; verglichen wird deshalb, was in beiden Texten steht.'
  return `${subject(to)} ändert ${clause}: ${formatLawList(laws)}. ${why}`
}

/** Laws the earlier text carried and the later one does not. */
export function droppedLawsNote(
  laws: readonly LawPackageEntry[],
  from: LawStationId,
  to: LawStationId,
): string | null {
  if (!laws.length) return null
  const one = laws.length === 1
  const clause = one
    ? `ein Gesetz, das ${inThis(to)} nicht vorkommt`
    : `${laws.length} Gesetze, die ${inThis(to)} nicht vorkommen`
  const why =
    from === 'me'
      ? `Ein Entwurf kann in mehrere Regierungsvorlagen münden — möglicherweise ${one ? 'steht es' : 'stehen sie'} in einer anderen.`
      : `Der Text kann im Parlament geteilt worden sein — möglicherweise ${one ? 'steht es' : 'stehen sie'} in einer anderen Vorlage.`
  return `${subject(from)} ändert ${clause}: ${formatLawList(laws)}. ${why}`
}

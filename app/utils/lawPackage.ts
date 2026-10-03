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
import type { LawDiffResponse, LawPackageEntry, LawStationId } from '#shared/types'
import { LAW_STATION_LABEL } from '#shared/utils/lawStations'

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

type LargerAct = LawDiffResponse['largerAct']

/**
 * „als Teil eines größeren Gesetzes kundgemacht: Informationsfreiheits-
 * Anpassungsgesetz, BGBl. I Nr. 50/2025" — the act after a colon, never in
 * the genitive. A Kurztitel is any noun phrase („Budgetbegleitgesetz 2025",
 * „Resilienz kritischer Einrichtungen-Gesetz sowie Änderung des …"), and
 * declining it is exactly the mistake the station's own label made once
 * (docs/architecture.md §12.33).
 */
const actPhrase = (act: NonNullable<LargerAct>) =>
  `als Teil eines größeren Gesetzes kundgemacht: ${act.title ? `${act.title}, ` : ''}${act.citation}`

type DraftRef = { gp: string; inr: number }

/** „45/ME", „6/ME (XXVII. GP)" where the draft is of another period. */
const draftCitation = (d: DraftRef, gp: string) => (d.gp === gp ? `${d.inr}/ME` : `${d.inr}/ME (${d.gp}. GP)`)

/**
 * „mit dem Ministerialentwurf 45/ME" — „mit 11 anderen Ministerialentwürfen
 * (17/ME, 18/ME, 20/ME und 8 weiteren)": the drafts Parliament's record says
 * the Vorlage absorbed, in the dative the sentence needs.
 */
function bundledWith(others: readonly DraftRef[], gp: string): string {
  const names = others.map((d) => draftCitation(d, gp))
  if (names.length === 1) return `mit dem Ministerialentwurf ${names[0]}`
  const listed =
    names.length > MAX_NAMES
      ? `${names.slice(0, MAX_NAMES).join(', ')} und ${names.length - MAX_NAMES} weiteren`
      : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
  return `mit ${names.length} anderen Ministerialentwürfen (${listed})`
}

/**
 * Laws the later text carries and the earlier one never had.
 *
 * `bundled` is the record behind it: the other drafts the Regierungsvorlage
 * absorbed, and this draft's period to cite them against. Where the
 * Vorlage was built from this draft alone, the server keeps those laws in
 * the comparison (`addedLaws`) and this sentence is not asked for.
 */
export function mergedLawsNote(
  laws: readonly LawPackageEntry[],
  from: LawStationId,
  to: LawStationId,
  act: LargerAct = null,
  bundled: { others: readonly DraftRef[]; gp: string } | null = null,
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
  //
  // And where the act is known to bundle this draft with others, the
  // mechanism is not a guess: the sentence names the act — or, short of the
  // Kundmachung, the drafts the Vorlage absorbed.
  const why = act
    ? `Der Entwurf wurde ${actPhrase(act)}; verglichen wird deshalb, was in beiden Texten steht.`
    : from === 'me' && bundled?.others.length
      ? `Die Regierungsvorlage fasst diesen Entwurf ${bundledWith(bundled.others, bundled.gp)} zusammen; verglichen wird deshalb, was in beiden Texten steht.`
      : from === 'me' && to === 'rv'
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

/**
 * Laws BOTH compared texts carry and the draft does not — cut from a pair of
 * two later stations, because the Regierungsvorlage bundles this draft with
 * other Ministerialentwürfe (`scopeToDraft`, docs/architecture.md §12.33).
 *
 * The one sentence that must stand wherever a later pair runs over such a
 * Vorlage, because it says whose counts the reader sees: without it, „3
 * geändert" under „Was das Parlament an der Regierungsvorlage geändert hat"
 * reads as the whole Vorlage — or, where nothing could be cut, as the
 * draft's. Where the pair ends at the Bundesgesetzblatt it names the act.
 *
 * Framing rule (docs/architecture.md §4): what the texts contain, never a
 * verdict on a draft that went into a larger act.
 */
export function outsideDraftNote(laws: readonly LawPackageEntry[], act: LargerAct): string {
  const kundgemacht = act ? `, und er wurde ${actPhrase(act)}` : ''
  const lead = `Die Regierungsvorlage fasst diesen Entwurf mit anderen Ministerialentwürfen zusammen${kundgemacht}.`
  // Nothing cut: the draft's text unreadable, or its laws the whole text
  // (two drafts amending one law). Then the counts are the text's, and the
  // sentence has to say so rather than let them pass for the draft's.
  if (!laws.length) return `${lead} Welche Änderungen aus diesem Entwurf stammen, lässt sich im Text nicht trennen; verglichen wird der ganze Text.`
  const rest =
    laws.length === 1
      ? `nicht verglichen ist ein weiteres Gesetz: ${formatLawList(laws)}`
      : `nicht verglichen sind ${laws.length} weitere Gesetze: ${formatLawList(laws)}`
  return `${lead} Verglichen und gezählt wird nur, was zu diesem Entwurf gehört; ${rest}.`
}

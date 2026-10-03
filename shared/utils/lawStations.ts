/**
 * The stations a law text passes through, as the § comparison can select
 * them (docs/architecture.md §12.18).
 *
 * More than the one shipped pair, because a Begutachtungsergebnis disappears
 * exactly where nobody compares any more: in committee or in the plenary.
 * Measured before the build over GP XXVI–XXVIII (651 Ministerialentwürfe,
 * `pnpm corpus:stationen`, 17.09.2026): not one of the 154 Ausschuss- and 122
 * Plenarfassungen is PDF-only — the missing HTML is the draft's own text in
 * the older periods, the other side entirely.
 *
 * Pure module: no Nuxt auto-imports, so both the server resolver and the
 * component read one vocabulary.
 */
import type { LawStationId } from '../types'

/**
 * Procedural order. A comparison always runs from an earlier station to a
 * later one — `von` before `bis`, never the reverse, because the word diff
 * calls one side removed and the other inserted and a flipped pair would
 * report every amendment backwards.
 */
export const LAW_STATION_ORDER: readonly LawStationId[] = ['me', 'rv', 'ausschuss', 'plenum', 'bgbl']

/**
 * The label names the VERSION, not the event: "Ausschussfassung", not
 * "Geändert im Ausschuss" (upstream's wording). Since 01.10.2026 the document
 * list under „Im Parlament" uses these names too: it is folded under the
 * comparison that names the same texts so.
 * In a selector the options are two texts being picked, so they have to read
 * as things rather than as happenings.
 */
export const LAW_STATION_LABEL: Record<LawStationId, string> = {
  me: 'Ministerialentwurf',
  rv: 'Regierungsvorlage',
  ausschuss: 'Ausschussfassung',
  plenum: 'Plenarfassung',
  // The version, not the event — the rule above: „Kundmachung" would be the
  // act, „Bundesgesetzblatt" the gazette; what is compared is the text.
  //
  // AND IT HAS TO DECLINE. The page's sentences put the label in the genitive
  // („der Gesetzestext der …", „wird mit dem der … verglichen"). The four
  // older names are feminine in -ung and do not change there; „Kundgemachte
  // Fassung" did, and stood on the page as „mit dem der Kundgemachte
  // Fassung". That the Ministerialentwurf already needs an exception in the
  // same sentence was the warning.
  bgbl: 'Fassung im Bundesgesetzblatt',
}

/**
 * Upstream's free-text group titles → station.
 *
 * A whitelist, and exact: the titles are typed by hand per Gegenstand, and
 * the station list carries documents that are not versions of the law text
 * at all — "Verhältnismäßigkeitsprüfung" (the EU assessment for regulated
 * professions, 3 drafts) and "Vertragstext" (a Staatsvertrag, 2 drafts).
 * Matching by keyword would offer those as a text to compare, and the §
 * parser would dutifully produce paragraphs out of an annex. Same reasoning
 * as for the shortinfo headings in `server/utils/parliament/detailJson.ts`:
 * read the tag, never the wording.
 */
export const UPSTREAM_AUSSCHUSS_TITLE = 'Geändert im Ausschuss'
export const UPSTREAM_PLENUM_TITLE = 'Geändert im Plenum'

/**
 * What the „redaktionell" badge claims — and it claims the same thing in both
 * comparisons.
 *
 * It stood in three wordings in three places, two of them two screens apart
 * on the same draft page. This is the definition of a label we award
 * ourselves; it has to be identical everywhere or it is not a definition.
 *
 * Since 18.09.2026 the sentence stands in ONE place, /so-funktionierts, and
 * both comparisons link there: a legend repeated on each of roughly a
 * thousand pages, for a word that says in German about what it means here,
 * is not worth the page it costs.
 *
 * **The condition on the Verweise is new on 23.09.2026, and the sentence
 * gained it because the badge could not keep the promise.** „Nur Verweise"
 * covered any changed cross-reference, and over the 88 ME→RV pairs of GP
 * XXVIII that hid four changes of the norm under „kein einziges Wort
 * geändert" (`isEditorialChange`). A reference now counts as editorial only
 * where the comparison itself renumbered the paragraph it points at — and
 * because the Textgegenüberstellung aligns two columns of ONE paragraph, it
 * establishes no renumbering at all, so there the condition is never met.
 * The sentence holds for both comparisons, which is what it is for.
 */
export const EDITORIAL_BADGE_SENTENCE =
  '„Redaktionell“ heißt: Es haben sich nur Zahlen, Daten oder Satzzeichen geändert, kein einziges Wort – und Verweise nur dort, wo sie einer Umnummerierung in diesem Vergleich folgen.'

const UPSTREAM_STATION_TITLES: Readonly<Record<string, LawStationId>> = {
  // `mapTextEvolution` renames upstream's "Gesetzestext" to the station
  // before this lookup sees it.
  Regierungsvorlage: 'rv',
  [UPSTREAM_AUSSCHUSS_TITLE]: 'ausschuss',
  [UPSTREAM_PLENUM_TITLE]: 'plenum',
}

/**
 * The draft's own Gesetzestext, by the exact titles the Ressorts use for it.
 *
 * Ordered: the first one present wins. The list is short because it is
 * measured, and it is exact for a reason that cost a measurement to see —
 * three GP-XXVI drafts publish "Gesetzestext, Vorblatt und Erläuterungen"
 * as ONE document. A prefix match would hand that file to `parseLawUnits`,
 * which would parse the Vorblatt and the Erläuterungen into §§ and compare
 * explanatory prose against law text. Those drafts have no isolated
 * Gesetzestext, and the honest answer is that there is nothing to compare.
 *
 * "(korrigierte Version)" beats "(ursprüngliche Version)": when a Ressort
 * corrects a draft mid-Begutachtung, the corrected text is the draft as it
 * stood at the end of the Frist (XXVII, 315/ME — the only case in three
 * periods, and it carries both).
 */
const ME_TEXT_TITLES: readonly string[] = [
  'Gesetzestext',
  'Gesetzestext (korrigierte Version)',
  'Gesetzestext (ursprüngliche Version)',
]

export function lawStationOf(upstreamTitle: string): LawStationId | null {
  return UPSTREAM_STATION_TITLES[upstreamTitle.trim()] ?? null
}

/** Rank of the draft's own text among the accepted titles; -1 when unusable. */
export function meTextTitleRank(title: string): number {
  return ME_TEXT_TITLES.indexOf(title.trim())
}

export function isLawStationId(value: unknown): value is LawStationId {
  return typeof value === 'string' && (LAW_STATION_ORDER as readonly string[]).includes(value)
}

/** Position in the procedure, for ordering and for rejecting a flipped pair. */
function lawStationIndex(id: LawStationId): number {
  return LAW_STATION_ORDER.indexOf(id)
}

/**
 * Is this pair a question somebody answered?
 *
 * `plenum→bgbl` is the one exception to the order rule: between the Beschluss
 * and the Kundmachung NO actor negotiates, so the pair is systematically
 * empty — measured (`pnpm corpus:bgbl-station`) exactly zero substantive
 * changes for ten of fourteen drafts, once the inserted Fundstelle is
 * discounted. A pair that promises an answer it cannot give teaches nothing
 * about the procedure; `rv→bgbl` carries the same statement without costing
 * a menu entry (docs/architecture.md §12.33).
 */
export function isLawStationPair(from: LawStationId, to: LawStationId): boolean {
  if (from === 'plenum' && to === 'bgbl') return false
  return lawStationIndex(from) < lawStationIndex(to)
}

/**
 * The left side to use when only the right one was named — decided
 * 17.09.2026, on a watcher's practice and for a reason that outlives it.
 *
 * Adjacent stations attribute each change to whoever made it: ME→RV is the
 * ministry after the Begutachtung, RV→Ausschuss the committee, RV→Plenum
 * the Nationalrat. A fixed left side of ME would mix ministry and
 * parliament into one column of differences and answer neither question.
 * ME→Plenarfassung stays available as an explicit choice, because "did the
 * Begutachtungsergebnis survive to the end" is a real question — it is just
 * not the same one.
 *
 * Null for `me`, which has no station before it.
 */
export function defaultFromFor(to: LawStationId): LawStationId | null {
  if (to === 'me') return null
  return to === 'rv' ? 'me' : 'rv'
}

/** The default pair of the page: the comparison this product is about. */
export const DEFAULT_LAW_STATION_PAIR: { from: LawStationId; to: LawStationId } = { from: 'me', to: 'rv' }

/**
 * Which section of the draft page a comparison stands in, and which
 * comparisons there are — decided 01.10.2026: every section shows the step
 * that LED INTO its station, and only that step, so each comparison has one
 * actor behind it (the rule `defaultFromFor` states for the defaults).
 *
 *   Die Regierungsvorlage   Ministerialentwurf → Regierungsvorlage (the ministry)
 *   Im Parlament            Regierungsvorlage → Ausschussfassung (the committee)
 *                           Ausschussfassung → Plenarfassung (the plenary)
 *   Im Bundesgesetzblatt    Ministerialentwurf → Fassung im Bundesgesetzblatt
 *
 * Until then every pair stood in „Die Regierungsvorlage" behind one select of
 * up to nine, and „Im Parlament" compared nothing — in the majority case, as
 * 52 of 91 GP-XXVIII Vorlagen were changed again. Most of those pairs mixed
 * two actors; they went with the select.
 *
 * The plenary's step stays with parliament, not with the Bundesgesetzblatt:
 * the Plenarfassung is the Nationalrat's text, and between Beschluss and
 * Kundmachung nobody changes it (`isLawStationPair`). The Bundesgesetzblatt
 * carries the one comparison that is not a step, the whole way from the
 * draft: the station where „what became of it" can first be answered in
 * full. Where parliament published only one text, its step starts at the
 * Vorlage (RV → Plenarfassung where the plenary changed it directly).
 */
export type LawDiffScope = 'rv' | 'parlament' | 'bgbl'

export function lawDiffScopeOf(to: LawStationId): LawDiffScope | null {
  if (to === 'me') return null
  if (to === 'rv') return 'rv'
  return to === 'bgbl' ? 'bgbl' : 'parlament'
}

export interface LawStationPair { from: LawStationId; to: LawStationId }

/** The comparisons of one section, in procedural order; the first is its
 *  default. `parliamentTexts` are the parliamentary versions the draft has. */
export function lawDiffSteps(scope: LawDiffScope, parliamentTexts: readonly LawStationId[]): LawStationPair[] {
  if (scope === 'rv') return [{ from: 'me', to: 'rv' }]
  if (scope === 'bgbl') return [{ from: 'me', to: 'bgbl' }]
  const ausschuss = parliamentTexts.includes('ausschuss')
  const plenum = parliamentTexts.includes('plenum')
  if (ausschuss && plenum) return [{ from: 'rv', to: 'ausschuss' }, { from: 'ausschuss', to: 'plenum' }]
  if (ausschuss) return [{ from: 'rv', to: 'ausschuss' }]
  if (plenum) return [{ from: 'rv', to: 'plenum' }]
  return []
}

/** The fetch key of one comparison, shared by every component that reads it. */
export function lawDiffKey(gp: string, inr: number, from: LawStationId, to: LawStationId): string {
  return `law-diff:${gp}:${inr}:${from}>${to}`
}

/** The same for the reasoning comparison (`/begruendung`): the Vorlage's
 *  station frame and the comparison below it read one request (02.10.2026). */
export function lawReasoningKey(gp: string, inr: number, from: LawStationId, to: LawStationId): string {
  return `law-reasoning:${gp}:${inr}:${from}>${to}`
}

/** A parliamentary step by the body that took it — the toggle's word. */
export const LAW_STEP_LABEL: Partial<Record<LawStationId, string>> = {
  ausschuss: 'Im Ausschuss',
  plenum: 'Im Plenum',
}

/** The heading of the comparison under „Im Parlament", and the bar's question
 *  that links to it — one string, so the two cannot drift apart. */
export const PARLIAMENT_COMPARISON_QUESTION = 'Was das Parlament am Text geändert hat'

/**
 * The heading over the comparison, phrased as the question the pair answers
 * rather than as the name of a procedure — the wording rule the station bar
 * already follows (`app/utils/spine.ts`).
 *
 * Temporal, never causal (framing rule, docs/architecture.md §4): a text changed after the
 * Begutachtung is not a text changed BY it, and the comparison cannot know
 * which it was. The ME→RV wording is unchanged because the outcome card
 * links to it by that name. The `bgbl` pairs follow the same rule: „Was vom
 * Entwurf im Gesetz steht" would already be a verdict, „was sich bis zum
 * Gesetz geändert hat" is the observation.
 */
const PAIR_QUESTIONS: Readonly<Record<string, string>> = {
  'me>rv': 'Was sich nach der Begutachtung geändert hat',
  'me>ausschuss': 'Was sich vom Entwurf bis zum Ausschuss geändert hat',
  'me>plenum': 'Was sich vom Entwurf bis zur Plenarfassung geändert hat',
  'rv>ausschuss': 'Was der Ausschuss an der Regierungsvorlage geändert hat',
  'rv>plenum': 'Was das Parlament an der Regierungsvorlage geändert hat',
  'ausschuss>plenum': 'Was im Plenum noch geändert wurde',
  'me>bgbl': 'Was sich vom Entwurf bis zum kundgemachten Gesetz geändert hat',
  'rv>bgbl': 'Was sich von der Regierungsvorlage bis zum Gesetz geändert hat',
  'ausschuss>bgbl': 'Was sich nach dem Ausschuss bis zum Gesetz geändert hat',
}

export function lawStationPairQuestion(from: LawStationId, to: LawStationId): string {
  return (
    PAIR_QUESTIONS[`${from}>${to}`] ??
    `Was sich zwischen ${LAW_STATION_LABEL[from]} und ${LAW_STATION_LABEL[to]} geändert hat`
  )
}

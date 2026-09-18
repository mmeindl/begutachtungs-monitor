/**
 * The stations a law text passes through, as the § comparison can select
 * them (docs/architecture.md §12.18).
 *
 * The comparison shipped wired to one pair, Ministerialentwurf against
 * Regierungsvorlage. The later texts were on the page as documents the whole
 * time and never compared — and that is where a Begutachtungsergebnis
 * quietly disappears: the amendment moved in committee or in the plenary,
 * after everyone stopped reading.
 *
 * Measured over GP XXVI–XXVIII (651 Ministerialentwürfe, scripts/
 * stations-corpus.ts, 17.09.2026): three stations follow the draft, their
 * upstream wording is stable across all three periods, and every one of
 * them is published as HTML — 154 Ausschussfassungen and 122
 * Plenarfassungen, without a single PDF-only case. The availability worry
 * this feature was noted with turned out to sit on the OTHER side: the
 * draft's own text is what is missing as HTML in the older periods.
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
export const LAW_STATION_ORDER: readonly LawStationId[] = ['me', 'rv', 'ausschuss', 'plenum']

/**
 * The label names the VERSION, not the event: "Ausschussfassung", not
 * "Geändert im Ausschuss" (upstream's wording, kept for the document list).
 * In a selector the options are two texts being picked, so they have to read
 * as things rather than as happenings.
 */
export const LAW_STATION_LABEL: Record<LawStationId, string> = {
  me: 'Ministerialentwurf',
  rv: 'Regierungsvorlage',
  ausschuss: 'Ausschussfassung',
  plenum: 'Plenarfassung',
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
 * as for the shortinfo headings in `server/utils/mappers.ts`: read the tag,
 * never the wording.
 */
export const UPSTREAM_AUSSCHUSS_TITLE = 'Geändert im Ausschuss'
export const UPSTREAM_PLENUM_TITLE = 'Geändert im Plenum'

/**
 * Was das Abzeichen „redaktionell" behauptet — und es behauptet in beiden
 * Vergleichen dasselbe.
 *
 * Es stand in drei Fassungen an drei Stellen, zwei davon auf derselben
 * Entwurfsseite, zwei Bildschirme auseinander: „nur Verweise, Zahlen, Daten
 * oder Satzzeichen", „Es haben sich nur Verweise, Zahlen, Daten oder
 * Satzzeichen geändert, kein einziges Wort", „dass sich nur Verweise,
 * Zahlen, Daten oder Satzzeichen geändert haben". Das ist die Definition
 * eines Etiketts, das wir selbst vergeben; sie muss überall dieselbe sein,
 * sonst ist sie keine Definition.
 */
export const EDITORIAL_BADGE_GLOSS =
  '„Redaktionell“ heißt: Es haben sich nur Verweise, Zahlen, Daten oder Satzzeichen geändert, kein einziges Wort.'

const UPSTREAM_STATION_TITLES: Readonly<Record<string, LawStationId>> = {
  // `mapTextEvolution` renames upstream's "Gesetzestext" to the station
  // before this lookup sees it.
  Regierungsvorlage: 'rv',
  [UPSTREAM_AUSSCHUSS_TITLE]: 'ausschuss',
  [UPSTREAM_PLENUM_TITLE]: 'plenum',
}

/**
 * The draft's own Gesetzestext, by the exact titles the ressorts use for it.
 *
 * Ordered: the first one present wins. The list is short because it is
 * measured, and it is exact for a reason that cost a measurement to see —
 * three GP-XXVI drafts publish "Gesetzestext, Vorblatt und Erläuterungen"
 * as ONE document. A prefix match would hand that file to `parseLawUnits`,
 * which would parse the Vorblatt and the Erläuterungen into §§ and compare
 * explanatory prose against law text. Those drafts have no isolated
 * Gesetzestext, and the honest answer is that there is nothing to compare.
 *
 * "(korrigierte Version)" beats "(ursprüngliche Version)": when a ressort
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
export function lawStationIndex(id: LawStationId): number {
  return LAW_STATION_ORDER.indexOf(id)
}

export function isLawStationPair(from: LawStationId, to: LawStationId): boolean {
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
 * The heading over the comparison, phrased as the question the pair answers
 * rather than as the name of a procedure — the wording rule the station bar
 * already follows (`shared/utils/stations.ts`).
 *
 * Temporal, never causal (framing rule, CLAUDE.md): a text changed after the
 * Begutachtung is not a text changed BY it, and the comparison cannot know
 * which it was. The ME→RV wording is unchanged because the outcome card
 * links to it by that name.
 */
const PAIR_QUESTIONS: Readonly<Record<string, string>> = {
  'me>rv': 'Was sich nach der Begutachtung geändert hat',
  'me>ausschuss': 'Was sich vom Entwurf bis zum Ausschuss geändert hat',
  'me>plenum': 'Was sich vom Entwurf bis zur Plenarfassung geändert hat',
  'rv>ausschuss': 'Was der Ausschuss an der Regierungsvorlage geändert hat',
  'rv>plenum': 'Was das Parlament an der Regierungsvorlage geändert hat',
  'ausschuss>plenum': 'Was im Plenum noch geändert wurde',
}

export function lawStationPairQuestion(from: LawStationId, to: LawStationId): string {
  return (
    PAIR_QUESTIONS[`${from}>${to}`] ??
    `Was sich zwischen ${LAW_STATION_LABEL[from]} und ${LAW_STATION_LABEL[to]} geändert hat`
  )
}

/**
 * Where to look for the REASON behind a change, per pair.
 *
 * The comparison can only ever show that a text moved, never why — and the
 * document that comes closest to the why is a different one at each station:
 * the Erläuterungen of the Regierungsvorlage after the Begutachtung, the
 * Ausschussbericht for what happened in committee, where the
 * Abänderungsanträge are recorded by name.
 *
 * Framing rule (CLAUDE.md): each sentence points at a document and stops
 * there. "Ob eine Änderung auf eine Stellungnahme zurückgeht, sagt der Text
 * nicht" is the whole claim — the tool does not assert causation it cannot
 * observe.
 */
export function lawStationPairHint(from: LawStationId, to: LawStationId): string {
  if (to === 'rv') {
    return 'Ob eine Änderung auf eine Stellungnahme zurückgeht, sagt der Text nicht; die Erläuterungen der Regierungsvorlage oft schon.'
  }
  return 'Warum sich etwas geändert hat, sagt der Text nicht; der Ausschussbericht nennt die Abänderungsanträge, die dazu eingebracht wurden.'
}

/**
 * Whether both sides of the pair are licensed open data.
 *
 * Not a detail: the Ministerialentwurf belongs to the Begutachtungsverfahren,
 * which Parliament expressly excludes from open-data reuse, while the
 * Regierungsvorlage and the parliamentary versions are licensed datasets
 * (CLAUDE.md, Legal constraints). So a comparison of two parliamentary
 * stations may name its licence, and one involving the draft may not — the
 * same per-source split the footer and the Impressum carry.
 */
export function isLicensedPair(from: LawStationId, to: LawStationId): boolean {
  return from !== 'me' && to !== 'me'
}

/**
 * The corpus list's filters, read from a URL and written back to one.
 *
 * Both directions live here because they are one contract: a link has to
 * reopen the list the reader shared, so every value the URL can carry must
 * parse back to the value that wrote it, and every default has to stay out
 * of the URL — a filter that excludes nothing does not belong in a link
 * somebody passes on.
 *
 * Unknown values fall back rather than erroring: a hand-typed or stale link
 * should show the list everybody means, not a validation message. The
 * endpoints validate the same query independently, because a request can
 * arrive without this page.
 */
import type { AntraegeResponse, AntragRow, AntragState, DraftChain, DraftStation, DraftStatus, DraftsResponse, DraftSummary, LandCode, LandLaw, LandLawSource, LawWithoutBegutachtung, LawsWithoutBegutachtung, LawsWithoutBegutachtungGap, OpenVorlage, RisConsultation, RisConsultationKind, RisConsultationsResponse, StaatsvertraegeResponse, TreatyState } from '#shared/types'
import { searchDrafts, searchRis } from '#shared/utils/searchHaystack'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { countLabelDe, formatNumberDe } from '#shared/utils/format'
import { GP_STARTS, gpSpanLabelDe, gpWindow, intToRoman, isPlausibleGp, romanToInt } from '#shared/utils/gp'
import {
  type LandPeriodCalendars,
  type PeriodView,
  LAND_PERIODS,
  gpOfferedIn,
  gpSpanDatesDe,
  landPeriodChipDe,
  landPeriodSpanLabelDe,
  landtagParts,
  landtagValue,
  parseLandtag,
} from '#shared/utils/periodCalendar'
import { LAND_NAME, LAND_SLUG } from '#shared/utils/laender'
import { LAND_COVERAGE, type CoverageRow } from '#shared/utils/laenderCoverage'
import { DATENLAGE_SOURCES, type DatenlageState } from '#shared/utils/datenlage'
import { listDe } from './geltendeFassung'
import { firstQueryValue } from '#shared/utils/queryParams'
import { ANTRAG_PATH_GPS, antragPathsCover, antragRouteCitation } from '#shared/utils/antragPath'

/**
 * Filter by WHAT a draft is — a law or a Verordnung — since 23.10.2026, the
 * one distinction every source answers: Parliament's Ministerialentwürfe
 * are law drafts (148 of 148 in GP XXVIII, measured 23.10.2026), the RIS
 * half names its instrument (`RisConsultationKind`) and so does each Land
 * (`LandDraftKind`).
 *
 * Until then the filter named a HALF: „Ministerialentwürfe" or
 * „Verordnungsentwürfe und andere". The first is a Bund term — under it
 * every Land stood aside („Länder-Entwürfe sind keine Ministerialentwürfe")
 * — and the second had to admit four law drafts of the RIS half that never
 * reached Parliament. Both questions survive: „only the Bund" is the
 * source chips', and those four now stand where they belong, under
 * „Gesetzesentwürfe". A record of kind `unbestimmt` (none in GP XXVIII)
 * stands only under „Alle Arten".
 *
 * Old links keep working: `?art=ministerialentwurf` reads as `gesetz`, a
 * superset of what it showed; `/weitere-entwuerfe` redirects onto
 * `verordnung`. The value goes to `/api/ris-drafts?art=` as the instrument
 * kind (`draftKindArt`: `andere` is `unbestimmt` there).
 *
 * Since 14.11.2026 „Gesetzesentwürfe" means drafts only: the laws and the
 * open Vorlagen without a draft stood under it until then and now stand
 * under „Alle Arten" and in the group „Ohne Entwurf" (`ART_CHOICES`).
 * `andere` („Andere Entwürfe") is the RIS kind `unbestimmt` — a title that
 * names no legal form: Staatsverträge, Vereinbarungen nach Art. 15a B-VG,
 * programmes.
 *
 * `als-antrag` (14.11.2026) is „Gesetzesentwürfe, als Initiativantrag
 * eingebracht": the Ministerialentwürfe whose row names the Antrag their text
 * came to the Nationalrat as (`antragRouteCitation`). A draft option like the
 * three kinds, but no instrument kind — the halves read it as „Alle Arten"
 * (`draftKindArt`), since a period the route table does not cover sends it
 * back there. Not `antrag`: that value is „Initiativanträge ohne Entwurf"
 * under `begutachtung=ohne`, rows no draft preceded.
 */
export type ArtFilter = '' | 'gesetz' | 'als-antrag' | 'verordnung' | 'andere' | OhneArt | 'initiativantraege' | 'staatsvertraege'

/**
 * The Art under „Ohne Entwurf" (10.11.2026): the item a row came to the
 * Nationalrat as — a Regierungsvorlage, an Initiativantrag or, since
 * 14.11.2026, a committee's own motion (`ausschussantrag`; `item.kind`, an
 * open row's `kind`) — or, since 14.11.2026, the Länder's laws without a
 * draft in their register (`landesgesetz`). The same
 * parameter `art`, valid only together with `begutachtung=ohne`; the draft
 * kinds are valid only without it (`coherentArt`).
 */
export type OhneArt = 'vorlage' | 'antrag' | 'ausschussantrag' | 'landesgesetz'

/* The count line's terms, one per kind and in the Art filter's words. A
 * kind that counts none stays out; „andere" is the RIS kind `unbestimmt`,
 * none in GP XXVIII. */
const KIND_TERM: Record<RisConsultationKind, [one: string, many: string]> = {
  gesetz: ['Gesetzesentwurf', 'Gesetzesentwürfe'],
  verordnung: ['Verordnungsentwurf', 'Verordnungsentwürfe'],
  unbestimmt: ['anderer Entwurf', 'andere Entwürfe'],
}
const KIND_ORDER: readonly RisConsultationKind[] = ['gesetz', 'verordnung', 'unbestimmt']

/* The term a list with no row at all says, by the Art it stands under. */
const EMPTY_TERM: Record<ArtFilter, string> = {
  '': '0 Entwürfe',
  gesetz: '0 Gesetzesentwürfe',
  'als-antrag': '0 Gesetzesentwürfe',
  verordnung: '0 Verordnungsentwürfe',
  andere: '0 andere Entwürfe',
  vorlage: '0 Regierungsvorlagen',
  antrag: '0 Initiativanträge',
  ausschussantrag: '0 Ausschussanträge',
  landesgesetz: '0 Landesgesetze',
  initiativantraege: '0 Initiativanträge',
  staatsvertraege: '0 Staatsverträge',
}

/* The RIS half's failure, named by what it would have brought: the Bund's
 * Verordnungsentwürfe and the few law drafts that never reached
 * Parliament. */
const RIS_FAILED: Record<ArtFilter, string> = {
  '': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  gesetz: 'einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  verordnung: 'die Verordnungsentwürfe des Bundes sind gerade nicht abrufbar',
  andere: 'die anderen Entwürfe des Bundes sind gerade nicht abrufbar',
  // Under „Ohne Entwurf" and „als Initiativantrag" the RIS half counts
  // nothing; the sentence of „Alle Arten" stands in should it ever be asked.
  'als-antrag': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  vorlage: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  antrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  ausschussantrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  landesgesetz: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  initiativantraege: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  staatsvertraege: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
}

/* The same half still on its way (12.11.2026): the failure's register, so
 * „noch geladen" and „nicht abrufbar" stand in the same place and differ
 * only in what they say (`HalfState`). */
const RIS_PENDING: Record<ArtFilter, string> = {
  '': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  gesetz: 'einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  verordnung: 'die Verordnungsentwürfe des Bundes werden noch geladen',
  andere: 'die anderen Entwürfe des Bundes werden noch geladen',
  'als-antrag': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  vorlage: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  antrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  ausschussantrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  landesgesetz: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  initiativantraege: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  staatsvertraege: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
}

/* The Länder's half on its way, named by the Länder it brings — Wien in
 * the genitive of its own, as the list's other Land sentences say it. */
function laenderPendingTerm(lands: readonly LandCode[], what = 'Entwürfe'): string {
  if (lands.length !== 1) return `die ${what} der Länder werden noch geladen`
  const land = lands[0]!
  return `die ${what} ${land === 'w' ? 'Wiens' : `des Landes ${LAND_NAME[land]}`} werden noch geladen`
}

/* The laws without a draft on their way (14.11.2026): the same register,
 * named by what the chip „Ohne Entwurf" calls them. */
const LAWS_PENDING = 'die Gesetze des Bundes ohne Entwurf werden noch geladen'

/* The Initiativanträge of „Alle Initiativanträge" (`/api/antraege`), on their way or failed, in the same register. */
const ANTRAEGE_PENDING = 'die Initiativanträge werden noch geladen'
const ANTRAEGE_FAILED = 'die Initiativanträge sind gerade nicht abrufbar'
/* The treaties of „Staatsverträge" (`/api/staatsvertraege`), likewise. */
const TREATIES_PENDING = 'die Staatsverträge werden noch geladen'
const TREATIES_FAILED = 'die Staatsverträge sind gerade nicht abrufbar'

/* The open Regierungsvorlagen without a draft (14.11.2026): on their way in
 * the laws' register, failed in the RIS half's — the count line's place for a
 * source that could not be read. */
const VORLAGEN_PENDING = 'die Regierungsvorlagen ohne Entwurf werden noch geladen'
const VORLAGEN_FAILED = 'die Regierungsvorlagen ohne Entwurf sind gerade nicht abrufbar'

function sameLands(a: readonly LandCode[], b: readonly LandCode[]): boolean {
  return a.length === b.length && a.every((land) => b.includes(land))
}

/**
 * The count line's pending terms as a line of their own (12.11.2026): the
 * homepage has no count line, and its open list stands with the
 * Ministerialentwürfe while the RIS half or the chosen Länder are still on
 * their way. Same words as `/entwuerfe`, so „noch geladen" reads the same
 * on both pages and stays apart from „gerade nicht abrufbar". Null when
 * nothing is pending.
 */
export function pendingHalvesLine(ris: boolean, laender: readonly LandCode[] | null, art: ArtFilter = ''): string | null {
  const parts = [ris ? RIS_PENDING[art] : null, laender?.length ? laenderPendingTerm(laender) : null]
    .filter((part): part is string => part !== null)
  if (!parts.length) return null
  const label = parts.join(' · ')
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}.`
}

/**
 * Where one half of `/entwuerfe` stands (12.11.2026): not asked for, on its
 * way, there, or failed.
 *
 * `loading` covers two cases the page treats alike: the first answer is
 * still out, and the server's render passed its deadline without it — the
 * payload then carries `null`, so the browser starts in the same state the
 * server rendered (`useDraftHalves`). An error wins over stale data: a half
 * that failed is said to have failed, never counted from an older answer.
 */
export type HalfState = 'off' | 'loading' | 'ready' | 'failed'

export function halfState(wanted: boolean, data: unknown, error: unknown): HalfState {
  if (!wanted) return 'off'
  if (error) return 'failed'
  return data ? 'ready' : 'loading'
}

/**
 * The halves the list is still waiting for while it already shows rows:
 * every half on its way except the one that carries the page, whose wait
 * is the list's own loading state.
 */
/* `NoInfer`: the halves are the keys of `states`, never only the lead's
 * literal — inferred from `lead`, a literal `{ me, ris }` failed the check. */
export function lateHalves<H extends string>(lead: NoInfer<H>, states: Record<H, HalfState>): H[] {
  return (Object.keys(states) as H[]).filter((half) => half !== lead && states[half] === 'loading')
}

/**
 * The Bund halves under the search term — filtered here, not upstream, since
 * 12.11.2026.
 *
 * Until then `q` went to both endpoints: every settled term re-fetched both
 * halves and faded the list while it waited, while the Länder rows, the open
 * Vorlagen and the laws were filtered on the page at once — one search, two
 * code paths, two latencies. The halves now come unsearched and every row
 * kind is searched here, with the predicates the endpoints use
 * (`shared/utils/searchHaystack.ts`), so the same term finds the same rows.
 *
 * What the endpoints computed AFTER their filter has to be computed after
 * this one: the rows and their count (the count line, the placeholder) and
 * `carriedOverFrom` — a sentence about rows of the period before must not
 * stand when the term removed them all. What they compute before any filter
 * stays theirs: the Ressort and period menus, `stationsAvailable`,
 * `euAvailable`, `chainCoverage`. The order is untouched — a filter keeps
 * it, and the page sorts the merged rows anyway.
 *
 * `null` for a half that is not there.
 */
export function searchBundHalves(
  me: Pick<DraftsResponse, 'items' | 'gp'> | null | undefined,
  ris: Pick<RisConsultationsResponse, 'items' | 'ministries' | 'carriedOverFrom' | 'carriedOverIds'> | null | undefined,
  q: string,
): { me: DraftSummary[] | null; ris: RisConsultation[] | null; carriedOverFrom: string | null } {
  const meItems = me ? searchDrafts(me.items, q) : null
  const risItems = ris ? searchRis(ris.items, q, ris.ministries) : null
  const carried = new Set(ris?.carriedOverIds ?? [])
  const meCarried = me ? (meItems!.find((item) => item.gp !== me.gp)?.gp ?? null) : null
  const risCarried = ris?.carriedOverFrom && risItems!.some((item) => carried.has(item.id)) ? ris.carriedOverFrom : null
  return { me: meItems, ris: risItems, carriedOverFrom: meCarried ?? risCarried }
}

/**
 * THE SELECT „ART" (14.11.2026): one control, two groups, in the words of
 * the path graphic's rows (`/wege`, `app/utils/wege.ts`) — the plural of
 * each row the list can filter. It replaced a select of three draft kinds
 * beside a toggle chip „Ohne Entwurf" that silently swapped the select's
 * vocabulary (Regierungsvorlagen, Initiativanträge) when pressed.
 *
 * The URL did not change with it: a choice is still the pair `art` +
 * `begutachtung=ohne` (`artChoiceOf`, `artChoiceParams`), so every link
 * written before keeps landing on the option that means what it meant —
 * `?begutachtung=ohne` is „Alle ohne Entwurf", `…&art=vorlage`
 * „Regierungsvorlagen ohne Entwurf". The two options added that day take
 * the smallest value in the same style: `?art=andere`,
 * `?begutachtung=ohne&art=landesgesetz`.
 *
 * „ALLE OHNE ENTWURF" IS NOT THE SUM OF ITS GROUP, on purpose. It keeps
 * the meaning the chip had: the procedures for which a draft's absence is
 * evidenced — the Bund's (no Ministerialentwurf) and Salzburg's („ohne
 * Begutachtung", `OHNE_LANDS`). „Landesgesetze ohne zugeordneten Entwurf"
 * reaches further: every Land's laws no draft of its register is joined to,
 * where the register reaches back far enough to say so — which claims no
 * absence of a Begutachtung (a Salzburg law whose Vorlage reports one is
 * among them). Folding those into „Alle ohne Entwurf" would make the
 * group's first option claim more than its rows carry. So the group's
 * options together hold more rows than „Alle ohne Entwurf"; and an
 * „ohne Begutachtung" law of Salzburg that RIS gives no route is under „Alle
 * ohne Entwurf" and „Landesgesetze …" but under neither Vorlagen nor Anträge.
 *
 * „ALLE MIT ENTWURF" (`?begutachtung=mit`, 14.11.2026) IS EXACTLY THE SUM OF
 * ITS THREE KINDS: every row that is a draft — the Ministerialentwürfe, the
 * RIS records of every kind (`unbestimmt` included, which „Andere Entwürfe"
 * holds), the Länder's drafts — and no row without one. A draft's kind is
 * always one of Gesetzes-, Verordnungs- and Andere Entwürfe, so nothing
 * stands under the first option that none of the three holds, and nothing
 * under the three that it lacks. With a draft option the parameter is
 * redundant and drops (`coherentBegutachtung`): `?begutachtung=mit&art=gesetz`
 * is `?art=gesetz`.
 *
 * „GESETZESENTWÜRFE, ALS INITIATIVANTRAG EINGEBRACHT" (`?art=als-antrag`,
 * 14.11.2026) IS NO PART OF THAT SUM BUT A SUBSET OF ITS FIRST TWO: the
 * Bund's Ministerialentwürfe whose row says „als Initiativantrag …"
 * (`choiceAdmitsMinisterialentwurf`), all of them also under
 * „Gesetzesentwürfe" and „Alle mit Entwurf" — never a RIS record, a Land's
 * draft or a row without a draft. The list's one option on an inferred fact
 * (`antragPath.ts`, matched by wording; the row says so itself), offered only
 * for the periods the table covers (`ANTRAG_ROUTE_UNAVAILABLE`).
 */
export type ArtChoice = '' | 'mit' | 'gesetz' | 'als-antrag' | 'verordnung' | 'andere' | 'ohne' | 'ohne-vorlage' | 'ohne-antrag' | 'ohne-ausschussantrag' | 'ohne-landesgesetz' | 'initiativantraege' | 'staatsvertraege'

export type ArtGroup = 'mit' | 'ohne' | 'nationalrat'

export const ART_GROUP_LABEL: Record<ArtGroup, string> = {
  mit: 'Mit Entwurf',
  ohne: 'Ohne Entwurf',
  nationalrat: 'Im Nationalrat',
}

export const ART_CHOICES: readonly { value: ArtChoice; label: string; group: ArtGroup | null }[] = [
  { value: '', label: 'Alle Arten', group: null },
  { value: 'mit', label: 'Alle mit Entwurf', group: 'mit' },
  { value: 'gesetz', label: 'Gesetzesentwürfe', group: 'mit' },
  { value: 'als-antrag', label: 'Gesetzesentwürfe, als Initiativantrag eingebracht', group: 'mit' },
  { value: 'verordnung', label: 'Verordnungsentwürfe', group: 'mit' },
  { value: 'andere', label: 'Andere Entwürfe', group: 'mit' },
  { value: 'ohne', label: 'Alle ohne Entwurf', group: 'ohne' },
  { value: 'ohne-vorlage', label: 'Regierungsvorlagen ohne Entwurf', group: 'ohne' },
  { value: 'ohne-antrag', label: 'Initiativanträge ohne Entwurf', group: 'ohne' },
  { value: 'ohne-ausschussantrag', label: 'Ausschussanträge ohne Entwurf', group: 'ohne' },
  { value: 'ohne-landesgesetz', label: 'Landesgesetze ohne zugeordneten Entwurf', group: 'ohne' },
  /* Outside „Alle Arten" (decision 1 of 14.11.2026): every Initiativantrag
   * on a law of the period, whatever became of it — the Anträge that carry
   * a consulted draft as their draft's row (`/api/antraege`). Neither a
   * draft kind nor „ohne Entwurf": most Anträge are still pending, and of a
   * pending Antrag no check can say whether a draft preceded it. The default
   * list stays as it was. */
  { value: 'initiativantraege', label: 'Alle Initiativanträge', group: 'nationalrat' },
  /* Outside „Alle Arten" too (decision 3 of 14.11.2026): every treaty's
   * Vorlage of the period — Staatsverträge and Vereinbarungen nach Art. 15a
   * B-VG (`/api/staatsvertraege`). No law, so neither a draft kind nor „ohne
   * Entwurf", and no Stellungnahme is possible on any of them. */
  { value: 'staatsvertraege', label: 'Staatsverträge', group: 'nationalrat' },
]

export function artChoiceLabel(choice: ArtChoice): string {
  return ART_CHOICES.find((c) => c.value === choice)?.label ?? ''
}

const DRAFT_ARTS: readonly ArtFilter[] = ['gesetz', 'als-antrag', 'verordnung', 'andere']
const OHNE_ARTS: readonly ArtFilter[] = ['vorlage', 'antrag', 'ausschussantrag', 'landesgesetz']

/**
 * An Art the state does not pair with reads as the group's first option — a
 * draft kind with `begutachtung=ohne` as „Alle ohne Entwurf", an Art of
 * „Ohne Entwurf" with `begutachtung=mit` as „Alle mit Entwurf", and without
 * either parameter as „Alle Arten". A leftover value must never empty the list.
 */
export function coherentArt(art: ArtFilter, begutachtung: BegutachtungFilter): ArtFilter {
  // „Alle Initiativanträge" pairs with neither group's parameter.
  if (art === 'initiativantraege' || art === 'staatsvertraege') return begutachtung === '' ? art : ''
  return (begutachtung === 'ohne' ? OHNE_ARTS : DRAFT_ARTS).includes(art) ? art : ''
}

/**
 * `begutachtung=mit` beside a draft kind says nothing the kind does not
 * (every draft kind is „mit Entwurf"), so it drops: the canonical address of
 * `?begutachtung=mit&art=gesetz` is `?art=gesetz`. Apply after `coherentArt`.
 */
export function coherentBegutachtung(art: ArtFilter, begutachtung: BegutachtungFilter): BegutachtungFilter {
  return begutachtung === 'mit' && DRAFT_ARTS.includes(art) ? '' : begutachtung
}

/** The option the two URL parameters stand for. */
export function artChoiceOf(art: ArtFilter, begutachtung: BegutachtungFilter): ArtChoice {
  const coherent = coherentArt(art, begutachtung)
  if (begutachtung === 'ohne') return coherent ? (`ohne-${coherent}` as ArtChoice) : 'ohne'
  if (begutachtung === 'mit' && !coherent) return 'mit'
  return coherent as ArtChoice
}

/** And back: the parameters an option writes. */
export function artChoiceParams(choice: ArtChoice): { art: ArtFilter; begutachtung: BegutachtungFilter } {
  if (choice === 'mit') return { art: '', begutachtung: 'mit' }
  if (choice === 'ohne') return { art: '', begutachtung: 'ohne' }
  if (choice.startsWith('ohne-')) return { art: choice.slice(5) as ArtFilter, begutachtung: 'ohne' }
  return { art: choice as ArtFilter, begutachtung: '' }
}

export function isOhneChoice(choice: ArtChoice): boolean {
  return choice === 'ohne' || choice.startsWith('ohne-')
}

/** The reasons an option cannot be offered (the page computes the gaps). */
export const ART_UNAVAILABLE_REASON = {
  andere: 'nur für Entwürfe des Bundes',
  ausschussantrag: 'nur für Gesetze des Bundes',
  staatsvertraege: 'nur für den Bund',
  landesgesetz: 'nur für Gesetze der Länder',
} as const

/* The periods the route table covers, in words: „die XXVI. bis XXVIII. GP"
 * — from the table, so a period measured later widens the sentence. */
function antragPathSpanDe(): string {
  const gps = [...ANTRAG_PATH_GPS].sort((a, b) => (romanToInt(a) ?? 0) - (romanToInt(b) ?? 0))
  const nums = gps.map((gp) => romanToInt(gp) ?? 0)
  const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1]! + 1)
  if (gps.length > 2 && contiguous) return `die ${gps[0]}. bis ${gps.at(-1)}. GP`
  return `die ${listDe(gps.map((gp) => `${gp}.`))} GP`
}

/**
 * „Gesetzesentwürfe, als Initiativantrag eingebracht" outside the periods the
 * route table was measured for: there no draft is matched, and an empty list
 * would read as „none took that route".
 */
export const ANTRAG_ROUTE_UNAVAILABLE = `nur für ${antragPathSpanDe()} erfasst`

export interface ArtSelectOption {
  value: ArtChoice
  label: string
  disabled: boolean
}

/**
 * The select's groups in the state the list is in. Two options appear only
 * where they can hold a row — „Andere Entwürfe" while the view holds one
 * (`others`), „Landesgesetze ohne zugeordneten Entwurf" while a Land is
 * selected — and always while chosen, so a link never lands on a blank
 * select. An option with a reason (`unavailable`) stands `disabled`: a
 * disabled <option> cannot carry its reason to a screen reader, so the
 * reason is the list's one note when a link asks for it (`artUnavailableNote`).
 */
export function artSelectFor(o: {
  chosen: ArtChoice
  others: boolean
  landSelected: boolean
  unavailable: Partial<Record<ArtChoice, string | null>>
}): { label: string | null; options: ArtSelectOption[] }[] {
  const shown = (value: ArtChoice) =>
    value === o.chosen || (value === 'andere' ? o.others : value === 'ohne-landesgesetz' ? o.landSelected : true)
  const option = (c: (typeof ART_CHOICES)[number]): ArtSelectOption =>
    ({ value: c.value, label: c.label, disabled: !!o.unavailable[c.value] })
  const groups: { label: string | null; options: ArtSelectOption[] }[] = [
    { label: null, options: ART_CHOICES.filter((c) => c.group === null).map(option) },
  ]
  for (const group of ['mit', 'ohne', 'nationalrat'] as const) {
    groups.push({ label: ART_GROUP_LABEL[group], options: ART_CHOICES.filter((c) => c.group === group && shown(c.value)).map(option) })
  }
  return groups
}

/** The one line a link to an unavailable option gets: which, why, and what the list shows instead. */
export function artUnavailableNote(choice: ArtChoice, reason: string): string {
  return `„${artChoiceLabel(choice)}“: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}; die Liste zeigt deshalb alle Arten.`
}

/* Which rows each option admits — the page asks these for every row kind,
 * so an option's rows are exactly what its label says (tests/draftFilters). */

/** A draft — Ministerialentwurf (a law draft), RIS record or Land's draft — by
 *  its kind. Never under „als Initiativantrag": a RIS record and a Land's draft
 *  carry no route, and a Ministerialentwurf is asked by its own predicate. */
export function choiceAdmitsDraft(choice: ArtChoice, kind: RisConsultationKind): boolean {
  if (choice === '' || choice === 'mit') return true
  if (choice === 'andere') return kind === 'unbestimmt'
  return choice === kind
}

/** A Ministerialentwurf: a law draft by kind, and under „als Initiativantrag"
 *  only where its row names the Antrag (`antragRouteCitation`) — the same
 *  condition as the row's words, so the option holds exactly those rows.
 *  Under „Alle Initiativanträge" the same rows: there the draft's row stands
 *  for the Antrag that carries its text (`/api/antraege` leaves it out). */
export function choiceAdmitsMinisterialentwurf(
  choice: ArtChoice,
  draft: Pick<DraftSummary, 'active'> & { chain?: Pick<DraftChain, 'antragCitation'> | null },
): boolean {
  if (choice === 'als-antrag' || choice === 'initiativantraege') return antragRouteCitation(draft) !== null
  return choiceAdmitsDraft(choice, 'gesetz')
}

/**
 * Which draft halves an option shows rows of. Under „als Initiativantrag" only
 * the Ministerialentwürfe: the RIS and Länder halves are still asked for (a
 * period the table does not cover sends the option back to „Alle Arten"), but
 * their rows, their count and their „noch geladen" stay out of the list.
 */
export function draftRowsOf(choice: ArtChoice): { me: boolean; ris: boolean; laender: boolean } {
  // „Alle Initiativanträge": the drafts whose text came as an Antrag only.
  if (choice === 'initiativantraege') return { me: true, ris: false, laender: false }
  const anyKind = (['gesetz', 'verordnung', 'unbestimmt'] as const).some((kind) => choiceAdmitsDraft(choice, kind))
  return { me: choice === 'als-antrag' || choiceAdmitsDraft(choice, 'gesetz'), ris: anyKind, laender: anyKind }
}

/**
 * Whether an option shows the Initiativanträge of `/api/antraege` — only
 * „Alle Initiativanträge", which stands outside „Alle Arten" (decision 1 of
 * 14.11.2026): the default list stays as it was.
 */
export function antragRowsOf(choice: ArtChoice): boolean {
  return choice === 'initiativantraege'
}

/** Whether an option shows the treaties of `/api/staatsvertraege` — only
 *  „Staatsverträge" (decision 3 of 14.11.2026). */
export function treatyRowsOf(choice: ArtChoice): boolean {
  return choice === 'staatsvertraege'
}

/** The station a treaty's row stands at, for the station tabs: the Vorlage
 *  while the house has it, the Bundesgesetzblatt once promulgated, and
 *  Parlament once approved without a Kundmachung found, or lapsed. */
export function treatyStationOf(state: TreatyState): DraftStation {
  if (state === 'pending') return 'rv'
  return state === 'promulgated' ? 'bgbl' : 'parlament'
}

/** The list's one note on the treaties, where the Kundmachungen could not
 *  be read; empty otherwise. */
export function treatyGapNotes(t: Pick<StaatsvertraegeResponse, 'bgblUnread'> | null | undefined): string[] {
  return t?.bgblUnread ? ['Ob ein Staatsvertrag kundgemacht ist, ist gerade nicht abrufbar.'] : []
}

/**
 * The station an Initiativantrag's row stands at, for the station tabs: the
 * item itself while the house has it (the slot an open Vorlage takes),
 * the Bundesgesetzblatt once promulgated, and Parlament for every end the
 * house reached without a Kundmachung.
 */
export function antragStationOf(state: AntragState): DraftStation {
  if (state === 'open' || state === 'pending' || state === 'pending-unverified') return 'rv'
  return state === 'promulgated' ? 'bgbl' : 'parlament'
}

/**
 * The list's one note on the Initiativanträge, where they did not all come
 * whole (14.11.2026): the Kundmachungen unread, or the flag of some still in
 * the house not read in time — then those rows say „in Behandlung" and
 * nothing about a Stellungnahme. Two gaps, two sentences. Empty where none.
 */
export function antragGapNotes(a: Pick<AntraegeResponse, 'bgblUnread'> & { items: readonly Pick<AntragRow, 'state'>[] } | null | undefined): string[] {
  if (!a) return []
  const unverified = a.items.filter((i) => i.state === 'pending-unverified').length
  return [
    ...(a.bgblUnread ? ['Ob ein Initiativantrag kundgemacht ist, ist gerade nicht abrufbar.'] : []),
    ...(unverified ? [`Ob eine Stellungnahme möglich ist, ist bei ${countLabelDe(unverified, 'Initiativantrag', 'Initiativanträgen')} gerade nicht abrufbar.`] : []),
  ]
}

/** An open item of the second round — a Regierungsvorlage or a committee's
 *  motion (`kind`) — by what is known of a draft before it. */
export function choiceAdmitsOpenVorlage(
  choice: ArtChoice,
  consultation: OpenVorlage['consultation']['kind'],
  kind: OpenVorlage['kind'] = 'regierungsvorlage',
): boolean {
  if (choice === '') return consultation !== 'draft'
  const noted = consultation === 'none' || consultation === 'committee'
  if (choice === 'ohne') return noted
  if (choice === 'ohne-vorlage') return noted && kind === 'regierungsvorlage'
  if (choice === 'ohne-ausschussantrag') return noted && kind === 'ausschussantrag'
  return false
}

/** An enacted law of the Bund without a Ministerialentwurf, by the item it came as. */
export function choiceAdmitsBundLaw(choice: ArtChoice, kind: LawWithoutBegutachtung['item']['kind']): boolean {
  if (choice === '' || choice === 'ohne') return true
  if (choice === 'ohne-vorlage') return kind === 'rv'
  if (choice === 'ohne-antrag') return kind === 'antrag'
  if (choice === 'ohne-ausschussantrag') return kind === 'ausschussantrag'
  return false
}

/**
 * A Land's law without a draft joined to it. Under „Alle ohne Entwurf" and
 * its two items only the evidenced „ohne Begutachtung" (Salzburg); under
 * „Landesgesetze ohne zugeordneten Entwurf" every law the count line calls
 * so — „ohne Begutachtung", or the register reaches back far enough
 * (`registerCovers`) — never the plain „Landesgesetz" before its reach, for
 * which a draft may have existed (`draftCountLabel`).
 */
export function choiceAdmitsLandLaw(
  choice: ArtChoice,
  law: Pick<LandLaw, 'begutachtung' | 'registerCovers'> & { route: Pick<NonNullable<LandLaw['route']>, 'kind'> | null },
): boolean {
  const none = law.begutachtung.kind === 'none'
  switch (choice) {
    case '': return true
    case 'ohne': return none
    case 'ohne-vorlage': return none && law.route?.kind === 'vorlage'
    case 'ohne-antrag': return none && law.route?.kind === 'antrag'
    // No Land's law comes from a committee's motion in the sources read.
    case 'ohne-ausschussantrag': return false
    case 'ohne-landesgesetz': return none || law.registerCovers === true
    default: return false
  }
}

/* ------------------------------------------------------------------ *
 * The rows without a draft: shown, asked for, and what they decide
 * (14.11.2026)
 *
 * Three answers come late, on the client: the Bund's laws without a draft
 * (`/api/ohne-begutachtung`), the Länder's laws (`/api/laender/gesetze`)
 * and the open Regierungsvorlagen (`/api/dashboard/zweite-runde`). They are
 * rows — and two of them also say whether an option of „Ohne Entwurf" can
 * be offered. One rule for every option of the select: an option's
 * availability is known before it is chosen. So under the four draft
 * options too the answers that decide availability are asked for — never
 * shown, counted or announced there (`withoutDraftRowsOf`) — and the
 * answers only rows need are not.
 * ------------------------------------------------------------------ */

/** Which rows without a draft an applied option shows. None under the five
 *  draft options: „Alle mit Entwurf", its three kinds and „als Initiativantrag"
 *  hold drafts only. */
export function withoutDraftRowsOf(choice: ArtChoice): { vorlagen: boolean; bundLaws: boolean; landLaws: boolean } {
  return {
    vorlagen: choiceAdmitsOpenVorlage(choice, 'none') || choiceAdmitsOpenVorlage(choice, 'none', 'ausschussantrag'),
    bundLaws: (['rv', 'antrag', 'ausschussantrag'] as const).some((kind) => choiceAdmitsBundLaw(choice, kind)),
    landLaws: choice === '' || isOhneChoice(choice),
  }
}

/** What the sources and the other controls say before any answer: the Bund
 *  among them, a Land that applies, Salzburg (`OHNE_LANDS`) among those. */
export interface ArtSources {
  bund: boolean
  landsApply: boolean
  ohneLandsApply: boolean
}

/**
 * Which options cannot be offered for the sources alone — decided on the
 * first render, on the server too, without waiting for any answer: „Andere
 * Entwürfe" and „als Initiativantrag" without the Bund, the three
 * Bund-and-Salzburg options of „Ohne Entwurf" with neither, „Landesgesetze
 * ohne zugeordneten Entwurf" without a Land.
 */
export function artUnavailableBySources(s: ArtSources): Partial<Record<ArtChoice, string | null>> {
  const ohne = !s.bund && !s.ohneLandsApply ? 'Nur für Gesetze des Bundes und Salzburgs feststellbar' : null
  return {
    andere: s.bund ? null : ART_UNAVAILABLE_REASON.andere,
    'als-antrag': s.bund ? null : ART_UNAVAILABLE_REASON.andere,
    ohne,
    'ohne-vorlage': ohne,
    'ohne-antrag': ohne,
    'ohne-ausschussantrag': s.bund ? null : ART_UNAVAILABLE_REASON.ausschussantrag,
    initiativantraege: s.bund ? null : ART_UNAVAILABLE_REASON.ausschussantrag,
    staatsvertraege: s.bund ? null : ART_UNAVAILABLE_REASON.staatsvertraege,
    'ohne-landesgesetz': s.landsApply ? null : ART_UNAVAILABLE_REASON.landesgesetz,
  }
}

/** The answers that decide what the sources leave open. `undefined`: not
 *  there yet — unknown is not unavailable, so the option stays enabled. */
export interface ArtAnswers {
  bundLaws?: Pick<LawsWithoutBegutachtung, 'available' | 'gap'> | null
  bundLawsFailed?: boolean
  sbgLaws?: Pick<LandLawSource, 'state' | 'statements'> | null
  landLawsFailed?: boolean
  /** The Bund's period in view — the chosen one, else the running one the
   *  Ministerialentwürfe answered for; '' while neither is known. */
  gp?: string
  /** The Ministerialentwürfe came without their chains (`stationsAvailable:
   *  false`): no row can name its route. */
  chainsMissing?: boolean
}

/* „als Initiativantrag": a period the route table does not cover, or rows
 * that came without the chain that names the route. */
function antragRouteReason(a: ArtAnswers): string | null {
  if (a.gp && !antragPathsCover(a.gp)) return ANTRAG_ROUTE_UNAVAILABLE
  return a.chainsMissing ? begutachtungGapReason('unread') : null
}

/**
 * Every option's reason, the sources' first, then the answers': where the
 * Bund is a source its laws' answer decides the three options of „Ohne
 * Entwurf" (a period that cannot carry the claim, an answer not read), else
 * Salzburg's. A failed fetch is no answer either: „Gerade nicht abrufbar",
 * so the option steps back instead of counting a silent zero. „als
 * Initiativantrag" by the period and the Ministerialentwürfe' chains
 * (`antragRouteReason`).
 */
export function artUnavailableFor(s: ArtSources, a: ArtAnswers): Partial<Record<ArtChoice, string | null>> {
  const bySources = artUnavailableBySources(s)
  if (bySources.ohne) return bySources
  const alsAntrag = bySources['als-antrag'] ?? antragRouteReason(a)
  let ohne: string | null
  if (s.bund) {
    ohne = a.bundLawsFailed ? begutachtungGapReason('unread') : a.bundLaws?.available === false ? begutachtungGapReason(a.bundLaws.gap) : null
  } else if (a.landLawsFailed || a.sbgLaws?.state === 'unavailable') {
    ohne = begutachtungGapReason('unread')
  } else {
    ohne = a.sbgLaws?.statements === 'pending' ? begutachtungGapReason('pending') : null
  }
  return { ...bySources, 'als-antrag': alsAntrag, ohne, 'ohne-vorlage': ohne, 'ohne-antrag': ohne, 'ohne-ausschussantrag': bySources['ohne-ausschussantrag'] ?? ohne }
}

/**
 * Which of the three answers the page asks for, under the option the
 * sources leave chosen (`artUnavailableBySources`: a chosen option they rule
 * out filters as „Alle Arten"). Rows: what that option shows — an option of
 * „Ohne Entwurf" asks what „Alle Arten" shows, since its answer may still
 * send it back there. Availability, under every option: the Bund's laws
 * while the Bund is a source, the Länder's laws where Salzburg alone
 * decides. The open Vorlagen decide nothing, so the draft options never ask
 * for them.
 */
export function withoutDraftRequests(choice: ArtChoice, s: ArtSources): { vorlagen: boolean; bundLaws: boolean; landLaws: boolean } {
  const rows = withoutDraftRowsOf(isOhneChoice(choice) ? '' : choice)
  return {
    vorlagen: s.bund && rows.vorlagen,
    bundLaws: s.bund,
    landLaws: s.landsApply && (rows.landLaws || (!s.bund && s.ohneLandsApply)),
  }
}

/** Why the Ressort select is unavailable under „Ohne Entwurf" (`coherentFilters`). */
export const OHNE_MINISTRY_REASON = 'Gesetze ohne Entwurf sind keinem Ressort zugeordnet'

/**
 * The one rule for what „Ohne Entwurf" takes from the
 * other filters (10.11.2026): the Art it does not offer (`coherentArt`), and
 * the Ressort — its rows carry none, so a Ressort could only empty the list,
 * and a per-ministry filter over them would be the ranking by ministry this
 * product does not make. Only while it applies (`chipApplies`: chosen, and
 * not unavailable for the period or the sources); choosing another option
 * restores nothing.
 */
export function coherentFilters<T extends { art: ArtFilter; ministry: string }>(
  f: T,
  begutachtung: BegutachtungFilter,
  chipApplies: boolean = begutachtung === 'ohne',
): T {
  return { ...f, art: coherentArt(f.art, begutachtung), ministry: begutachtung === 'ohne' && chipApplies ? '' : f.ministry }
}

/** The instrument kind the draft halves are asked for (`/api/ris-drafts?art=`),
 *  or none — the Arts of „Ohne Entwurf" are no instrument kind, nor is „als
 *  Initiativantrag", which may step back to „Alle Arten" (`ArtFilter`). */
export function draftKindArt(art: ArtFilter): '' | RisConsultationKind {
  if (art === 'andere') return 'unbestimmt'
  return art === 'gesetz' || art === 'verordnung' ? art : ''
}

/**
 * Two orders since 02.10.2026, each a column of the list. „Zuletzt
 * dazugekommen" (`neu`) and the title order that replaced it for a day
 * (`titel`) went; old links with either open the default order, like any
 * key nothing matches.
 */
export type SortKey = 'frist' | 'stellungnahmen'

/**
 * „Setzt EU-Recht um": the drafts
 * whose EU fact says they implement EU law — `umsetzung` and
 * `ueber-umsetzung`, the two markers the fact leads with „Setzt EU-Recht
 * um". One value, not the four markers: the question a reader brings is
 * „which drafts implement EU law", and a draft that only accompanies a
 * regulation answers no deadline. A chip, off by default, so it stays out
 * of the URL while off. Available under every Art: a Verordnung can
 * implement a directive as well as a law can.
 */
export type EuFilter = '' | 'umsetzung'

/**
 * „Ohne Entwurf": the list shows only the procedures no draft preceded —
 * for the Bund the enacted laws of the period and the open Vorlagen without
 * a draft behind them. A chip until 14.11.2026, now the group of that name
 * in the select „Art" (`ART_CHOICES`); out of the URL while off, like
 * `EuFilter`: `?begutachtung=ohne`. Not passed
 * to the list endpoints — the page asks its own (`/api/ohne-begutachtung`)
 * and steps the other halves back, as `art` decides which halves are asked.
 *
 * `mit` (14.11.2026) is the counterpart, „Alle mit Entwurf": the drafts of
 * every kind and nothing else — valid only without a draft kind, beside
 * which it is redundant and drops (`coherentBegutachtung`).
 */
export type BegutachtungFilter = '' | 'ohne' | 'mit'

/** The filters the URL shares besides the page's own. `art` is not among
 *  them: it selects the half, so the page leaves the excluded endpoint
 *  unasked instead of passing the value on. (`/api/ris-drafts` does take an
 *  `art`, but it means the instrument kind — a different vocabulary.) `q`
 *  is, but the endpoints are not asked with it (`draftApiQuery`). */
export interface DraftQueryFilters {
  status: DraftStatus
  stations: DraftStation[]
  gp: string
  ministry: string
  /** The debounced term, already trimmed. */
  q: string
  eu: EuFilter
}

export interface DraftFilterValues extends DraftQueryFilters {
  /**
   * A Land's own period, `sbg-17` (`?landtag=`, 14.11.2026) — only while that
   * one Land is the selection (`coherentSpan`); '' otherwise. Never sent to
   * the Bund's endpoints, so not in `DraftQueryFilters`.
   */
  landtag: string
  art: ArtFilter
  begutachtung: BegutachtungFilter
  sort: SortKey
  /** The order turned round (`SortHeader`, 06.11.2026): `?reverse=1`. */
  reversed: boolean
}

function parseStations(v: unknown): DraftStation[] {
  const raw = firstQueryValue(v) ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DraftStation => (DRAFT_STATION_ORDER as readonly string[]).includes(s))
}

function parseStatus(v: unknown): DraftStatus {
  const s = firstQueryValue(v)
  return s === 'open' || s === 'closed' ? s : 'all'
}

function parseArt(v: unknown): ArtFilter {
  const s = firstQueryValue(v)
  if (s === 'ministerialentwurf') return 'gesetz'
  return s === 'gesetz' || s === 'als-antrag' || s === 'verordnung' || s === 'andere' || s === 'vorlage' || s === 'antrag' || s === 'ausschussantrag' || s === 'landesgesetz' || s === 'initiativantraege' || s === 'staatsvertraege' ? s : ''
}

function parseEu(v: unknown): EuFilter {
  return firstQueryValue(v) === 'umsetzung' ? 'umsetzung' : ''
}

function parseBegutachtung(v: unknown): BegutachtungFilter {
  const s = firstQueryValue(v)
  return s === 'ohne' || s === 'mit' ? s : ''
}

function parseSort(v: unknown): SortKey {
  const s = firstQueryValue(v)
  return s === 'stellungnahmen' ? s : 'frist'
}

/* The newest period the calendar has a row for — it gains one the day a
 * period convenes (`GP_STARTS`). */
const NEWEST_CALENDAR_GP = intToRoman(Math.max(...Object.keys(GP_STARTS).map((g) => romanToInt(g) ?? 0)))

/**
 * A period both endpoints will answer for, or none — which is the running
 * one.
 *
 * Passed through unchecked until 22.10.2026, and the endpoints refuse what
 * does not pass here: 400 for a code that is no Roman numeral, 404 for one
 * past the running period's successor (`readListQuery`,
 * `requirePlausibleGp`). `?gp=XYZ` left the list as an error card without
 * its filters, and „Erneut versuchen" asked the same question again. So the
 * server's rule (`isPlausibleGp`), held against the newest period the
 * calendar knows: the running one is an upstream call the browser does not
 * make, and a calendar a period behind only drops a code that would have
 * shown an empty list. Lower case is read the way the server reads it — a
 * messenger lowercases links.
 */
function parseGp(v: unknown): string {
  const s = (firstQueryValue(v) ?? '').trim().toUpperCase()
  return isPlausibleGp(s, NEWEST_CALENDAR_GP) ? s : ''
}

/**
 * A Land period the calendar holds, in its canonical spelling — lower or
 * upper case, as `parseGp` reads a GP; anything else is dropped, never an
 * error card. Whether it APPLIES depends on the sources, which the URL does
 * not always carry (the cookie): `coherentSpan` decides that.
 */
function parseLandtagParam(v: unknown, calendars: LandPeriodCalendars): string {
  return parseLandtag(firstQueryValue(v), calendars)?.value ?? ''
}

export function draftFiltersFromQuery(
  query: Record<string, unknown>,
  calendars: LandPeriodCalendars = LAND_PERIODS,
): DraftFilterValues {
  const parsed = parseBegutachtung(query.begutachtung)
  const art = coherentArt(parseArt(query.art), parsed)
  const begutachtung = coherentBegutachtung(art, parsed)
  return {
    landtag: parseLandtagParam(query.landtag, calendars),
    status: parseStatus(query.status),
    stations: parseStations(query.station),
    art,
    gp: parseGp(query.gp),
    ministry: firstQueryValue(query.ministry) ?? '',
    q: firstQueryValue(query.q) ?? '',
    sort: parseSort(query.sort),
    reversed: firstQueryValue(query.reverse) === '1',
    eu: parseEu(query.eu),
    begutachtung,
  }
}

/**
 * What the two list endpoints are asked for — WITHOUT the search term since
 * 12.11.2026: the page searches the halves itself (`searchBundHalves`), so
 * a new term costs no request and the rows do not fade while it is typed.
 * The endpoints still take `q` for every other caller.
 */
export function draftApiQuery(f: Omit<DraftQueryFilters, 'q'>): {
  status: DraftStatus
  station: string | undefined
  gp: string | undefined
  ministry: string | undefined
  eu: EuFilter | undefined
} {
  return {
    status: f.status,
    station: f.stations.length ? f.stations.join(',') : undefined,
    gp: f.gp || undefined,
    ministry: f.ministry || undefined,
    eu: f.eu || undefined,
  }
}

/** Defaults stay out of the URL, so the canonical address of the list is bare. */
export function draftUrlQuery(f: DraftFilterValues): Record<string, string> {
  const query: Record<string, string> = {}
  if (f.status !== 'all') query.status = f.status
  if (f.stations.length) query.station = f.stations.join(',')
  const art = coherentArt(f.art, f.begutachtung)
  if (art) query.art = art
  if (f.gp) query.gp = f.gp
  if (f.landtag) query.landtag = f.landtag
  if (f.ministry) query.ministry = f.ministry
  if (f.q) query.q = f.q
  if (f.sort !== 'frist') query.sort = f.sort
  if (f.reversed) query.reverse = '1'
  if (f.eu) query.eu = f.eu
  const begutachtung = coherentBegutachtung(art, f.begutachtung)
  if (begutachtung) query.begutachtung = begutachtung
  return query
}

/**
 * Whether two states write the same URL — and are therefore the same list,
 * since the URL carries every filter and the round trip loses nothing.
 * `useDraftFilters` tells its own write-back from a navigation by it.
 */
export function sameDraftFilters(a: DraftFilterValues, b: DraftFilterValues): boolean {
  const x = draftUrlQuery(a)
  const y = draftUrlQuery(b)
  const keys = Object.keys(x)
  return keys.length === Object.keys(y).length && keys.every((key) => x[key] === y[key])
}

/* ------------------------------------------------------------------ *
 * What the list page builds from the filters — pure, so it is tested
 * ------------------------------------------------------------------ */

/* The value of the tab a multi-station link lands on — no station has it. */
export const SEVERAL_STATIONS = 'mehrere'

const VERORDNUNG_NO_STATION = 'Verordnungsentwürfe kommen nicht ins Parlament'

export interface StationTab {
  value: string
  label: string
  disabled?: boolean
  reason?: string
  selectLabel?: string
}

/**
 * The station tabs, single-select over the filter's list: the URL still
 * carries a list (`station=rv,parlament`), so a link naming several keeps
 * its set and lands on a tab that names them — no tab silently drops a
 * station from a shared link. Choosing a tab narrows to that one.
 *
 * Under „Verordnungsentwürfe" two tabs cannot hold anything — without a
 * Gegenstand there is no Regierungsvorlage — and stay in place, unavailable,
 * so the strip does not change shape with the Art filter.
 */
export function stationTabsFor(art: ArtFilter, stations: readonly DraftStation[]): StationTab[] {
  const tabs: StationTab[] = [
    { value: '', label: 'Alle', selectLabel: 'Alle Stationen' },
    ...DRAFT_STATION_ORDER.map((value) => {
      const noVorlage = art === 'verordnung' && (value === 'rv' || value === 'parlament')
      return { value: value as string, label: DRAFT_STATION_LABEL[value], disabled: noVorlage, reason: noVorlage ? VERORDNUNG_NO_STATION : undefined }
    }),
  ]
  if (stations.length > 1) {
    tabs.push({ value: SEVERAL_STATIONS, label: stations.map((st) => DRAFT_STATION_LABEL[st]).join(' + ') })
  }
  return tabs
}

/**
 * Both halves know the periods and the ressorts; the union is the menu — the
 * union of the halves that are ASKED FOR (the caller passes nothing for a
 * half it did not fetch). Under an Art filter the menu therefore names the
 * Ressorts of the half on the page: a Ressort that could only empty the list
 * is not a choice.
 *
 * Newest period first, by the NUMBER the Roman code stands for — comparing
 * the strings would put XXVIII before XXX, and the table reaches far enough
 * that this stops being hypothetical.
 */
export function unionGps(...halves: (readonly string[] | undefined)[]): string[] {
  const all = new Set(halves.flatMap((h) => h ?? []))
  return [...all].sort((a, b) => (romanToInt(b) ?? 0) - (romanToInt(a) ?? 0))
}

/**
 * The select „Zeitraum" in the state the sources put it in (14.11.2026,
 * `periodViewFor`): its options as value and label. A GP's value is its code
 * (`?gp=`), a Land period's its `landtag` value (`sbg-17`); the two cannot
 * collide (lower case and a hyphen against a Roman numeral).
 *
 *  - the Bund: its periods with dates and GP, „seit 24.10.2024 (GP XXVIII)";
 *  - several Länder, or a Land without a verified calendar: the same spans by
 *    their dates alone, „seit 24.10.2024" — only those with a window, since a
 *    span the Bund's calendar does not reach holds no Land's draft;
 *  - one Land with its calendar: its periods, „seit 03.07.2023 (17.
 *    Gesetzgebungsperiode)", then the Bund's spans its calendar does not
 *    reach back to, by their dates.
 *
 * `gps` is the menu the halves brought (newest first); before it is there,
 * the chosen GP stands alone, or '' — the page's „Zeitraum …".
 */
export function spanOptionsFor(
  view: PeriodView,
  gps: readonly string[],
  chosenGp: string,
  calendars: LandPeriodCalendars = LAND_PERIODS,
): { value: string; label: string }[] {
  const menu = gps.length ? gps : [chosenGp]
  const gpOption = (gp: string) => ({
    value: gp,
    label: !gp ? 'Zeitraum …' : view.mode === 'bund' ? gpSpanLabelDe(gp) : (gpSpanDatesDe(gp) ?? `GP ${gp}`),
  })
  if (view.mode === 'bund') return menu.map(gpOption)
  const bundSpans = menu.filter((gp) => gp && gpOfferedIn(gp, view)).map(gpOption)
  if (view.mode === 'dates') return bundSpans.length ? bundSpans : [gpOption(chosenGp && gpWindow(chosenGp) ? chosenGp : '')]
  return [
    ...view.periods.map((p) => ({ value: landtagValue(view.land, p.id), label: landPeriodSpanLabelDe(view.land, p, calendars) })),
    ...bundSpans,
  ]
}

/* By code; a name wins over an empty one, whichever half brings it. */
export function unionMinistries(
  ...halves: (readonly { code: string; name: string }[] | undefined)[]
): { code: string; name: string }[] {
  const byCode = new Map<string, string>()
  for (const m of halves.flatMap((h) => h ?? [])) {
    if (!byCode.has(m.code) || (!byCode.get(m.code) && m.name)) byCode.set(m.code, m.name)
  }
  return [...byCode].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))
}

export type FilterChipKey = 'status' | 'art' | 'gp' | 'landtag' | 'ministry'

/**
 * The closed panel's values, each as a chip that removes it. Data, not
 * closures: what a press resets is the page's (it owns the refs).
 *
 * `status` appears only for an old `?status=closed` link — „Nicht möglich"
 * left the controls on 02.10.2026 and survives as this chip.
 *
 * The period chip stays „GP XXVIII" while its option reads „seit 24.10.2024
 * (GP XXVIII)" (14.11.2026): the chip only repeats a choice the reader made in
 * that select, and the GP is the part of the option that names it; the dates
 * would double the chip's width in a row the Ressort chip shares on a phone.
 *
 * The chip follows the calendar that names the span (14.11.2026,
 * `periodViewFor`): a Land's own period by its short designation („17. GP
 * Salzburg", `landPeriodChipDe`), a Bund span without a period name — several
 * Länder, or a Land whose periods are not verified — by its dates in the
 * compact form („seit 24.10.2024", „23.10.2019–23.10.2024").
 */
export function activeFilterChips(
  f: Pick<DraftFilterValues, 'status' | 'art' | 'gp' | 'ministry'> & { landtag?: string; begutachtung?: BegutachtungFilter },
  view: PeriodView = { mode: 'bund' },
  calendars: LandPeriodCalendars = LAND_PERIODS,
): { key: FilterChipKey; label: string }[] {
  const out: { key: FilterChipKey; label: string }[] = []
  if (f.status === 'closed') out.push({ key: 'status', label: 'Nicht möglich' })
  /* The select's option by its label — „Ohne Entwurf" included since it
   * moved into the select (14.11.2026); one press clears both parameters. */
  const choice = artChoiceOf(f.art, f.begutachtung ?? '')
  if (choice) out.push({ key: 'art', label: artChoiceLabel(choice) })
  if (f.landtag) {
    const parts = landtagParts(f.landtag)
    const period = parts ? calendars[parts.land]?.find((p) => p.id === parts.id) : undefined
    out.push({ key: 'landtag', label: parts && period ? landPeriodChipDe(parts.land, period) : f.landtag })
  }
  if (f.gp) out.push({ key: 'gp', label: view.mode === 'bund' ? `GP ${f.gp}` : (gpSpanDatesDe(f.gp, true) ?? `GP ${f.gp}`) })
  if (f.ministry) out.push({ key: 'ministry', label: f.ministry })
  return out
}

/**
 * The count line: the rows of the list by KIND — law, Verordnung — summed
 * over every source, since 24.10.2026. It speaks the Art filter's words,
 * the axis right above it; where a row comes from is the source chips'
 * question and each row's own line.
 *
 * Until then it counted by source: „148 Ministerialentwürfe · 4 weitere
 * Gesetzesentwürfe · 206 Verordnungsentwürfe · 282 Entwürfe aus den
 * Ländern" — the Bund split by data half and kind, the Länder by neither,
 * and „weitere" asked the reader to know where Parliament's data ends. The
 * sum pools no figure only one half carries (the Stellungnahmen), and a count of law drafts is a
 * count of law drafts wherever they were published.
 */
export function draftCountLabel(c: {
  /** Ministerialentwürfe — law drafts all (148 of 148 in GP XXVIII); null
   *  where the half is not asked for. */
  me: number | null
  /** The Regierungsvorlagen without a draft that stand in the list;
   *  `pending` while they are on their way and the view would show them,
   *  `failed` where their fetch failed (14.11.2026) — said, never counted. */
  vorlagen: readonly (Pick<OpenVorlage, 'consultation'> & Partial<Pick<OpenVorlage, 'kind'>>)[] | 'pending' | 'failed'
  /** The enacted laws without a Ministerialentwurf that stand in the list
   *  (`?begutachtung=ohne`), each with its class (`consultation`);
   *  `pending` while they are on their way (14.11.2026) — they come lazily,
   *  and an empty list before the answer would count as „none found". */
  laws?: readonly Pick<LawWithoutBegutachtung, 'consultation'>[] | 'pending'
  /**
   * The Länder's laws without a draft in the register that stand in the list: those that say „ohne Begutachtung" (Salzburg) join the Bund's
   * term — the same claim, wherever the law was made —, the rest are counted
   * as what they are, laws without an assigned draft, claiming nothing.
   * `{ pending }`, with the Länder they will bring, while they are on their
   * way (14.11.2026), as the Länder's drafts are.
   */
  landLaws?: readonly Pick<LandLaw, 'begutachtung' | 'registerCovers'>[] | { pending: readonly LandCode[] }
  /** The RIS half, counted per kind; `failed`, `pending` while it is on its
   *  way beside rows already shown (12.11.2026), or null where it is not
   *  asked for. */
  ris: Partial<Record<RisConsultationKind, number>> | 'failed' | 'pending' | null
  /** The Art filter: what an empty list or a failed half says. */
  art?: ArtFilter
  /** Only stations selected that a record without a Gegenstand cannot reach. */
  laterStationsOnly: boolean
  /** The chosen Länder's rows in the list, per kind; null where none is
   *  chosen or the view cannot carry them (`LandChips`); `{ pending }`, with
   *  the Länder it will bring, while their half is on its way (12.11.2026). */
  laender?: Partial<Record<RisConsultationKind, number>> | { pending: readonly LandCode[] } | null
  /** The Initiativanträge in the list under „Alle Initiativanträge"; `pending`
   *  while on their way, `failed` where the fetch failed — said, never
   *  counted. Undefined under every other option. */
  antraege?: number | 'pending' | 'failed'
  /** The treaties under „Staatsverträge", in the same three shapes. */
  treaties?: number | 'pending' | 'failed'
}): string {
  const art = c.art ?? ''
  /* Under a station filter the RIS half does not count — neither as rows
   * nor as „gerade nicht abrufbar". Both would answer a question nobody
   * asked: it is neither empty nor broken, it does not belong to this axis.
   * The sentence above the list says why. The Länder do count there:
   * Oberösterreich's drafts reach the later stations (22.10.2026). */
  const ris = c.laterStationsOnly ? null : c.ris
  const kinds: Partial<Record<RisConsultationKind, number>> = {}
  const add = (kind: RisConsultationKind, n: number) => { kinds[kind] = (kinds[kind] ?? 0) + n }
  if (c.me !== null) add('gesetz', c.me)
  if (ris && ris !== 'failed' && ris !== 'pending') for (const kind of KIND_ORDER) add(kind, ris[kind] ?? 0)
  const laenderPending = c.laender && 'pending' in c.laender ? c.laender.pending : null
  if (c.laender && !laenderPending) {
    const laender = c.laender as Partial<Record<RisConsultationKind, number>>
    for (const kind of KIND_ORDER) add(kind, laender[kind] ?? 0)
  }

  const parts = KIND_ORDER
    .filter((kind) => (kinds[kind] ?? 0) > 0)
    .map((kind) => countLabelDe(kinds[kind]!, ...KIND_TERM[kind]))
  /* A third term, never added up: a Regierungsvorlage without a
   * Begutachtung is no draft in Begutachtung — folding it into the law
   * drafts would claim about it what holds for them. */
  /* The addition „ohne Begutachtung" only where it is evidenced for EVERY
   * counted row. It is the aggregate form of the statement that stands in the
   * row, so it must not reach further either: as soon as one Vorlage is in
   * whose history is merely unevidenced (`unknown`), the number counts rows
   * and claims nothing about them. */
  /* A Vorlage whose committee invited Stellungnahmen (10.11.2026) is
   * counted in a term of its own: „ohne Begutachtung" would be false about
   * it, and the two are never added up. */
  /* A committee's motion in the second round (14.11.2026) is counted as
   * what it is, by the same two rules, never added to the Vorlagen. */
  const open = typeof c.vorlagen === 'string' ? [] : c.vorlagen
  const openTerms: [OpenVorlage['kind'], string, string][] = [
    ['regierungsvorlage', 'Regierungsvorlage', 'Regierungsvorlagen'],
    ['ausschussantrag', 'Ausschussantrag', 'Ausschussanträge'],
  ]
  for (const [kind, one, many] of openTerms) {
    const vorlagen = open.filter((v) => (v.kind ?? 'regierungsvorlage') === kind)
    const committeeVorlagen = vorlagen.filter((v) => v.consultation.kind === 'committee').length
    const otherVorlagen = vorlagen.filter((v) => v.consultation.kind !== 'committee')
    if (otherVorlagen.length) {
      const count = countLabelDe(otherVorlagen.length, one, many)
      const allChecked = otherVorlagen.every((v) => v.consultation.kind === 'none')
      parts.push(allChecked ? `${count} ohne Begutachtung` : count)
    }
    if (committeeVorlagen) parts.push(`${countLabelDe(committeeVorlagen, one, many)} mit Ausschussbegutachtung`)
  }
  /* The enacted laws, in the same two terms, never added up: an enacted law
   * is no draft, and only a law whose every check ran stands in the list —
   * so each addition holds for every row it counts by construction. */
  const lawsPending = c.laws === 'pending'
  const laws = lawsPending ? undefined : c.laws as Exclude<typeof c.laws, 'pending'>
  const landLawsPending = c.landLaws && 'pending' in c.landLaws ? c.landLaws.pending : null
  const landLaws = landLawsPending ? undefined : c.landLaws as Exclude<typeof c.landLaws, { pending: readonly LandCode[] }>
  const landNone = landLaws?.filter((l) => l.begutachtung.kind === 'none').length ?? 0
  /* Where the register does not reach back, „ohne zugeordneten Entwurf"
   * would say what nobody can see: a plain count of its own, never added
   * to the other (second round, 10.11.2026). */
  const landPlain = landLaws?.filter((l) => l.begutachtung.kind !== 'none' && l.registerCovers !== true).length ?? 0
  const landOther = (landLaws?.length ?? 0) - landNone - landPlain
  const lawsNone = (laws?.filter((l) => l.consultation === 'none').length ?? 0) + landNone
  const lawsCommittee = laws?.filter((l) => l.consultation === 'committee').length ?? 0
  if (lawsNone) parts.push(`${countLabelDe(lawsNone, 'Gesetz', 'Gesetze')} ohne Begutachtung`)
  if (lawsCommittee) parts.push(`${countLabelDe(lawsCommittee, 'Gesetz', 'Gesetze')} mit Ausschussbegutachtung`)
  if (landOther) parts.push(`${countLabelDe(landOther, 'Landesgesetz', 'Landesgesetze')} ohne zugeordneten Entwurf`)
  if (landPlain) parts.push(countLabelDe(landPlain, 'Landesgesetz', 'Landesgesetze'))
  /* A term of their own, never added to the drafts: an Initiativantrag is
   * no draft in Begutachtung (14.11.2026). */
  if (typeof c.antraege === 'number' && c.antraege > 0) parts.push(countLabelDe(c.antraege, 'Initiativantrag', 'Initiativanträge'))
  if (typeof c.treaties === 'number' && c.treaties > 0) parts.push(countLabelDe(c.treaties, 'Staatsvertrag', 'Staatsverträge'))
  /* Something was asked for and nothing came: one zero, in the Art's noun. */
  const asked = c.me !== null || ris !== null || (c.laender !== null && c.laender !== undefined) || c.laws !== undefined || c.landLaws !== undefined || c.antraege !== undefined || c.treaties !== undefined
  /* No zero while a half is on its way (12.11.2026): „0 Entwürfe" is a
   * claim about the whole list, and the late half may falsify it a second
   * later. The pending term then stands alone. */
  const pending = ris === 'pending' || !!laenderPending || lawsPending || !!landLawsPending || c.vorlagen === 'pending' || c.antraege === 'pending' || c.treaties === 'pending'
  if (!parts.length && asked && !pending) parts.push(EMPTY_TERM[art])
  const counted = parts.length
  /* `failed` only reaches this line while another source is asked for too.
   * Where the RIS half carries the page alone, its failure is the page's
   * failure and the gate says so. The sum stands without it, and this term
   * says it is short. */
  if (ris === 'failed') parts.push(RIS_FAILED[art])
  if (c.vorlagen === 'failed') parts.push(VORLAGEN_FAILED)
  if (c.antraege === 'failed') parts.push(ANTRAEGE_FAILED)
  if (c.treaties === 'failed') parts.push(TREATIES_FAILED)
  /* `pending` likewise, in the same place and register (12.11.2026): the
   * counts before it are those of the rows already in the list, and this
   * term says the sum is not complete yet — the reader tells „noch geladen"
   * from „nicht abrufbar" by the words. */
  if (ris === 'pending') parts.push(RIS_PENDING[art])
  /* The laws likewise (14.11.2026). A Land whose drafts and laws are both
   * on their way is named once, with both nouns. */
  const together = laenderPending && landLawsPending && sameLands(laenderPending, landLawsPending)
  if (c.vorlagen === 'pending') parts.push(VORLAGEN_PENDING)
  if (lawsPending) parts.push(LAWS_PENDING)
  if (c.antraege === 'pending') parts.push(ANTRAEGE_PENDING)
  if (c.treaties === 'pending') parts.push(TREATIES_PENDING)
  if (laenderPending) parts.push(laenderPendingTerm(laenderPending, together ? 'Entwürfe und Gesetze' : 'Entwürfe'))
  if (landLawsPending && !together) parts.push(laenderPendingTerm(landLawsPending, 'Gesetze'))
  const label = parts.join(' · ')
  /* Nothing counted before it: the term opens the line, as a sentence. */
  return counted ? label : label.charAt(0).toUpperCase() + label.slice(1)
}

/* ------------------------------------------------------------------ *
 * The chip „Ohne Entwurf"
 * ------------------------------------------------------------------ */

/** Why the period in view carries no such rows — the chip's reason (`ToggleChip`). */
const BEGUTACHTUNG_GAP_REASON: Record<LawsWithoutBegutachtungGap, string> = {
  unlinked: 'Für diese Gesetzgebungsperiode ist nicht erfasst, welche Gesetze auf einen Ministerialentwurf zurückgehen',
  unread: 'Gerade nicht abrufbar',
  pending: 'Die Daten werden gerade eingelesen – gleich verfügbar',
}

export function begutachtungGapReason(gap: LawsWithoutBegutachtungGap | null | undefined): string | null {
  return gap ? BEGUTACHTUNG_GAP_REASON[gap] : null
}

/* ------------------------------------------------------------------ *
 * The list's state notes that name Länder (14.11.2026)
 *
 * One sentence each, saying only what is true of the list now and differs
 * from what its controls claim (docs/decisions.md, „The list's notes").
 * ------------------------------------------------------------------ */

/** A Land as the list's sentences name it: Wien in a genitive of its own. */
function landGenitiveDe(lands: readonly LandCode[]): string {
  if (lands.length === 1) return lands[0] === 'w' ? 'Wiens' : `des Landes ${LAND_NAME[lands[0]!]}`
  return `der Länder ${listDe(lands.map((land) => LAND_NAME[land]))}`
}

/**
 * Under „Alle ohne Entwurf" and its two items: the chosen Länder whose
 * sources cannot say whether a law had a draft (all but Salzburg) — their
 * laws are not in the list, and the line says so instead of letting them
 * vanish. Null where there is none.
 */
export function ohneSilentNoteDe(lands: readonly LandCode[]): string | null {
  if (!lands.length) return null
  return `Ob ein Landesgesetz ohne Entwurf entstand, lässt sich ${lands.length === 1 ? 'für' : 'für die Länder'} ${listDe(lands.map((land) => LAND_NAME[land]))} nicht feststellen; ${lands.length === 1 ? 'seine' : 'ihre'} Landesgesetze stehen hier nicht.`
}

/**
 * Under „Landesgesetze ohne zugeordneten Entwurf": the laws left out because
 * the register does not reach back far enough to rule a draft out, per Land.
 * Null where none is.
 */
export function registerReachNote(counts: Partial<Record<LandCode, number>>): string | null {
  const lands = (Object.keys(counts) as LandCode[]).filter((land) => (counts[land] ?? 0) > 0)
  if (!lands.length) return null
  const n = lands.reduce((sum, land) => sum + counts[land]!, 0)
  return `${countLabelDe(n, 'Landesgesetz', 'Landesgesetze')} ${landGenitiveDe(lands)} ${n === 1 ? 'steht' : 'stehen'} hier nicht: Das Register reicht nicht weit genug zurück, um einen Entwurf auszuschließen.`
}

/** One piece of the coverage line: plain text, or a Land linked to its block on /datenlage. */
export type CoverageNotePart = { text: string; href?: string }

/**
 * What each homepage list holds of the Länder (14.11.2026): the steps of
 * /datenlage (`DATENLAGE_SOURCES`) a Land's row needs to reach that list,
 * and the states under which the Land gives it every such row. Only the
 * lists a Land can feed at all: the second round and the ranking take no
 * Länder rows, and their chips say so for every Land (`RV_UNAVAILABLE`,
 * `RANKED_UNAVAILABLE` on the homepage).
 *
 *  - `laufend` („Jetzt in Begutachtung"): the drafts a Land lists while
 *    their Begutachtung runs — every Land lists its running
 *    Gesetzesentwürfe, so only the Verordnungsentwürfe decide. `partial`
 *    counts as whole HERE: both partial cells (Oberösterreich „kein
 *    Beginn", Tirol „ohne Fristfeld") lack a date, not a running draft,
 *    which stands as long as it is listed (`withLandActiveOn`).
 *  - `beschlossen` („Beschlossen, noch nicht kundgemacht"): Landtag
 *    decisions on a Gesetzesentwurf — the draft must still be held after its
 *    Frist (`archive`) and its way through the Landtag read (`way`).
 *  - `kundgemacht` („Zuletzt Gesetz geworden"): drafts of either kind that
 *    became law — Verordnungsentwürfe read, the draft still held, the
 *    Kundmachung found (`kundmachung`; `inferred` is our finding, and counts).
 *
 * Every other state — partial, not published, (partly) not read, not
 * surveyed — is a gap: the list never claims more than the data shows.
 */
export type HomeListScope = 'laufend' | 'beschlossen' | 'kundgemacht'
const HOME_LIST_STEPS: Record<HomeListScope, { steps: readonly CoverageRow[]; whole: readonly DatenlageState[] }> = {
  laufend: { steps: ['verordnungen'], whole: ['published', 'inferred', 'partial'] },
  beschlossen: { steps: ['archive', 'way'], whole: ['published', 'inferred'] },
  kundgemacht: { steps: ['verordnungen', 'archive', 'kundmachung'], whole: ['published', 'inferred'] },
}

/** The given Länder that do not give this homepage list every row it could hold, in their order. */
export function landsIncompleteFor(lands: readonly LandCode[], list: HomeListScope): LandCode[] {
  const { steps, whole } = HOME_LIST_STEPS[list]
  return lands.filter((land) => {
    const cells = DATENLAGE_SOURCES.find((s) => s.key === land)!.cells
    return steps.some((step) => !whole.includes(cells[step].state))
  })
}

/**
 * The applying Länder that a list does not hold in full, as one line: each
 * named and linked to its block on /datenlage (`/datenlage#tirol` — the
 * default view is by source, which carries the anchors). Null with only
 * complete Länder. Shown by `LandCoverageNote` on both pages.
 *
 * `where`: `list`, the one list of `/entwuerfe`, judged by the Land's
 * general `complete` (`LAND_COVERAGE`) — that list holds every station and
 * every period, so a gap anywhere is a gap in it; or one homepage list,
 * judged per list (`landsIncompleteFor`). Kärnten's live count of undated
 * drafts only on `/entwuerfe`, where they would stand: they have no period,
 * and only that list is cut by one (the homepage has no count either — it
 * asks the Länder without a period).
 */
export type CoverageNoteScope = 'list' | HomeListScope
export function landCoverageNote(lands: readonly LandCode[], undatedKtn?: number, where: CoverageNoteScope = 'list'): CoverageNotePart[] | null {
  const incomplete = where === 'list' ? lands.filter((land) => !LAND_COVERAGE[land].complete) : landsIncompleteFor(lands, where)
  if (!incomplete.length) return null
  const parts: CoverageNotePart[] = [{ text: where === 'list' ? 'Nicht vollständig in der Liste: ' : 'Nicht vollständig in dieser Liste: ' }]
  incomplete.forEach((land, i) => {
    if (i > 0) parts.push({ text: i === incomplete.length - 1 ? ' und ' : ', ' })
    parts.push({ text: LAND_NAME[land], href: `/datenlage#${LAND_SLUG[land]}` })
    if (where === 'list' && land === 'ktn' && undatedKtn) {
      parts.push({ text: ` (${formatNumberDe(undatedKtn)} ${undatedKtn === 1 ? 'Entwurf ohne Datum steht' : 'Entwürfe ohne Datum stehen'} in keinem Zeitraum)` })
    }
  })
  parts.push({ text: '.' })
  return parts
}

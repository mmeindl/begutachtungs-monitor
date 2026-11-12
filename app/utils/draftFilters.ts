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
import type { DraftStation, DraftStatus, DraftsResponse, DraftSummary, LandCode, LandLaw, LawWithoutBegutachtung, LawsWithoutBegutachtungGap, OpenVorlage, RisConsultation, RisConsultationKind, RisConsultationsResponse } from '#shared/types'
import { searchDrafts, searchRis } from '#shared/utils/searchHaystack'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { countLabelDe } from '#shared/utils/format'
import { GP_STARTS, intToRoman, isPlausibleGp, romanToInt } from '#shared/utils/gp'
import { LAND_NAME } from '#shared/utils/laender'
import { firstQueryValue } from '#shared/utils/queryParams'

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
 * `verordnung`. The value also goes to `/api/ris-drafts?art=` unchanged —
 * the same words there (`useDraftHalves`).
 */
export type ArtFilter = '' | 'gesetz' | 'verordnung' | OhneArt

/**
 * The Art under the chip „Ohne Ministerialentwurf" (10.11.2026): the item a
 * row came to the Nationalrat as — a Regierungsvorlage or an Initiativantrag
 * (`item.kind`; an open Vorlage's row is a Regierungsvorlage). The same
 * parameter `art`, valid only together with `begutachtung=ohne`; the two
 * draft kinds are valid only without it (`coherentArt`).
 */
export type OhneArt = 'vorlage' | 'antrag'

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
  verordnung: '0 Verordnungsentwürfe',
  vorlage: '0 Regierungsvorlagen',
  antrag: '0 Initiativanträge',
}

/* The RIS half's failure, named by what it would have brought: the Bund's
 * Verordnungsentwürfe and the few law drafts that never reached
 * Parliament. */
const RIS_FAILED: Record<ArtFilter, string> = {
  '': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  gesetz: 'einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  verordnung: 'die Verordnungsentwürfe des Bundes sind gerade nicht abrufbar',
  // Under the chip the RIS half is not asked for (`draftKindArt`); the
  // sentence of „Alle Arten" stands in should it ever be.
  vorlage: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  antrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
}

/* The same half still on its way (12.11.2026): the failure's register, so
 * „noch geladen" and „nicht abrufbar" stand in the same place and differ
 * only in what they say (`HalfState`). */
const RIS_PENDING: Record<ArtFilter, string> = {
  '': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  gesetz: 'einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  verordnung: 'die Verordnungsentwürfe des Bundes werden noch geladen',
  vorlage: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
  antrag: 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes werden noch geladen',
}

/* The Länder's half on its way, named by the Länder it brings — Wien in
 * the genitive of its own, as the list's other Land sentences say it. */
function laenderPendingTerm(lands: readonly LandCode[]): string {
  if (lands.length !== 1) return 'die Entwürfe der Länder werden noch geladen'
  const land = lands[0]!
  return `die Entwürfe ${land === 'w' ? 'Wiens' : `des Landes ${LAND_NAME[land]}`} werden noch geladen`
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

export const ART_OPTIONS: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'gesetz', label: 'Gesetzesentwürfe' },
  { value: 'verordnung', label: 'Verordnungsentwürfe' },
]

/** The same select under the chip „Ohne Ministerialentwurf". */
export const OHNE_ART_OPTIONS: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'vorlage', label: 'Regierungsvorlagen' },
  { value: 'antrag', label: 'Initiativanträge' },
]

/** The select's options in the state the list is in. */
export function artOptionsFor(begutachtung: BegutachtungFilter): { value: ArtFilter; label: string }[] {
  return begutachtung === 'ohne' ? OHNE_ART_OPTIONS : ART_OPTIONS
}

/**
 * An Art the current state does not offer reads as „Alle Arten" — in both
 * directions: the chip turned on with `gesetz`/`verordnung`, turned off with
 * `vorlage`/`antrag`, or a link that pairs them wrongly. A leftover value
 * must never empty the list.
 */
export function coherentArt(art: ArtFilter, begutachtung: BegutachtungFilter): ArtFilter {
  return artOptionsFor(begutachtung).some((o) => o.value === art) ? art : ''
}

/** Why the Ressort select is unavailable under the chip (`coherentFilters`). */
export const OHNE_MINISTRY_REASON = 'Gesetze ohne Ministerialentwurf sind keinem Ressort zugeordnet'

/**
 * The one rule for what the chip „Ohne Ministerialentwurf" takes from the
 * other filters (10.11.2026): the Art it does not offer (`coherentArt`), and
 * the Ressort — its rows carry none, so a Ressort could only empty the list,
 * and a per-ministry filter over them would be the ranking by ministry this
 * product does not make. Only while the chip applies (`chipApplies`: on, and
 * not unavailable for the period or the sources); turning it off restores
 * nothing.
 */
export function coherentFilters<T extends { art: ArtFilter; ministry: string }>(
  f: T,
  begutachtung: BegutachtungFilter,
  chipApplies: boolean = begutachtung === 'ohne',
): T {
  return { ...f, art: coherentArt(f.art, begutachtung), ministry: begutachtung === 'ohne' && chipApplies ? '' : f.ministry }
}

/** The Art the draft halves are asked for: a draft kind, or none — the
 *  chip's two values are no instrument kind `/api/ris-drafts` knows. */
export function draftKindArt(art: ArtFilter): '' | 'gesetz' | 'verordnung' {
  return art === 'gesetz' || art === 'verordnung' ? art : ''
}

/** Whether a row under the chip, by the item it came as, passes the Art. */
export function ohneArtAllows(art: ArtFilter, kind: 'rv' | 'antrag'): boolean {
  if (art === 'vorlage') return kind === 'rv'
  if (art === 'antrag') return kind === 'antrag'
  return true
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
 * „Ohne Ministerialentwurf": the list shows only the
 * procedures without a Ministerialentwurf — the enacted laws of the period and the
 * open Vorlagen without a draft behind them. A chip, off by default and out
 * of the URL while off, like `EuFilter`: `?begutachtung=ohne`. Not passed
 * to the list endpoints — the page asks its own (`/api/ohne-begutachtung`)
 * and steps the other halves back, as `art` decides which halves are asked.
 */
export type BegutachtungFilter = '' | 'ohne'

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
  return s === 'gesetz' || s === 'verordnung' || s === 'vorlage' || s === 'antrag' ? s : ''
}

function parseEu(v: unknown): EuFilter {
  return firstQueryValue(v) === 'umsetzung' ? 'umsetzung' : ''
}

function parseBegutachtung(v: unknown): BegutachtungFilter {
  return firstQueryValue(v) === 'ohne' ? 'ohne' : ''
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

export function draftFiltersFromQuery(query: Record<string, unknown>): DraftFilterValues {
  const begutachtung = parseBegutachtung(query.begutachtung)
  return {
    status: parseStatus(query.status),
    stations: parseStations(query.station),
    art: coherentArt(parseArt(query.art), begutachtung),
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
  if (f.ministry) query.ministry = f.ministry
  if (f.q) query.q = f.q
  if (f.sort !== 'frist') query.sort = f.sort
  if (f.reversed) query.reverse = '1'
  if (f.eu) query.eu = f.eu
  if (f.begutachtung) query.begutachtung = f.begutachtung
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

export type FilterChipKey = 'status' | 'art' | 'gp' | 'ministry'

/**
 * The closed panel's values, each as a chip that removes it. Data, not
 * closures: what a press resets is the page's (it owns the refs).
 *
 * `status` appears only for an old `?status=closed` link — „Nicht möglich"
 * left the controls on 02.10.2026 and survives as this chip.
 */
export function activeFilterChips(
  f: Pick<DraftFilterValues, 'status' | 'art' | 'gp' | 'ministry'>,
): { key: FilterChipKey; label: string }[] {
  const out: { key: FilterChipKey; label: string }[] = []
  if (f.status === 'closed') out.push({ key: 'status', label: 'Nicht möglich' })
  if (f.art) out.push({ key: 'art', label: [...ART_OPTIONS, ...OHNE_ART_OPTIONS].find((o) => o.value === f.art)?.label ?? f.art })
  if (f.gp) out.push({ key: 'gp', label: `GP ${f.gp}` })
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
  /** The Regierungsvorlagen without a draft that stand in the list. */
  vorlagen: readonly Pick<OpenVorlage, 'consultation'>[]
  /** The enacted laws without a Ministerialentwurf that stand in the list
   *  (`?begutachtung=ohne`), each with its class (`consultation`). */
  laws?: readonly Pick<LawWithoutBegutachtung, 'consultation'>[]
  /**
   * The Länder's laws without a draft in the register that stand in the list: those that say „ohne Begutachtung" (Salzburg) join the Bund's
   * term — the same claim, wherever the law was made —, the rest are counted
   * as what they are, laws without an assigned draft, claiming nothing.
   */
  landLaws?: readonly Pick<LandLaw, 'begutachtung' | 'registerCovers'>[]
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
  const committeeVorlagen = c.vorlagen.filter((v) => v.consultation.kind === 'committee').length
  const otherVorlagen = c.vorlagen.filter((v) => v.consultation.kind !== 'committee')
  if (otherVorlagen.length) {
    const count = countLabelDe(otherVorlagen.length, 'Regierungsvorlage', 'Regierungsvorlagen')
    const allChecked = otherVorlagen.every((v) => v.consultation.kind === 'none')
    parts.push(allChecked ? `${count} ohne Begutachtung` : count)
  }
  if (committeeVorlagen) parts.push(`${countLabelDe(committeeVorlagen, 'Regierungsvorlage', 'Regierungsvorlagen')} mit Ausschussbegutachtung`)
  /* The enacted laws, in the same two terms, never added up: an enacted law
   * is no draft, and only a law whose every check ran stands in the list —
   * so each addition holds for every row it counts by construction. */
  const landNone = c.landLaws?.filter((l) => l.begutachtung.kind === 'none').length ?? 0
  /* Where the register does not reach back, „ohne zugeordneten Entwurf"
   * would say what nobody can see: a plain count of its own, never added
   * to the other (second round, 10.11.2026). */
  const landPlain = c.landLaws?.filter((l) => l.begutachtung.kind !== 'none' && l.registerCovers !== true).length ?? 0
  const landOther = (c.landLaws?.length ?? 0) - landNone - landPlain
  const lawsNone = (c.laws?.filter((l) => l.consultation === 'none').length ?? 0) + landNone
  const lawsCommittee = c.laws?.filter((l) => l.consultation === 'committee').length ?? 0
  if (lawsNone) parts.push(`${countLabelDe(lawsNone, 'Gesetz', 'Gesetze')} ohne Begutachtung`)
  if (lawsCommittee) parts.push(`${countLabelDe(lawsCommittee, 'Gesetz', 'Gesetze')} mit Ausschussbegutachtung`)
  if (landOther) parts.push(`${countLabelDe(landOther, 'Landesgesetz', 'Landesgesetze')} ohne zugeordneten Entwurf`)
  if (landPlain) parts.push(countLabelDe(landPlain, 'Landesgesetz', 'Landesgesetze'))
  /* Something was asked for and nothing came: one zero, in the Art's noun. */
  const asked = c.me !== null || ris !== null || (c.laender !== null && c.laender !== undefined) || c.laws !== undefined || c.landLaws !== undefined
  /* No zero while a half is on its way (12.11.2026): „0 Entwürfe" is a
   * claim about the whole list, and the late half may falsify it a second
   * later. The pending term then stands alone. */
  const pending = ris === 'pending' || !!laenderPending
  if (!parts.length && asked && !pending) parts.push(EMPTY_TERM[art])
  const counted = parts.length
  /* `failed` only reaches this line while another source is asked for too.
   * Where the RIS half carries the page alone, its failure is the page's
   * failure and the gate says so. The sum stands without it, and this term
   * says it is short. */
  if (ris === 'failed') parts.push(RIS_FAILED[art])
  /* `pending` likewise, in the same place and register (12.11.2026): the
   * counts before it are those of the rows already in the list, and this
   * term says the sum is not complete yet — the reader tells „noch geladen"
   * from „nicht abrufbar" by the words. */
  if (ris === 'pending') parts.push(RIS_PENDING[art])
  if (laenderPending) parts.push(laenderPendingTerm(laenderPending))
  const label = parts.join(' · ')
  /* Nothing counted before it: the term opens the line, as a sentence. */
  return counted ? label : label.charAt(0).toUpperCase() + label.slice(1)
}

/* ------------------------------------------------------------------ *
 * The chip „Ohne Ministerialentwurf"
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

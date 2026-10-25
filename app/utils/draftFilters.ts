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
import type { DraftStation, DraftStatus, OpenVorlage, RisConsultationKind } from '#shared/types'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { countLabelDe } from '#shared/utils/format'
import { GP_STARTS, intToRoman, isPlausibleGp, romanToInt } from '#shared/utils/gp'
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
export type ArtFilter = '' | 'gesetz' | 'verordnung'

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
}

/* The RIS half's failure, named by what it would have brought: the Bund's
 * Verordnungsentwürfe and the few law drafts that never reached
 * Parliament. */
const RIS_FAILED: Record<ArtFilter, string> = {
  '': 'die Verordnungs- und einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  gesetz: 'einzelne Gesetzesentwürfe des Bundes sind gerade nicht abrufbar',
  verordnung: 'die Verordnungsentwürfe des Bundes sind gerade nicht abrufbar',
}

export const ART_OPTIONS: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'gesetz', label: 'Gesetzesentwürfe' },
  { value: 'verordnung', label: 'Verordnungsentwürfe' },
]

/**
 * Two orders since 02.10.2026, each a column of the list. „Zuletzt
 * dazugekommen" (`neu`) and the title order that replaced it for a day
 * (`titel`) went; old links with either open the default order, like any
 * key nothing matches.
 */
export type SortKey = 'frist' | 'stellungnahmen'

/** What the two list endpoints are asked for. `art` is not among them: it
 *  selects the half, so the page leaves the excluded endpoint unasked
 *  instead of passing the value on. (`/api/ris-drafts` does take an `art`,
 *  but it means the instrument kind — a different vocabulary.) */
export interface DraftQueryFilters {
  status: DraftStatus
  stations: DraftStation[]
  gp: string
  ministry: string
  /** The debounced term, already trimmed. */
  q: string
}

export interface DraftFilterValues extends DraftQueryFilters {
  art: ArtFilter
  sort: SortKey
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
  return s === 'gesetz' || s === 'verordnung' ? s : ''
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
  return {
    status: parseStatus(query.status),
    stations: parseStations(query.station),
    art: parseArt(query.art),
    gp: parseGp(query.gp),
    ministry: firstQueryValue(query.ministry) ?? '',
    q: firstQueryValue(query.q) ?? '',
    sort: parseSort(query.sort),
  }
}

export function draftApiQuery(f: DraftQueryFilters): {
  status: DraftStatus
  station: string | undefined
  gp: string | undefined
  ministry: string | undefined
  q: string | undefined
} {
  return {
    status: f.status,
    station: f.stations.length ? f.stations.join(',') : undefined,
    gp: f.gp || undefined,
    ministry: f.ministry || undefined,
    q: f.q || undefined,
  }
}

/** Defaults stay out of the URL, so the canonical address of the list is bare. */
export function draftUrlQuery(f: DraftFilterValues): Record<string, string> {
  const query: Record<string, string> = {}
  if (f.status !== 'all') query.status = f.status
  if (f.stations.length) query.station = f.stations.join(',')
  if (f.art) query.art = f.art
  if (f.gp) query.gp = f.gp
  if (f.ministry) query.ministry = f.ministry
  if (f.q) query.q = f.q
  if (f.sort !== 'frist') query.sort = f.sort
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
  if (f.art) out.push({ key: 'art', label: ART_OPTIONS.find((o) => o.value === f.art)?.label ?? f.art })
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
 * rule of §12.19 is not touched by the sum: it forbids pooling figures only
 * one half carries (the Stellungnahmen), and a count of law drafts is a
 * count of law drafts wherever they were published.
 */
export function draftCountLabel(c: {
  /** Ministerialentwürfe — law drafts all (148 of 148 in GP XXVIII); null
   *  where the half is not asked for. */
  me: number | null
  /** The Regierungsvorlagen without a draft that stand in the list. */
  vorlagen: readonly Pick<OpenVorlage, 'consultation'>[]
  /** The RIS half, counted per kind; `failed`, or null where it is not
   *  asked for. */
  ris: Partial<Record<RisConsultationKind, number>> | 'failed' | null
  /** The Art filter: what an empty list or a failed half says. */
  art?: ArtFilter
  /** Only stations selected that a record without a Gegenstand cannot reach. */
  laterStationsOnly: boolean
  /** The chosen Länder's rows in the list, per kind; null where none is
   *  chosen or the view cannot carry them (`LandChips`). */
  laender?: Partial<Record<RisConsultationKind, number>> | null
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
  if (ris && ris !== 'failed') for (const kind of KIND_ORDER) add(kind, ris[kind] ?? 0)
  if (c.laender) for (const kind of KIND_ORDER) add(kind, c.laender[kind] ?? 0)

  const parts = KIND_ORDER
    .filter((kind) => (kinds[kind] ?? 0) > 0)
    .map((kind) => countLabelDe(kinds[kind]!, ...KIND_TERM[kind]))
  /* A third term, never added up (§12.19): a Regierungsvorlage without a
   * Begutachtung is no draft in Begutachtung — folding it into the law
   * drafts would claim about it what holds for them. */
  /* The addition „ohne Begutachtung" only where it is evidenced for EVERY
   * counted row. It is the aggregate form of the statement that stands in the
   * row, so it must not reach further either: as soon as one Vorlage is in
   * whose history is merely unevidenced (`unknown`), the number counts rows
   * and claims nothing about them. */
  if (c.vorlagen.length) {
    const count = countLabelDe(c.vorlagen.length, 'Regierungsvorlage', 'Regierungsvorlagen')
    const allChecked = c.vorlagen.every((v) => v.consultation.kind === 'none')
    parts.push(allChecked ? `${count} ohne Begutachtung` : count)
  }
  /* Something was asked for and nothing came: one zero, in the Art's noun. */
  const asked = c.me !== null || ris !== null || (c.laender !== null && c.laender !== undefined)
  if (!parts.length && asked) parts.push(EMPTY_TERM[art])
  /* `failed` only reaches this line while another source is asked for too.
   * Where the RIS half carries the page alone, its failure is the page's
   * failure and the gate says so. The sum stands without it, and this term
   * says it is short. */
  if (ris === 'failed') parts.push(RIS_FAILED[art])
  return parts.join(' · ')
}

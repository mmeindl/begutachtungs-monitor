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
import type { DraftStation, DraftStatus, OpenVorlage } from '#shared/types'
import { DRAFT_STATION_LABEL, DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { countLabelDe, formatNumberDe } from '#shared/utils/format'
import { romanToInt } from '#shared/utils/gp'
import { firstQueryValue } from '#shared/utils/queryParams'

/**
 * Filter by WHERE a draft stands in the procedure, not by the type word on
 * its title — that is the distinction the two halves actually differ in, and
 * the only one the data supports without a classifier. `verordnung` is
 * spelled the way a reader would type it, and `/weitere-entwuerfe` redirects
 * onto it.
 *
 * It is therefore the one filter that names a HALF rather than narrowing a
 * list, which is why it is no part of `draftApiQuery`: the page decides by it
 * which of the two endpoints is asked at all.
 */
export type ArtFilter = '' | 'ministerialentwurf' | 'verordnung'

/**
 * `verordnung` therefore selects all 201 records without a Gegenstand, of
 * which 198 are Verordnungen and the rest are drafts that likewise never
 * reached Parliament. The label admits that rather than pretending, and
 * each row carries its own type word.
 *
 * ONE noun, used by the option and by the count line under the filters
 * (`draftCountLabel`). They named the same set two ways until 18.09.2026 —
 * „Verordnungsentwürfe u. a." here, „ohne Gegenstand im Parlament" there —
 * and a reader comparing the two had no way to know it was one set. Written
 * out rather than „u. a.", which a screen reader reads as „u a".
 */
export const ART_VERORDNUNG_NOUN = 'Verordnungsentwürfe und andere'

export const ART_OPTIONS: { value: ArtFilter; label: string }[] = [
  { value: '', label: 'Alle Arten' },
  { value: 'ministerialentwurf', label: 'Ministerialentwürfe' },
  { value: 'verordnung', label: ART_VERORDNUNG_NOUN },
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
  return s === 'ministerialentwurf' || s === 'verordnung' ? s : ''
}

function parseSort(v: unknown): SortKey {
  const s = firstQueryValue(v)
  return s === 'stellungnahmen' ? s : 'frist'
}

export function draftFiltersFromQuery(query: Record<string, unknown>): DraftFilterValues {
  return {
    status: parseStatus(query.status),
    stations: parseStations(query.station),
    art: parseArt(query.art),
    gp: firstQueryValue(query.gp) ?? '',
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
 * The count line: each kind counted on its own, never summed
 * (docs/architecture.md §12.19).
 *
 * A single "336 Entwürfe" would put the Stellungnahmen figures of a third of
 * the rows over all of them. The search placeholder does name the total,
 * because there it is a statement about the search scope rather than about
 * the corpus.
 */
export function draftCountLabel(c: {
  /** Ministerialentwürfe; null where the half is not asked for. */
  me: number | null
  /** The Regierungsvorlagen without a draft that stand in the list. */
  vorlagen: readonly Pick<OpenVorlage, 'consultation'>[]
  /** The other half: its total, `failed`, or null where it is not asked for. */
  ris: number | 'failed' | null
  /** Only stations selected that a record without a Gegenstand cannot reach. */
  laterStationsOnly: boolean
}): string {
  const parts: string[] = []
  if (c.me !== null) {
    parts.push(countLabelDe(c.me, 'Ministerialentwurf', 'Ministerialentwürfe'))
  }
  /* A third term, never added up (§12.19): a Regierungsvorlage without a
   * Begutachtung is neither a Ministerialentwurf nor a Verordnungsentwurf —
   * folding it into either number would claim about it what holds for the
   * other half. Before the station-filter exit, because these rows do come
   * along under „Regierungsvorlage". */
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
  /* Under a station filter the Verordnung half does not count — neither as
   * „0" nor as „gerade nicht abrufbar". Both would answer a question nobody
   * asked: it is neither empty nor broken, it does not belong to this axis.
   * The sentence above the list says why. */
  if (c.laterStationsOnly) return parts.join(' · ')
  /* The same noun as in the Art filter, so the two numbers on the page
   * cannot count two different things. „ohne Gegenstand im Parlament" was
   * Parliament's category, not this list's — and it stood beside a box
   * carrying a join statistic under the same word. */
  /* `failed` only reaches this line while both halves are asked for. Where
   * the RIS half carries the page alone, its failure is the page's failure
   * and the gate says so. */
  if (c.ris !== null) {
    parts.push(
      c.ris === 'failed'
        ? 'die Verordnungsentwürfe sind gerade nicht abrufbar'
        : `${formatNumberDe(c.ris)} ${ART_VERORDNUNG_NOUN}`,
    )
  }
  return parts.join(' · ')
}

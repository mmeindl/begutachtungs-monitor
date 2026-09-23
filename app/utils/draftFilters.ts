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
import type { DraftStation, DraftStatus } from '#shared/types'
import { DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
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
  return firstQueryValue(v) === 'stellungnahmen' ? 'stellungnahmen' : 'frist'
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

/**
 * What a handler reads out of a request (docs/architecture.md §5): gp =
 * Roman numerals, inr = positive integer, otherwise 400.
 *
 * **The rule on a malformed id, stated once for all of them:** an API
 * endpoint answers 400, because the caller built the request and a machine
 * reads the answer. A page route answers 404, because a reader followed a
 * URL that names nothing — a 400 would tell them about our parser instead
 * of about the page. Same regex, two answers, and the difference is who is
 * being addressed.
 */
import type { H3Event } from 'h3'
import type { DraftStation, DraftStatus, LawStationId } from '#shared/types'
import { DRAFT_STATION_ORDER } from '#shared/utils/draftStations'
import { GP_RE, INR_RE } from '#shared/utils/gp'
import {
  DEFAULT_LAW_STATION_PAIR,
  LAW_STATION_ORDER,
  defaultFromFor,
  isLawStationId,
  isLawStationPair,
} from '#shared/utils/lawStations'
import { RIS_ID_RE } from '#shared/utils/risConsultations'
import { firstQueryValue } from '#shared/utils/queryParams'

const INVALID_GP = 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)'
const STATUS_VALUES: DraftStatus[] = ['open', 'closed', 'all']

export function validateGpInrParams(event: H3Event): { gp: string; inr: number } {
  const gpRaw = (getRouterParam(event, 'gp') ?? '').toUpperCase()
  if (!GP_RE.test(gpRaw)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Gesetzgebungsperiode (römische Ziffern erwartet)',
    })
  }
  const inrRaw = getRouterParam(event, 'inr') ?? ''
  if (!INR_RE.test(inrRaw) || Number(inrRaw) < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültige Gegenstandsnummer (positive Ganzzahl erwartet)',
    })
  }
  return { gp: gpRaw, inr: Number(inrRaw) }
}

/**
 * `?von=…&bis=…` → the pair of stations to compare
 * (docs/architecture.md §12.18). Shared by the comparison and the § title
 * lookup, which must always answer about the same two texts.
 *
 * `bis` defaults to the Regierungsvorlage, the comparison this product is
 * about. `von` may be omitted and then follows the rule that keeps a
 * comparison attributable: the station right before `bis`, so each
 * difference belongs to one actor — the ministry after the Begutachtung, the
 * committee, the plenary. `?von=me&bis=plenum` stays a valid explicit choice
 * for the other question, whether the Begutachtungsergebnis survived to the
 * end.
 */
export function readLawStationPair(event: H3Event): { from: LawStationId; to: LawStationId } {
  const query = getQuery(event)
  const vocabulary = LAW_STATION_ORDER.join(', ')

  const bis = firstQueryValue(query.bis)
  if (bis !== undefined && !isLawStationId(bis)) {
    throw createError({ statusCode: 400, statusMessage: `Unbekannte Station für „bis“ (${vocabulary})` })
  }
  const to = bis ?? DEFAULT_LAW_STATION_PAIR.to

  const von = firstQueryValue(query.von)
  if (von !== undefined && !isLawStationId(von)) {
    throw createError({ statusCode: 400, statusMessage: `Unbekannte Station für „von“ (${vocabulary})` })
  }
  const from = von ?? defaultFromFor(to)

  // A flipped pair is not harmless input: the word diff calls one side
  // removed and the other inserted, so it would report every amendment
  // backwards instead of failing.
  //
  // Since the BGBl station there is a second reason to refuse a pair, and it
  // needs a sentence of its own: `plenum→bgbl` runs the right way round and
  // is still not a question — between the Beschluss and the Kundmachung no
  // actor changes the text (docs/architecture.md §12.33). The older reason
  // would simply be wrong there, and an error message that names the wrong
  // reason sends the reader searching in the wrong direction.
  if (!from) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Die Station für „von“ muss im Verfahren vor der für „bis“ liegen',
    })
  }
  if (from === 'plenum' && to === 'bgbl') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Zwischen Plenarfassung und Kundmachung ändert sich der Text nicht mehr',
    })
  }
  if (!isLawStationPair(from, to)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Die Station für „von“ muss im Verfahren vor der für „bis“ liegen',
    })
  }
  return { from, to }
}

/**
 * `:gp` as a route param, in the one spelling both routes that take it now
 * use — `aktuell` in any case means the running period.
 *
 * It comes back as `null` rather than resolved: `getCurrentGp()` is an
 * upstream call, and the caller decides where in its own sequence it pays
 * for that.
 */
export function readGpParam(event: H3Event, options: { defaultsToCurrent?: boolean } = {}): string | null {
  const raw = getRouterParam(event, 'gp') ?? (options.defaultsToCurrent ? 'aktuell' : '')
  if (raw.toUpperCase() === 'AKTUELL') return null
  const gp = raw.toUpperCase()
  if (!GP_RE.test(gp)) throw createError({ statusCode: 400, statusMessage: INVALID_GP })
  return gp
}

/** `:id` as a route param — the RIS document number of a Begutachtung. */
export function readRisId(event: H3Event, options: { notFoundOnInvalid?: boolean } = {}): string {
  const id = getRouterParam(event, 'id') ?? ''
  if (!RIS_ID_RE.test(id)) {
    throw options.notFoundOnInvalid
      ? createError({ statusCode: 404, statusMessage: 'Entwurf nicht gefunden' })
      : createError({ statusCode: 400, statusMessage: 'Ungültige RIS-Dokumentnummer' })
  }
  return id
}

/** The query vocabulary both list endpoints share, so the two halves of the list filter alike. */
export interface ListQuery {
  /** Already uppercased; `undefined` means "the current period". */
  gp: string | undefined
  status: DraftStatus
  /** Empty means "every station". */
  stations: DraftStation[]
  ministry: string | undefined
  /** Already lowercased, for `matchesQuery`. */
  q: string | undefined
}

/**
 * `?gp&status&station&ministry&q`, read the same way for `/api/drafts` and
 * `/api/ris-drafts` — the two halves of one list, so a query that narrows
 * one has to narrow the other identically.
 *
 * `art` is not here: it exists only on the RIS half, because only there
 * does the kind of instrument vary.
 */
export function readListQuery(event: H3Event): ListQuery {
  const query = getQuery(event)

  const gp = firstQueryValue(query.gp)?.toUpperCase()
  if (gp !== undefined && !GP_RE.test(gp)) {
    throw createError({ statusCode: 400, statusMessage: INVALID_GP })
  }

  const status = firstQueryValue(query.status) ?? 'all'
  if (!(STATUS_VALUES as readonly string[]).includes(status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ungültiger Status (open, closed oder all erwartet)',
    })
  }

  /* Empty value = no filter; unknown values are dropped instead of failing
   * the request: the station names travel in shared links, and a typo in one
   * should show a list, not an error. */
  const stations = (firstQueryValue(query.station) ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is DraftStation => (DRAFT_STATION_ORDER as readonly string[]).includes(v))

  return {
    gp,
    status: status as DraftStatus,
    stations,
    ministry: firstQueryValue(query.ministry)?.toUpperCase(),
    q: firstQueryValue(query.q)?.toLowerCase(),
  }
}

/**
 * The ministries of a period, for the filter menu — every one present in
 * the GP, never only those the active filters leave, so a narrowed list
 * cannot narrow its own menu.
 *
 * First name per code wins, like the Map it replaces: the code is the
 * identity, and a ministry renamed mid-period must not appear twice.
 *
 * A jointly issued draft contributes BOTH its ressorts (`coMinistries`):
 * without that, picking BMJ in the menu would silently drop 302/ME, which
 * the BMJ did send — the menu and the filter have to agree on what a Ressort
 * owns. `coMinistries` is optional here because the RIS half has no such
 * case: one record, one Stelle.
 */
export function ministryFilterOptions(
  items: readonly {
    ministryCode: string
    ministryName: string
    coMinistries?: readonly { code: string; name: string }[]
  }[],
): { code: string; name: string }[] {
  const byCode = new Map<string, string>()
  for (const item of items) {
    if (item.ministryCode && !byCode.has(item.ministryCode)) byCode.set(item.ministryCode, item.ministryName)
    for (const co of item.coMinistries ?? []) {
      if (co.code && !byCode.has(co.code)) byCode.set(co.code, co.name)
    }
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code, 'de-AT'))
}

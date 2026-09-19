/**
 * Param validation for the /api/drafts/:gp/:inr routes
 * (docs/architecture.md §5): gp = Roman numerals, inr = positive integer,
 * otherwise 400.
 */
import type { H3Event } from 'h3'
import type { LawStationId } from '#shared/types'
import { GP_RE, INR_RE } from '#shared/utils/gp'
import {
  DEFAULT_LAW_STATION_PAIR,
  LAW_STATION_ORDER,
  defaultFromFor,
  isLawStationId,
  isLawStationPair,
} from '#shared/utils/lawStations'

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
  // Seit der BGBl-Station gibt es einen zweiten Grund, ein Paar abzulehnen,
  // und er braucht einen eigenen Satz: `plenum→bgbl` liegt richtig herum und
  // ist trotzdem keine Frage — zwischen Beschluss und Kundmachung ändert kein
  // Akteur den Text (§12.33). Die alte Begründung wäre dort schlicht falsch,
  // und eine Fehlermeldung, die einen falschen Grund nennt, schickt den
  // Leser die falsche Richtung suchen.
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

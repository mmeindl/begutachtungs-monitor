/**
 * Param validation for the /api/consultations/:gp/:inr routes
 * (docs/architecture.md §5): gp = Roman numerals, inr = positive integer,
 * otherwise 400.
 */
import type { H3Event } from 'h3'
import { GP_RE, INR_RE } from '#shared/utils/gp'

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

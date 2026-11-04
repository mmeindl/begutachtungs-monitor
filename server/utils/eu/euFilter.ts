/**
 * The lists' EU filter (docs/architecture.md §12.66, Nachtrag 3): `?eu=`
 * has one value, `umsetzung` — the drafts whose fact says „Setzt EU-Recht
 * um", with or without the Vorblatt's „über die Umsetzung hinaus" (rule
 * D1: both put the same words on the page). Drafts that only accompany EU
 * law (`flankierend-*`) are not in it; the filter asks one question.
 *
 * PURE MODULE — type imports only.
 */
import type { EuMarker } from '../../../shared/types/eu'

/** The one value `?eu=` knows. */
export type EuFilter = 'umsetzung'

/** `?eu=` read: the one value, any other dropped silently, like an unknown station. */
export function readEuFilter(raw: string | undefined): EuFilter | undefined {
  return raw?.trim().toLowerCase() === 'umsetzung' ? 'umsetzung' : undefined
}

/** Whether a row's marker passes the filter. A row with no marker, or none read, does not. */
export function passesEuFilter(marker: EuMarker | null | undefined, filter: EuFilter): boolean {
  return filter === 'umsetzung' && (marker === 'umsetzung' || marker === 'ueber-umsetzung')
}

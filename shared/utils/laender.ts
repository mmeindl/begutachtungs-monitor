/**
 * The Länder the monitor reads, and the reader's choice among them
 * (22.10.2026).
 *
 * The choice is one value with two carriers: `?land=sbg,w` in the URL, so a
 * shared link shows the same list, and a cookie, so the server renders the
 * list already chosen and nothing jumps after hydration. The URL wins where
 * it is given.
 *
 * Pure module (auto-imported; vitest imports it relatively).
 */
import type { LandCode } from '../types'

/** Display order — the order the chips stand in: alphabetical, as the Länder are listed everywhere. */
export const LAND_CODES: readonly LandCode[] = ['ooe', 'sbg', 'w']

/** Austria has nine; the coverage line counts against this. */
export const LAENDER_TOTAL = 9

export const LAND_NAME: Record<LandCode, string> = {
  ooe: 'Oberösterreich',
  sbg: 'Salzburg',
  w: 'Wien',
}

/** The host a Land's documents come from, as the document list names it. */
export const LAND_HOST: Record<LandCode, string> = {
  ooe: 'land-oberoesterreich.gv.at',
  sbg: 'service.salzburg.gv.at',
  w: 'wien.gv.at',
}

/** The Land's path segment under `/entwuerfe/` — its name, as a reader types it. */
export const LAND_SLUG: Record<LandCode, string> = {
  ooe: 'oberoesterreich',
  sbg: 'salzburg',
  w: 'wien',
}

/** The monitor's page of a Land's draft, from its id (`sbg-35442`). */
export function landDraftPath(land: LandCode, id: string): string {
  return `/entwuerfe/${LAND_SLUG[land]}/${id.slice(id.indexOf('-') + 1)}`
}

/** The cookie that remembers the choice; functional, no consent needed. */
export const LAND_COOKIE = 'laender'

/** A year: a choice of Länder is not something one makes weekly. */
export const LAND_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

/**
 * `"sbg,w"` → the known codes in display order, unknown ones dropped. Null
 * for a missing value, so the caller can tell „not said" from „said: none"
 * (`?land=` empty is the reader turning every Land off).
 */
export function parseLandList(value: string | null | undefined): LandCode[] | null {
  if (value === null || value === undefined) return null
  const wanted = new Set(value.split(',').map((v) => v.trim().toLowerCase()))
  return LAND_CODES.filter((code) => wanted.has(code))
}

export function formatLandList(codes: readonly LandCode[]): string {
  return LAND_CODES.filter((code) => codes.includes(code)).join(',')
}

/** „Salzburg – 1 von 9 Ländern", the line that keeps the list from claiming more. */
export function landCoverageDe(): string {
  const names = LAND_CODES.map((code) => LAND_NAME[code])
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0]
  return `${list} – ${LAND_CODES.length} von ${LAENDER_TOTAL} Ländern`
}

/**
 * The short name a Land's title ends with, as the row's title: „Verordnung
 * der Salzburger Landesregierung, mit der pensionsrechtliche Bestimmungen
 * erlassen werden (Pensionsverordnung 2027)" → „Pensionsverordnung 2027".
 * The way RIS rows show their Kurztitel; the whole title stays on hover.
 * Null where the title names none — then it stands whole.
 */
export function landShortTitle(title: string): string | null {
  const name = /\(([^()]{4,80})\)\s*$/.exec(title)?.[1]?.trim()
  return name && /^\p{Lu}/u.test(name) && !/^Anlage\b/.test(name) ? name : null
}

/**
 * What each Land says about publishing the Stellungnahmen it receives, in
 * its own terms; null where its page says nothing (Wien).
 */
export const LAND_PUBLICATION_NOTE: Record<LandCode, string | null> = {
  ooe: 'Das Land veröffentlicht die Stellungnahmen, sobald die Regierungsvorlage vorliegt; die von Privatpersonen nur mit deren Einwilligung.',
  sbg: 'Das Land veröffentlicht eine Stellungnahme nur mit Zustimmung derer, die sie einreichen.',
  w: null,
}

/**
 * The Länder the monitor reads, and the reader's choice among them
 * (22.10.2026).
 *
 * The choice is one value with two carriers: `?quellen=bund,sbg` in the URL, so a
 * shared link shows the same list, and a cookie, so the server renders the
 * list already chosen and nothing jumps after hydration. The URL wins where
 * it is given.
 *
 * Pure module (auto-imported; vitest imports it relatively).
 */
import type { LandCode, LandTextStation } from '../types'

/** Display order — the order the chips stand in: alphabetical, as the Länder are listed everywhere. */
export const LAND_CODES: readonly LandCode[] = ['ktn', 'ooe', 'sbg', 't', 'w']

export const LAND_NAME: Record<LandCode, string> = {
  ktn: 'Kärnten',
  ooe: 'Oberösterreich',
  sbg: 'Salzburg',
  t: 'Tirol',
  w: 'Wien',
}

/** The host a Land's documents come from, as the document list names it. */
export const LAND_HOST: Record<LandCode, string> = {
  ktn: 'ktn.gv.at',
  ooe: 'land-oberoesterreich.gv.at',
  sbg: 'service.salzburg.gv.at',
  t: 'tirol.gv.at',
  w: 'wien.gv.at',
}

/** The Land's path segment under `/entwuerfe/` — its name, as a reader types it. */
export const LAND_SLUG: Record<LandCode, string> = {
  ktn: 'kaernten',
  ooe: 'oberoesterreich',
  sbg: 'salzburg',
  t: 'tirol',
  w: 'wien',
}

/** The monitor's page of a Land's draft, from its id (`sbg-35442`). */
export function landDraftPath(land: LandCode, id: string): string {
  return `/entwuerfe/${LAND_SLUG[land]}/${id.slice(id.indexOf('-') + 1)}`
}

/**
 * Where the lists' drafts come from: the Bund (Parliament's list and RIS),
 * and each Land the monitor reads. The reader's choice among them — since
 * 22.10.2026 the Bund too, so a list can show one Land alone.
 */
export type SourceCode = 'bund' | LandCode

/** Display order: the Bund first, then the Länder. */
export const SOURCE_CODES: readonly SourceCode[] = ['bund', ...LAND_CODES]

/** What a reader sees without having chosen: the lists as they were before the Länder. */
export const DEFAULT_SOURCES: readonly SourceCode[] = ['bund']

export const SOURCE_NAME: Record<SourceCode, string> = { bund: 'Bund', ...LAND_NAME }

/** The URL parameter and the cookie that carry the choice. */
export const SOURCE_PARAM = 'quellen'
export const SOURCE_COOKIE = 'quellen'

/** A year: a choice of sources is not something one makes weekly. */
export const SOURCE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

/**
 * `"bund,sbg"` → the known codes in display order, unknown ones dropped.
 * Null for a missing value or one that names no known source: the choice is
 * never empty (`useSourceChoice`), so an empty list cannot be a choice.
 */
export function parseSourceList(value: string | null | undefined): SourceCode[] | null {
  if (value === null || value === undefined) return null
  const wanted = new Set(value.split(',').map((v) => v.trim().toLowerCase()))
  const codes = SOURCE_CODES.filter((code) => wanted.has(code))
  return codes.length ? codes : null
}

export function formatSourceList(codes: readonly SourceCode[]): string {
  return SOURCE_CODES.filter((code) => codes.includes(code)).join(',')
}

export function isDefaultSources(codes: readonly SourceCode[]): boolean {
  return formatSourceList(codes) === formatSourceList(DEFAULT_SOURCES)
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
 * The keys of a Land draft page's lazy requests (23.10.2026), as the Bund's
 * (`lawDiffKey`): the Regierungsvorlage's frame counts what the comparison
 * under it shows, from one request, and „Was das Land begründet" reads the
 * Erläuterungen the Textgegenüberstellung shows at its §§, from one request.
 * Without a key Nuxt keys a fetch by its call site — two components asked
 * twice for one document, and one component in four comparisons shared one
 * answer meant for one of them.
 */
export function landDiffKey(land: LandCode, number: string, from: LandTextStation, to: LandTextStation): string {
  return `land-diff:${land}:${number}:${from}>${to}`
}

export function landReasoningKey(land: LandCode, number: string): string {
  return `land-reasoning:${land}:${number}`
}

export function landExplanationsKey(land: LandCode, number: string): string {
  return `land-erlaeuterungen:${land}:${number}`
}

/**
 * The name a group of a Land's comparison carries (23.10.2026). The law text
 * names itself by its promulgation title — „Gesetz vom ………………, mit dem das
 * Salzburger Raumordnungsgesetz 2009 geändert wird" in the draft and the
 * Vorlage, „11. Gesetz vom 4. Februar 2026, mit dem …" in the
 * Landesgesetzblatt — so one law stood under three names in three
 * comparisons, two of them with blanks. Without the date, its blanks and the
 * Landesgesetzblatt's running number it is the title the draft carries.
 */
export function landLawGroupTitle(title: string): string {
  return title
    .replace(/^\d+\.\s+(?=(?:Landes)?(?:verfassungs)?(?:Gesetz|Verordnung|Kundmachung))/iu, '')
    .replace(/\s+vom\s+(?:[.…_\s]{3,}|\d{1,2}\.\s*\p{L}+\s+\d{4})(?=\s*,|\s+(?:über|zur|zum|betreffend|mit|des|der)\b)/u, '')
    .trim()
}

/**
 * What each Land says about publishing the Stellungnahmen it receives, in
 * its own terms; null where its page says nothing (Wien).
 */
export const LAND_PUBLICATION_NOTE: Record<LandCode, string | null> = {
  ktn: 'Das Land veröffentlicht die Stellungnahmen nach dem Ende der Begutachtung; die von Privatpersonen nur mit deren Einwilligung, die von Organisationen und öffentlichen Stellen auch ohne.',
  ooe: 'Das Land veröffentlicht die Stellungnahmen, sobald die Regierungsvorlage vorliegt; die von Privatpersonen nur mit deren Einwilligung.',
  sbg: 'Das Land veröffentlicht eine Stellungnahme nur mit Zustimmung derer, die sie einreichen.',
  t: 'Das Land veröffentlicht die eingelangten Stellungnahmen beim Gegenstand im Landtag.',
  w: null,
}

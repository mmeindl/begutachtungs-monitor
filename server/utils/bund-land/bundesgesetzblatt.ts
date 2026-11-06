/**
 * The Bund's side of a Grundsatzgesetz a Land carries out: its
 * Bundesgesetzblatt record, the Frist clause in its own words, and whether
 * a Ministerialentwurf carried its Grundsatz content (docs/architecture.md
 * §12.67).
 *
 * PURE MODULE — a RIS record, a document's HTML or a draft's text in;
 * relative imports only. The service around it is
 * `bundLandMapService.ts`.
 */
import type { BgblICitation as BgblCitation } from '../../../shared/types/bundLand'

/** „BGBl. I Nr. 44/2025" — RIS's own spelling, the exact `Bgblnummer` filter. */
export function bgblCitationDe(c: BgblCitation): string {
  return `BGBl. I Nr. ${c.number}/${c.year}`
}

/** The map's key for an act: „2025-44". */
export function bgblKeyOf(c: BgblCitation): string {
  return `${c.year}-${c.number}`
}

/** „2025-44" → { year, number }, or null. */
export function bgblOfKey(key: string): BgblCitation | null {
  const m = /^(\d{4})-(\d{1,4})$/.exec(key)
  return m ? { year: Number(m[1]), number: Number(m[2]) } : null
}

/** A Kundmachung in BGBl I, as far as the act page reads it. */
export interface BgblAct {
  /** `BGBLA_2025_I_44` */
  id: string
  /** „BGBl. I Nr. 44/2025" */
  nummer: string
  /** Ausgabedatum, ISO. */
  datum: string | null
  titel: string | null
  kurztitel: string | null
  /** The Gesetzgebungsperiode that enacted it, „XXVIII". */
  gp: string | null
  /** The Regierungsvorlagen it enacts, „128" for 128 d.B. */
  regierungsvorlagen: number[]
  /** The Initiativanträge it enacts, „3867/A". */
  initiativantraege: string[]
  /** The record's page in RIS. */
  page: string
  /** The HTML document, for the Frist clause. */
  html: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const items = (field: any): string[] => [field?.item ?? []].flat().map((v: unknown) => String(v ?? '').trim()).filter(Boolean)

/** One `BgblAuth` document reference → the act, or null without an ID. */
export function bgblActOf(ref: any): BgblAct | null {
  const m = ref?.Data?.Metadaten
  const b = m?.Bundesrecht?.BgblAuth
  const id = String(m?.Technisch?.ID ?? '')
  if (!id) return null
  const crs = [ref?.Data?.Dokumentliste?.ContentReference ?? []].flat()
  const main = crs.find((c: any) => c?.ContentType === 'MainDocument')
  const html = [main?.Urls?.ContentUrl ?? []].flat().find((u: any) => u?.DataType === 'Html')?.Url
  return {
    id,
    nummer: String(b?.Bgblnummer ?? ''),
    datum: String(b?.Ausgabedatum ?? '').slice(0, 10) || null,
    titel: String(m?.Bundesrecht?.Titel ?? '').trim() || null,
    kurztitel: String(m?.Bundesrecht?.Kurztitel ?? '').trim() || null,
    gp: String(b?.Gesetzgebungsperiode ?? '').trim() || null,
    regierungsvorlagen: items(b?.Regierungsvorlage).filter((v) => /^\d+$/.test(v)).map(Number),
    initiativantraege: items(b?.Initiativantrag).filter((v) => /^\d+\/A$/.test(v)),
    page: `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=${encodeURIComponent(id)}`,
    html: typeof html === 'string' ? html : null,
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** „128 d.B. (XXVIII. GP)", „3867/A (XXVII. GP)" — the Vorlage the act came from; null where RIS names none. */
export function vorlageDe(act: Pick<BgblAct, 'gp' | 'regierungsvorlagen' | 'initiativantraege'>): string | null {
  const gp = act.gp ? ` (${act.gp}. GP)` : ''
  const all = [...act.regierungsvorlagen.map((n) => `${n} d.B.`), ...act.initiativantraege]
  return all.length ? `${all.join(', ')}${gp}` : null
}

/** The HTML as plain text. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
}

/**
 * The Frist the Grundsatzgesetz sets the Länder, in its own words (Art. 15
 * Abs. 6 B-VG): „Die Ausführungsgesetze der Länder sind binnen eines Jahres
 * zu erlassen." — the first such sentence of the Kundmachung, or null. RIS
 * prints each Absatz twice, once with its abbreviations spelled out („gemäß
 * Absatz 8"); the sentence without a full stop inside is the one read.
 * Never a date: the clause counts from a day the act sets itself
 * („binnen sechs Monaten nach Inkrafttreten der Grundsatzbestimmungen").
 */
export function fristClauseOf(html: string): string | null {
  const m = /Die Ausführungsgesetze der Länder sind (?:binnen|bis)[^.]{1,240}? zu erlassen\./u.exec(plainText(html))
  return m ? m[0] : null
}

/** Text as compared: lower case, hyphens and spaces closed — „Sozialhilfe- Grundsatzgesetzes" holds „sozialhilfegrundsatzgesetz". */
const collapse = (text: string): string => text.toLowerCase().replace(/[\s-]+/g, '')

/** A name as compared: collapsed, the genitive dropped, so the text's genitive still holds it. */
const nameKey = (name: string): string => collapse(name).replace(/(gesetz)(?:es|s)$/, '$1')

/** A Grundsatz marker in a federal draft. */
const GRUNDSATZ_MARKER = /Grundsatzbestimmung|Grundsatzgesetz|Ausführungsgesetze? der Länder|Ausführungsgesetzgebung/u

/**
 * Whether a Ministerialentwurf carried the Grundsatz content the Länder
 * carry out — the condition to name it as their origin.
 *
 * The Länder name the law they carry out („Sozialhilfe-Grundsatzgesetz",
 * „Schulorganisationsgesetz"). The draft carried it if its own text names
 * one of those laws, and — unless the name already says „Grundsatz" — also
 * says somewhere that it sets Grundsätze. The Budgetbegleitgesetz 2025 is
 * the case this guards (where no Land draft names the act yet, a Grundsatz
 * marker in the draft's text decides alone): BGBl. I Nr. 25/2025 changed the Sozialhilfe-
 * Grundsatzgesetz, but that change came with the Regierungsvorlage (69
 * d.B.); 15/ME and 16/ME never named it, and the Länder following it must
 * not be hung on them.
 */
export function meCarriesGrundsatz(meText: string, names: readonly string[]): boolean {
  const text = collapse(meText)
  const hasMarker = GRUNDSATZ_MARKER.test(meText)
  // An act no Land has reached yet has no name from the Länder: the marker alone decides.
  if (!names.length) return hasMarker
  return names.some((n) => {
    const key = nameKey(n)
    if (!key || !text.includes(key)) return false
    return /grundsatz/i.test(n) || hasMarker
  })
}

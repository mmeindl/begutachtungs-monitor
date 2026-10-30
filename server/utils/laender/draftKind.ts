import type { LandDraftKind } from '#shared/types'

/**
 * Gesetz or Verordnung, from the title, where the Land's list does not say
 * (Burgenland's running list, Niederösterreich, 30.10.2026): the first of the
 * two words the title names. „Entwurf eines Gesetzes, mit dem …" and
 * „NÖ Sozialbetreuungsberufe-Ausbildungsverordnung 2007, Änderung" decide
 * themselves; „Verordnung, mit der … des Kinder- und Jugendhilfegesetzes …"
 * names the Verordnung first. A title naming neither is a Gesetz, as most
 * drafts are.
 */
export function draftKindOfTitle(title: string): LandDraftKind {
  const first = /verordnung|gesetz/i.exec(title)?.[0]
  return first && /^verordnung$/i.test(first) ? 'verordnung' : 'gesetz'
}

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTHS_DE = ['jänner', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

function iso(y: number, m: number, d: number): string | null {
  const out = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const date = new Date(`${out}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(out) ? out : null
}

/**
 * A date as the Länder's pages write it — „05.11.2026", „2026-11-05",
 * „10. November 2026" (Vorarlberg) or „Nov 5, 2026" (Burgenland's Domino
 * server, which formats in English) — as an ISO date; null for anything
 * else, which the caller's gate then refuses.
 */
export function landDate(text: string): string | null {
  const s = text.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2})\.\s*(\p{L}+)\s+(\d{4})$/u.exec(s)
  if (m) {
    const month = MONTHS_DE.indexOf(m[2]!.toLowerCase().replace(/^januar$/, 'jänner'))
    return month < 0 ? null : iso(Number(m[3]), month + 1, Number(m[1]))
  }
  m = /^(\p{L}{3})\p{L}*\.?\s+(\d{1,2}),\s*(\d{4})$/u.exec(s)
  if (m) {
    const month = MONTHS_EN.indexOf(m[1]!.toLowerCase())
    return month < 0 ? null : iso(Number(m[3]), month + 1, Number(m[2]))
  }
  return null
}

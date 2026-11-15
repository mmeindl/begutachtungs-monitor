/**
 * The laws a text names in its own title — „Bundesverfassungsgesetz, mit dem
 * das Bundes-Verfassungsgesetz geändert wird" — for the one case where its
 * clauses name none.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The RIS
 * read it is given is `lawtext/amendedLawsService.ts`.
 *
 * The B-VG's Promulgationsklausel cites no Stammnorm („Art. 42 Abs. 2 wird
 * folgender Satz angefügt:", 51 d.B. XXVII, 53 d.B. XXIV), and a motion's
 * Artikel can open on the instruction without any clause (1859 d.B. XXVII).
 * The title still says which law: in the one fixed shape a law names what
 * it amends, read here and nowhere looser.
 *
 * **A name is taken only where RIS knows a law by exactly that name**
 * (`pickLawByName`): its Kurztitel or its Abkürzung equal to the title's, and
 * one law with it. „das Allgemeine Sozialversicherungsgesetz" is not the
 * Kurztitel „Allgemeines Sozialversicherungsgesetz", and it stays unread — a
 * near name is a different law as often as not (`misquotedStammnorm`,
 * `ris/konsLaw.ts`, holds the same line).
 */
import type { BgblCitation } from './bgblCitation'
import { normalizeText } from './normalize'

/**
 * „Bundesgesetz, mit dem das X [, das Y …] und das Z geändert wird|werden" —
 * the whole title, nothing before the Bundesgesetz and nothing after the
 * verb. „abgeändert" is the same verb (627 d.B. XXVI). A title that also
 * enacts or repeals („… erlassen und das Y geändert wird") yields a piece
 * no law is named by, and so nothing at all.
 *
 * An EU act's title never fits: it says „zur Änderung der Verordnung (EU) …",
 * not „mit dem … geändert wird" (120/ME XXVIII, 352/ME XXVII).
 */
const TITLE_RE = /^(?:Bundes(?:verfassungs)?gesetz|Bundes-Verfassungsgesetz)\s*,?\s+mit\s+dem\s+((?:das|die|der)\s.+?)\s+(?:ab)?geändert\s+(?:wird|werden)\s*\.?$/i

/** The list of a title's laws, or null where the title is not that shape. */
export function lawListOfTitle(title: string): string | null {
  return TITLE_RE.exec(normalizeText(title).replace(/\s+/g, ' ').trim())?.[1] ?? null
}

/** Where a list of laws may part: „, das …", „ und die …" — outside brackets. */
function separators(list: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const re = /(?:\s*,\s*(?:und\s+|sowie\s+)?|\s+(?:und|sowie)\s+)(?=(?:das|die|der)\s)/gi
  for (let m = re.exec(list); m; m = re.exec(list)) {
    const before = list.slice(0, m.index)
    const depth = (before.match(/\(/g)?.length ?? 0) - (before.match(/\)/g)?.length ?? 0)
    if (depth === 0) out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

/** How many places a list may part at before the reading refuses: each split is a RIS query. */
const MAX_SEPARATORS = 6

/**
 * The laws of a title's list, in printed order, each named by `resolve` —
 * or null unless every piece of the list names a law.
 *
 * „und die" parts a list and also stands inside a name („Bundesgesetz über
 * die Gleichbehandlungskommission und die Gleichbehandlungsanwaltschaft"),
 * so the split is not decided by the words: a reading of the list is taken
 * where every piece names exactly one law (`resolve`), and a list no reading
 * covers names nothing. Never a part: a list read half would state that the
 * text amends fewer laws than it says.
 */
export async function lawsOfTitleList<T>(list: string, resolve: (piece: string) => Promise<T | null>): Promise<T[] | null> {
  const seps = separators(list)
  if (seps.length > MAX_SEPARATORS) return null
  const bounds = [0, ...seps.map((s) => s.end)]
  const ends = [...seps.map((s) => s.start), list.length]
  const memo = new Map<string, Promise<T | null>>()
  const named = (from: number, to: number): Promise<T | null> => {
    const piece = list.slice(bounds[from]!, ends[to]!)
    let p = memo.get(piece)
    if (!p) memo.set(piece, (p = resolve(piece)))
    return p
  }
  // Pieces from separator boundary `from` to `to`, shortest first.
  const walk = async (from: number): Promise<T[] | null> => {
    for (let to = from; to < ends.length; to++) {
      const law = await named(from, to)
      if (law === null) continue
      if (to === ends.length - 1) return [law]
      const rest = await walk(to + 1)
      if (rest) return [law, ...rest]
    }
    return null
  }
  return walk(0)
}

/** A law as one piece of the list names it. */
export interface TitleLawName {
  /** „Bundes-Gleichbehandlungsgesetz", „Bundes-Verfassungsgesetz". */
  name: string
  /** „B-GlBG" — where the piece prints one. */
  abbreviation: string | null
}

/**
 * One piece of the list → the name to look up.
 *
 * „das Bundesgesetz über die Gleichbehandlung im Bereich des Bundes
 * (Bundes-Gleichbehandlungsgesetz - B-GlBG)" names the law in its brackets,
 * the way a clause does (`clauseNameOf`); „das Sozialversicherungs-
 * Organisationsgesetz (SV-OG) in der Fassung des BGBl. I Nr. 100/2018" cites
 * a version, which is no part of the name. A piece that quotes an EU act is
 * no Austrian law and is refused here rather than searched for.
 */
export function titleLawName(piece: string): TitleLawName | null {
  let s = piece.replace(/\s+/g, ' ').trim().replace(/^(?:das|die|der)\s+/i, '')
  s = s.replace(/,?\s+in der Fassung\b.*$/i, '').replace(/,?\s+(?:d?RGBl|BGBl|StGBl|JGS)\b.*$/i, '').trim()
  if (!s || /\((?:EU|EG|EWG|Euratom)\)|\bRichtlinie\b|\bVerordnung\s*\(/i.test(s)) return null
  const paren = /\(([^()]+?)\)\s*$/.exec(s)
  if (paren) {
    const inner = paren[1]!.trim()
    const dash = /^(.+?)\s+[-–]\s+(\S+(?:\s+\d{4})?)$/.exec(inner)
    // „(SV-OG)" after the full name is the abbreviation; „(Bundes-
    // Gleichbehandlungsgesetz - B-GlBG)" is the short title and abbreviation.
    if (dash) return { name: dash[1]!.trim(), abbreviation: dash[2]!.trim() }
    const outside = s.slice(0, paren.index).trim()
    return /\s/.test(inner) || /gesetz|ordnung|buch/i.test(inner) ? { name: inner, abbreviation: null } : { name: outside, abbreviation: inner }
  }
  const dash = /^(.+?)\s+[-–]\s+(\S+(?:\s+\d{4})?)$/.exec(s)
  return dash ? { name: dash[1]!.trim(), abbreviation: dash[2]!.trim() } : { name: s, abbreviation: null }
}

/** One consolidated § version as a search by title returns it. */
export interface NamedRecord {
  gesetzesnummer: string
  kurztitel: string
  abkuerzung: string
  stammnorm: BgblCitation
}

const norm = (s: string) => normalizeText(s).replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The one law RIS holds under exactly this name — its Kurztitel equal to the
 * name, or its Abkürzung equal to the abbreviation (or to a name that is
 * one: „das B-VG") — and its Stammnorm; null for none or for two.
 *
 * A law's records can carry two Stammnormen: one § of the
 * Bundes-Gleichbehandlungsgesetz stands in RIS under BGBl. I Nr. 135/2009,
 * 79 under BGBl. Nr. 100/1993 (read 14.11.2026). The Stammnorm most of its
 * records carry is the law's; the lookup that follows (`resolveKonsLaw`)
 * checks it against RIS again.
 */
export function pickLawByName(records: readonly NamedRecord[], law: TitleLawName): { gesetzesnummer: string; kurztitel: string; stammnorm: BgblCitation } | null {
  const name = norm(law.name)
  const abbreviation = law.abbreviation ? norm(law.abbreviation) : null
  const byLaw = new Map<string, { kurztitel: string; counts: Map<string, { stammnorm: BgblCitation; n: number }> }>()
  for (const r of records) {
    const named = norm(r.kurztitel) === name || (r.abkuerzung !== '' && (norm(r.abkuerzung) === name || norm(r.abkuerzung) === abbreviation))
    if (!named) continue
    const entry = byLaw.get(r.gesetzesnummer) ?? { kurztitel: r.kurztitel, counts: new Map() }
    const key = `${r.stammnorm.organ}|${r.stammnorm.nummer}`
    const c = entry.counts.get(key) ?? { stammnorm: r.stammnorm, n: 0 }
    c.n++
    entry.counts.set(key, c)
    byLaw.set(r.gesetzesnummer, entry)
  }
  if (byLaw.size !== 1) return null
  const [gesetzesnummer, entry] = [...byLaw][0]!
  const ranked = [...entry.counts.values()].sort((a, b) => b.n - a.n)
  // Two Stammnormen held by as many records each: no reading of which is the law's.
  if (ranked.length > 1 && ranked[0]!.n === ranked[1]!.n) return null
  return { gesetzesnummer, kurztitel: entry.kurztitel, stammnorm: ranked[0]!.stammnorm }
}

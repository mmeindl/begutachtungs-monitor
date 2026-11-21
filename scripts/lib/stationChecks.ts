/**
 * What the § comparison must hold for every pair it shows, as checks a
 * harness and a test can both run (`scripts/harness/station.ts`).
 *
 * PURE MODULE — relative imports only: the logic of a CLI script is logic no
 * test reaches, so the script only loads documents and pours the result out.
 *
 * Four properties, each one a promise the page makes without saying so:
 *
 *  - **Reconstruction.** A changed unit's runs ARE its two texts: the equal
 *    and removed words read the earlier text word for word, the equal and
 *    inserted words the later one — the inserted ones exactly, the equal ones
 *    up to `compareToken`, because an equal word is shown in the earlier
 *    text's spelling (`diffTokens`). A run that drops, doubles or reorders a
 *    word shows a text no document has.
 *  - **Completeness.** Every unit of each side stands in the result exactly
 *    once, or its law is named in a list (`lawsOnlyInFrom`, `lawsOnlyInTo`).
 *    Leftovers of a commencement Artikel are counted apart: `lawsOf` leaves
 *    those out of the lists on purpose (`COMMENCEMENT_ARTICLE`). They are
 *    left out unsaid unless the page says that only what both texts carry is
 *    compared — the sentence on the laws only the later text carries
 *    (`mergedLawsNote`: „verglichen wird deshalb, was in beiden Texten
 *    steht"), which stands only where `lawsOnlyInTo` names a law. Without it
 *    a leftover is a breach (21.11.2026).
 *  - **Symmetry.** Compared the other way round, the same units pair. A pair
 *    that only one direction makes is the alignment's tie-break deciding what
 *    the reader is shown.
 *  - **A visible change.** A unit called „geändert" with segments shows at
 *    least one removed or inserted run.
 *
 * And the residue: every unit of a pair that should be identical — the last
 * parliamentary text against the Kundmachung, one draft read from
 * Parliament's HTML against the same draft read from RIS XML — that is not
 * „unverändert". Each one is a reader artefact or a real difference, and a
 * count cannot tell which, so each is listed with its pieces (`residueOf`).
 */
import type { LawDiffSegment, LawDiffUnit, LawPackageEntry } from '../../shared/types'
import { compareToken, displayTokens } from '../../server/utils/lawtext/normalize'

/** The fields of a parsed unit these checks read — `LawUnit` has more. */
export interface UnitLike {
  article: string | null
  id: string
  text: string
}

/** A parsed unit with its heading — the instruction line of a Ziffer, a § heading. */
export interface HeadedUnit extends UnitLike {
  heading: string | null
}

/**
 * Every unit the later text has a part in carries the later text's heading.
 *
 * `diffAtSamePlace` pairs a reworded instruction by giving the later unit
 * the earlier one's instruction line; the result must not keep it, or the
 * Ausschuss's unit is titled with the Vorlage's „Abs. 1n" where its own line
 * says „Abs. 1p" (1/ME XXVIII, Tilgungsgesetz 1972 Z 2).
 */
export function headingBreaches(to: readonly HeadedUnit[], diff: PackageLike): Breach[] {
  const own = new Map<string, (string | null)[]>()
  for (const u of to) {
    const key = unitKey(u.article, u.id, u.text)
    own.set(key, [...(own.get(key) ?? []), u.heading])
  }
  const out: Breach[] = []
  for (const u of diff.units) {
    if (u.change === 'removed') continue
    const headings = own.get(unitKey(u.article, u.id, u.toText))
    if (headings && !headings.includes(u.heading)) out.push({ kind: 'überschrift', unit: label(u), detail: `trägt „${(u.heading ?? '∅').slice(0, 60)}", der eigene Text „${(headings[0] ?? '∅').slice(0, 60)}"` })
  }
  return out
}

/** The fields of `diffLawPackage`'s result these checks read. */
export interface PackageLike {
  units: readonly LawDiffUnit[]
  lawsOnlyInFrom: readonly LawPackageEntry[]
  lawsOnlyInTo: readonly LawPackageEntry[]
}

export type BreachKind = 'rekonstruktion' | 'vollständigkeit' | 'symmetrie' | 'ohne-änderung' | 'überschrift'

export interface Breach {
  kind: BreachKind
  /** `article · fromId→id`, enough to find the unit on the page. */
  unit: string
  detail: string
}

const label = (u: Pick<LawDiffUnit, 'article' | 'fromId' | 'id'>): string => `${(u.article ?? '—').slice(0, 60)} · ${u.fromId ?? '—'}→${u.id}`

const words = (segments: readonly LawDiffSegment[], keep: (t: LawDiffSegment['type']) => boolean): { word: string; type: LawDiffSegment['type'] }[] =>
  segments.filter((s) => keep(s.type)).flatMap((s) => s.text.split(' ').filter(Boolean).map((word) => ({ word, type: s.type })))

/** The first index at which two word lists part, or -1 where they agree. */
function firstMismatch(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length)
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return k
  return -1
}

/** Reconstruction and a visible change, for every changed unit that has segments. */
export function reconstructionBreaches(units: readonly LawDiffUnit[]): Breach[] {
  const out: Breach[] = []
  for (const u of units) {
    if (u.change !== 'changed' || !u.segments) continue
    if (!u.segments.some((s) => s.type !== 'equal')) {
      out.push({ kind: 'ohne-änderung', unit: label(u), detail: 'geändert, aber kein Lauf ist entfernt oder eingefügt' })
    }
    const left = words(u.segments, (t) => t !== 'inserted').map((w) => w.word)
    const fromWords = displayTokens(u.fromText ?? '')
    const atLeft = firstMismatch(left, fromWords)
    if (atLeft >= 0) {
      out.push({ kind: 'rekonstruktion', unit: label(u), detail: `links ab Wort ${atLeft}: „${left[atLeft] ?? '∅'}" statt „${fromWords[atLeft] ?? '∅'}"` })
    }
    const right = words(u.segments, (t) => t !== 'removed')
    const toWords = displayTokens(u.toText ?? '')
    const shown = right.map((w) => (w.type === 'inserted' ? w.word : compareToken(w.word)))
    const expected = toWords.map((w, k) => (right[k]?.type === 'inserted' ? w : compareToken(w)))
    const atRight = firstMismatch(shown, expected)
    if (atRight >= 0) {
      out.push({ kind: 'rekonstruktion', unit: label(u), detail: `rechts ab Wort ${atRight}: „${right[atRight]?.word ?? '∅'}" statt „${toWords[atRight] ?? '∅'}"` })
    }
  }
  return out
}

/** What a unit is, for the multiset the completeness check consumes. */
const unitKey = (article: string | null, id: string | null, text: string | null): string => `${article ?? ''}\u0001${id ?? ''}\u0001${text ?? ''}`

export interface Completeness {
  breaches: Breach[]
  /** Units of a commencement Artikel only one side carries: left out by `lawsOf`, on purpose. */
  commencementLeftOut: { side: 'from' | 'to'; article: string; units: number }[]
}

/**
 * Every unit of `from` and `to` once in the result, or under a named law.
 *
 * `isCommencement` is `lawDiff.ts`'s own test, passed in so this module
 * imports nothing that decides.
 */
export function completeness(from: readonly UnitLike[], to: readonly UnitLike[], diff: PackageLike, isCommencement: (article: string) => boolean): Completeness {
  const bag = (units: readonly UnitLike[]) => {
    const m = new Map<string, number>()
    for (const u of units) m.set(unitKey(u.article, u.id, u.text), (m.get(unitKey(u.article, u.id, u.text)) ?? 0) + 1)
    return m
  }
  const left = { from: bag(from), to: bag(to) }
  const breaches: Breach[] = []
  const take = (side: 'from' | 'to', keys: string[], u: LawDiffUnit) => {
    const key = keys.find((k) => (left[side].get(k) ?? 0) > 0)
    if (key) left[side].set(key, left[side].get(key)! - 1)
    else breaches.push({ kind: 'vollständigkeit', unit: label(u), detail: `${side === 'from' ? 'links' : 'rechts'} im Ergebnis, aber nicht (oder nicht so oft) im Text` })
  }
  for (const u of diff.units) {
    // A unit names the earlier side's Artikel only where it has one that
    // differs (`toUnit`): an earlier side without any title files under the
    // later one's.
    if (u.change !== 'inserted') take('from', [unitKey(u.fromArticle ?? u.article, u.fromId ?? u.id, u.fromText), unitKey(null, u.fromId ?? u.id, u.fromText)], u)
    if (u.change !== 'removed') take('to', [unitKey(u.article, u.id, u.toText)], u)
  }
  const commencementLeftOut: Completeness['commencementLeftOut'] = []
  for (const side of ['from', 'to'] as const) {
    const named = new Map((side === 'from' ? diff.lawsOnlyInFrom : diff.lawsOnlyInTo).map((e) => [e.article, e.units]))
    const byArticle = new Map<string, number>()
    for (const [key, n] of left[side]) {
      if (n <= 0) continue
      const article = key.split('\u0001')[0]!
      byArticle.set(article, (byArticle.get(article) ?? 0) + n)
    }
    for (const [article, n] of byArticle) {
      if (named.get(article) === n) continue
      if (article && isCommencement(article) && !named.has(article) && diff.lawsOnlyInTo.length) {
        commencementLeftOut.push({ side, article, units: n })
        continue
      }
      breaches.push({
        kind: 'vollständigkeit',
        unit: `${(article || '—').slice(0, 60)}`,
        detail: `${n} Einheit(en) ${side === 'from' ? 'links' : 'rechts'} weder im Ergebnis noch als Gesetz genannt${named.has(article) ? ` (genannt mit ${named.get(article)})` : ''}`,
      })
    }
  }
  return { breaches, commencementLeftOut }
}

/**
 * The pairs one direction makes and the other does not, keyed by the two
 * texts — `forward` compares A with B, `backward` B with A.
 */
export function symmetryBreaches(forward: PackageLike, backward: PackageLike): Breach[] {
  const paired = (units: readonly LawDiffUnit[], swap: boolean) => {
    const m = new Map<string, LawDiffUnit>()
    for (const u of units) {
      if (u.change !== 'changed' && u.change !== 'unchanged') continue
      m.set(swap ? `${u.toText}\u0001${u.fromText}` : `${u.fromText}\u0001${u.toText}`, u)
    }
    return m
  }
  const f = paired(forward.units, false)
  const b = paired(backward.units, true)
  const out: Breach[] = []
  for (const [key, u] of f) if (!b.has(key)) out.push({ kind: 'symmetrie', unit: label(u), detail: 'nur vorwärts gepaart' })
  for (const [key, u] of b) if (!f.has(key)) out.push({ kind: 'symmetrie', unit: label(u), detail: 'nur rückwärts gepaart' })
  return out
}

/** One unit of a pair that should be identical and is not. */
export interface Residue {
  unit: string
  change: LawDiffUnit['change']
  editorial: boolean
  /** The removed and inserted runs with a few equal words around them; empty for an inserted or removed unit. */
  pieces: string[]
  /** The word diff hit its ceiling: no pieces to read. */
  ceiling: boolean
}

/** A run with the equal words around it, „…vor ⟦-alt⟧ nach…". */
function pieceOf(segments: readonly LawDiffSegment[], k: number): string {
  const before = segments[k - 1]?.type === 'equal' ? segments[k - 1]!.text.split(' ').slice(-4).join(' ') : ''
  const after = segments[k + 1]?.type === 'equal' ? segments[k + 1]!.text.split(' ').slice(0, 4).join(' ') : ''
  const s = segments[k]!
  return `…${before} ⟦${s.type === 'removed' ? '-' : '+'}${s.text.slice(0, 120)}⟧ ${after}…`
}

/** The units of a null comparison that are not unchanged, each with its pieces. */
export function residuesOf(units: readonly LawDiffUnit[]): Residue[] {
  return units
    .filter((u) => u.change !== 'unchanged')
    .map((u) => ({
      unit: label(u),
      change: u.change,
      editorial: u.editorial,
      pieces: u.segments ? u.segments.flatMap((s, k) => (s.type === 'equal' ? [] : [pieceOf(u.segments!, k)])) : [],
      ceiling: u.change === 'changed' && !u.segments,
    }))
}

/** What `--baseline` finds of the badges: moved either way, and changed units that came or went. */
export interface BadgeMoves {
  moved: [key: string, from: string, to: string][]
  came: string[]
  went: string[]
}

/**
 * The badge of every changed unit against a baseline's (`station.ts
 * --baseline`). Null where the baseline carries no badges: until 20.11.2026
 * `stationBaseline.json` had none, and the run reported „0 bewegt" against
 * nothing — a comparison that could not fail.
 */
export function badgeMoves(before: Readonly<Record<string, string>> | undefined, now: Readonly<Record<string, string>>): BadgeMoves | null {
  if (!before) return null
  return {
    moved: Object.entries(now).filter(([key, v]) => before[key] !== undefined && before[key] !== v).map(([key, v]) => [key, before[key]!, v]),
    came: Object.keys(now).filter((key) => before[key] === undefined),
    went: Object.keys(before).filter((key) => now[key] === undefined),
  }
}

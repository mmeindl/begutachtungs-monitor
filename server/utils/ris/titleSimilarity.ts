/**
 * Title normalisation and similarity — the toolkit the RIS↔ME join was
 * calibrated on, borrowed since by `related.ts`, `precedingDraft.ts` and
 * `bgblJoin.ts` rather than re-derived per caller.
 *
 * PURE MODULE — no Nuxt auto-imports, no I/O, so vitest can execute it
 * directly. Every threshold that reads these numbers is measured
 * (docs/ris-join.md); changing a stop word or a stem changes four joins at
 * once.
 */

const STOP = new Set(
  `ministerialentwurf betreffend entwurf eines eine einer ein des der die das den dem mit und sowie wird werden geändert geaendert aenderung änderung änderungen erlassen erlassung bundesgesetz bundesgesetzes bundesgesetze bg über ueber zur zum für fuer im in an auf von vom durch bundesministers bundesministerin bundesministeriums bundesminister ua bzw sonstige weitere andere weiterer anderer aufhebung aufgehoben begutachtung`.split(
    /\s+/,
  ),
)
const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'])

/**
 * Parliament appends package abbreviations as " – ABK" segments
 * ("Sanktionengesetz 2024 – SanktG"). Returns the core title and the set of
 * abbreviations (lower-cased).
 */
export function splitParliamentTitle(title: string): { core: string; abks: Set<string> } {
  const core: string[] = []
  const abks = new Set<string>()
  for (const part of (title ?? '').split(';')) {
    const segs = part.split(/\s[–—]\s/).map((s) => s.trim())
    core.push(segs[0] ?? '')
    for (const s of segs.slice(1)) {
      if (s.length <= 30 && !/\s(des|der|die|das|und|mit|über)\s/.test(s.toLowerCase())) {
        abks.add(s.toLowerCase().replace(/\s+/g, ' '))
      } else {
        core.push(s)
      }
    }
  }
  return { core: core.join('; '), abks }
}

export function normalizeTitleText(s: string | null | undefined): string {
  let t = (s ?? '').normalize('NFC').toLowerCase().replace(/ß/g, 'ss')
  t = t.replace(/ministerialentwurf betreffend/g, '')
  t = t.replace(/\bu\.a\.?/g, '')
  t = t.replace(/[–—\-/;:,.()[\]„“"'’‚‘§]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

function stem(t: string): string {
  t = t.replace(/(gesetz|buch|statut|vertrag|gesetzbuch|kodex|ordnung)es$/, '$1')
  t = t.replace(/(gesetz|gesetzbuch|buch)s$/, '$1')
  return t
}

const tokenCache = new Map<string, string[]>()

/** Ordered, stemmed, stop-word-free tokens of a title. */
export function titleTokens(s: string | null | undefined): string[] {
  const key = s ?? ''
  const hit = tokenCache.get(key)
  if (hit) return hit
  const out: string[] = []
  for (const t of normalizeTitleText(key).split(' ')) {
    if (!t || STOP.has(t)) continue
    if (t.length === 1 && !ROMAN.has(t) && !/^\d$/.test(t)) continue
    const m = /^(.{6,}?)(novelle|paket)$/.exec(t)
    if (m) {
      out.push(stem(m[1]!), m[2]!)
      continue
    }
    out.push(stem(t))
  }
  tokenCache.set(key, out)
  return out
}

function tokenSet(s: string | null | undefined): Set<string> {
  return new Set(titleTokens(s))
}

function softMatch(a: string, b: string): boolean {
  if (a === b) return true
  return a.length >= 8 && b.length >= 8 && (a.startsWith(b) || b.startsWith(a))
}

/** Count of tokens in A that have a soft match in B. */
function softIntersection(A: Set<string>, B: Set<string>): number {
  let n = 0
  for (const a of A) {
    for (const b of B) {
      if (softMatch(a, b)) {
        n++
        break
      }
    }
  }
  return n
}

export const round3 = (x: number) => Math.round(x * 1000) / 1000

export interface TitleComponents {
  jac: number
  cont: number
  covMe: number
  lcp: number
  nA: number
  nB: number
}

const componentCache = new Map<string, TitleComponents>()

/**
 * Similarity components between the ME core title and one RIS title field.
 * `cont` (containment of the shorter side) is the load-bearing number;
 * Jaccard alone fails because RIS enumerates every amended law.
 */
export function titleComponents(meCore: string, risText: string): TitleComponents {
  const key = `${meCore}\0${risText}`
  const cached = componentCache.get(key)
  if (cached) return cached
  const A = tokenSet(meCore)
  const B = tokenSet(risText)
  let result: TitleComponents
  if (A.size === 0 || B.size === 0) {
    result = { jac: 0, cont: 0, covMe: 0, lcp: 0, nA: A.size, nB: B.size }
  } else {
    const ia = softIntersection(A, B)
    const ib = softIntersection(B, A)
    const union = A.size + B.size - Math.min(ia, ib)
    const jac = union ? Math.min(ia, ib) / union : 0
    const minSize = Math.min(A.size, B.size)
    const cont = minSize ? Math.min(ia, ib) / minSize : 0
    const covMe = ia / A.size
    const a = titleTokens(meCore).join(' ')
    const b = titleTokens(risText).join(' ')
    let n = 0
    const len = Math.min(a.length, b.length)
    while (n < len && a[n] === b[n]) n++
    const lcp = a && b ? n / len : 0
    result = { jac: round3(jac), cont: round3(cont), covMe: round3(covMe), lcp: round3(lcp), nA: A.size, nB: B.size }
  }
  componentCache.set(key, result)
  return result
}

const DAY_MS = 86_400_000

/** Days between two ISO dates (b − a). Both must be `YYYY-MM-DD`. */
export function daysBetween(a: string, b: string): number {
  const pa = a.slice(0, 10).split('-').map(Number)
  const pb = b.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)
  const tb = Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!)
  return Math.round((tb - ta) / DAY_MS)
}

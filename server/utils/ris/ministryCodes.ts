/**
 * The one reader of RIS's `"CODE (long name)"` Einbringende Stelle — the
 * code, the long name, and how close two ministries are to each other.
 *
 * PURE MODULE — no Nuxt auto-imports, no I/O, so vitest can execute it
 * directly. `MINISTRY_LINEAGE` is measured per GP and feeds the join's
 * ministry weight.
 */

/** RIS spells some codes without umlauts. */
const SPELLING: Record<string, string> = { BMKOES: 'BMKÖS' }

/**
 * Ministry lineage groups for GP XXVII (competence moves, state-secretary
 * drafts filed under BKA). Derived from co-occurrence on the corpus — must
 * be re-derived per GP and its exceptions reviewed: every new government
 * brings new codes, and a hardcoded group is wrong for the next one.
 */
const MINISTRY_LINEAGE: readonly (readonly string[])[] = [
  ['BMA', 'BMAW', 'BMDW', 'BMAFJ', 'BMASGK'],
  ['BMSGPK', 'BMASGK', 'BMAFJ'],
  ['BMLRT', 'BML', 'BMNT', 'BMK'],
  ['BMVIT', 'BMK', 'BMNT'],
  ['BMJ', 'BMVRDJ'],
  ['BKA', 'BMEUV', 'BMFFIM', 'BMVRDJ', 'BMKÖS'],
  // GP XXVIII (government of March 2025): successor codes
  ['BMBWF', 'BMB', 'BMFWF'],
  ['BMK', 'BMLUK', 'BMIMI', 'BML'],
  ['BMSGPK', 'BMASGPK'],
  ['BMAW', 'BMWET', 'BMWKMS', 'BMDW'],
  ['BKA', 'BMEIF'],
]

/** "BKA (Bundeskanzleramt)" → "BKA"; two long-name-only variants mapped by hand. */
export function ministryCodeOf(stelle: string | null): string {
  const m = /^([A-ZÄÖÜ]{2,8})\s*\(/.exec(stelle ?? '')
  if (m) return m[1]!
  const s = (stelle ?? '').toLowerCase()
  if (s.includes('eu und verfassung')) return 'BMEUV'
  if (s.includes('frauen, familie, integration und medien')) return 'BMFFIM'
  if (s.includes('europa, integration und familie')) return 'BMEIF'
  return stelle ?? ''
}

/* The long name's reader, `ministryNameOf`, lives in
 * `shared/utils/searchHaystack.ts` since 12.11.2026: the search's strike
 * tokens need it, and they are built in the browser now too. */

export function ministryScore(meCodes: ReadonlySet<string>, risCode: string): number {
  const rc = SPELLING[risCode] ?? risCode
  if (meCodes.has(rc)) return 1
  for (const g of MINISTRY_LINEAGE) {
    if (g.includes(rc) && [...meCodes].some((c) => g.includes(c))) return 0.5
  }
  return 0
}

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
  // Energy went from the BMK to the BMWET (measured 14.11.2026: the draft
  // „EAG-Investitionszuschüsseverordnung-Strom-Novelle 2025" is the BMK's,
  // BGBl. II Nr. 76/2025 under the same title the BMWET's). A group of its
  // own: the BMK's other successors are not the BMWET's kin.
  ['BMK', 'BMWET'],
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

/**
 * BOTH sides are spelled the same way before they are compared. Until
 * 14.11.2026 only `risCode` was: the draft → BGBl. II join passes two RIS
 * codes, so „BMKOES" on the draft never met „BMKOES" on the Kundmachung, and
 * two Verordnungen der Bundesregierung (BGBl. II Nr. 214/2024, 215/2024)
 * counted as a foreign Ressort's.
 */
export function ministryScore(meCodes: ReadonlySet<string>, risCode: string): number {
  const rc = SPELLING[risCode] ?? risCode
  const own = [...meCodes].map((c) => SPELLING[c] ?? c)
  if (own.includes(rc)) return 1
  for (const g of MINISTRY_LINEAGE) {
    if (g.includes(rc) && own.some((c) => g.includes(c))) return 0.5
  }
  return 0
}
